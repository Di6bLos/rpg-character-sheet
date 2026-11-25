// Reads what a Pathfinder 2e ability does from its rules text, the way Nimble's abilities are
// read in utils/nimblePlay.ts: its action cost (Player Core p. 9), frequency, trigger and
// requirements (p. 15), whether it makes a Strike or calls for a check (and against which DC),
// the dice it deals or heals by level, temporary Hit Points, the conditions it gives, and the
// numbers it changes on the hero (bonuses and penalties p. 400, resistance p. 408, degrees of
// success p. 401, proficiency increases p. 11). Actions an ability grants ("## Rage ◆",
// "**Activate—Tactical Retreat** ↺") are read as abilities of their own. Pure: the Actions
// panel (components/pf2e/SheetActions.vue) uses it, and utils/pf2eEffects.ts turns the numbers
// into effects. `PF2E_RULE_PATTERNS` holds every pattern; tests/pf2eAbilityRules.test.ts checks
// each still matches some ability in data/pf2e.
import type {
  Pf2eActionCost,
  Pf2eAmount,
  Pf2eDegreeName,
  Pf2eEnds,
  Pf2eSelector,
} from '~/data/pf2e/types'
import type { Pf2eRank } from '~/types/sheets'

/** What an ability takes to use: 1–3 actions (or a range), a reaction, a free action, or time. */
export type Pf2eCost =
  | { kind: 'actions'; min: number; max: number }
  | { kind: 'reaction' }
  | { kind: 'free' }
  | { kind: 'time'; text: string }

/** How often uses come back: each turn, round, minute, 10 minutes, hour or day. */
export type Pf2ePeriod = 'turn' | 'round' | 'minute' | '10min' | 'hour' | 'day' | 'week'

export interface Pf2eFrequency {
  period: Pf2ePeriod
  times: number
  /** As the book words it. */
  text: string
  /** A limit per target ("immune to your Battle Medicine for 1 day"). */
  perTarget?: boolean
}

export interface Pf2eStrikeRule {
  melee?: boolean
  ranged?: boolean
  /** Strikes it makes (Twin Takedown: 2). */
  count: number
  /** Strides before the Strike (Sudden Charge: 2). */
  strides: number
  /**
   * Attacks it counts as for the multiple attack penalty: 2 (Vicious Swing), 3 (Overwhelming
   * Blow), 0 (Reactive Strike).
   */
  mapCount: number
  /** It doesn't count when it gets this degree (Exacting Strike's failure, Player Core p. 140). */
  mapNoneOn?: Pf2eDegreeName
  /** The multiple attack penalty doesn't apply to it. */
  ignoreMap?: boolean
  /** Extra weapon damage dice on a hit, by level (Vicious Swing: 1, 2 at 10th, 3 at 18th). */
  extraDice?: [level: number, dice: number][]
  /** Unarmed Strikes only (Flurry of Blows). */
  unarmed?: boolean
  /** Strikes of these damage types only (Bleeding Finisher: slashing or piercing). */
  damageTypes?: string[]
  /** Each Strike at the current multiple attack penalty, not one after the other (Double Slice). */
  sameMap?: boolean
  /** One Strike with each of two weapons (Double Slice). */
  twoWeapons?: boolean
  /** Penalty on the second Strike when its weapon isn't agile (Double Slice: 2). */
  secondPenalty?: number
  /** The Strikes' damage is combined (Double Slice, Flurry of Blows). */
  combine?: boolean
}

export interface Pf2eCheckRule {
  /** Skills it may use; "Perception"; ["any"] for "a skill check"; ["flat"] for a flat check. */
  skills: string[]
  /** "Will DC", "Fortitude DC", "Reflex DC", "Perception DC", "AC". */
  against?: string
  /** A fixed DC ("a DC 15 Medicine check"). */
  dc?: number
  /** Treat Wounds' table: the DC to pick by proficiency, and the healing it adds. */
  tiers?: { rank: Pf2eRank; dc: number; bonus: number }[]
  /** Has the attack trait: the multiple attack penalty applies and it counts (p. 418). */
  attack?: boolean
}

/** Dice the ability rolls, at a level: `diceAt` gives the expression. */
export interface Pf2eDiceRule {
  dice: string
  type?: string
  persistent?: boolean
  heal?: boolean
  /** Only on this degree of success of the ability's check. */
  degree?: Pf2eDegreeName
  /** "increases by 1d6 at 5th level and every 4 levels thereafter". */
  every?: { from: number; step: number; add: string }
  /** "increases to 2d6 at 5th level, 3d6 at 9th level". */
  steps?: [level: number, dice: string][]
  /** "1d6 for every 2 levels you have": the dice count is level / per. */
  perLevels?: number
  /** "plus 1d6 for every level you have beyond 6th". */
  beyond?: { level: number; add: string }
}

export interface Pf2eSelfMod {
  /** `note`: a bonus to something the sheet doesn't roll (a DC against Shove), shown as text. */
  selector: Pf2eSelector | 'initiative' | 'roll' | 'note'
  value: number
  type: 'status' | 'circumstance' | 'item' | 'untyped'
  skills?: string[]
  /** Only for these actions' checks ("+1 circumstance bonus to Make an Impression"). */
  actions?: string[]
  /** What it's limited to, as the text says ("against the triggering attack"). */
  qualifier: string
  /** Its sentence says when it applies ("When you Rage", "while", "until"). */
  conditional: boolean
  /** The sentence it comes from, for the player. */
  sentence: string
  /** From this level on (Warpriest's "Fifth Doctrine (15th)"). */
  level?: number
}

export interface Pf2eDegreeShift {
  save: 'Fortitude' | 'Reflex' | 'Will' | 'all'
  from: Pf2eDegreeName
  to: Pf2eDegreeName
  /** "against a fear effect": shown as a note, not applied by itself. */
  against?: string
  level?: number
}

export interface Pf2eProficiencyUp {
  stat: 'Fortitude' | 'Reflex' | 'Will' | 'Perception' | 'Class DC' | 'AC' | 'attack' | 'spell'
  rank: Pf2eRank
  level?: number
}

export interface Pf2eResistance {
  type: string
  amount: Pf2eAmount
  conditional: boolean
  sentence: string
  level?: number
  /** "(minimum 1)". */
  min?: number
}

export interface Pf2eConditionRule {
  name: string
  value?: number
  self: boolean
  degree?: Pf2eDegreeName
}

export interface Pf2eAbilityRules {
  name: string
  cost?: Pf2eCost
  frequency?: Pf2eFrequency
  trigger?: string
  requirements?: string
  traits: string[]
  strike?: Pf2eStrikeRule
  check?: Pf2eCheckRule
  /** An action whose check it makes ("you can Demoralize"), by name. */
  uses?: string
  damage: Pf2eDiceRule[]
  healing: Pf2eDiceRule[]
  tempHp?: { amount: Pf2eAmount; ends?: Pf2eEnds }
  conditions: Pf2eConditionRule[]
  selfMods: Pf2eSelfMod[]
  /** When a bonus or condition it gives itself ends. */
  ends?: Pf2eEnds
  speed?: number
  resistances: Pf2eResistance[]
  degreeShifts: Pf2eDegreeShift[]
  proficiency: Pf2eProficiencyUp[]
  maxHp?: Pf2eAmount
  /** Degree lines (**Success** The target becomes frightened 1.). */
  outcomes: { degree: Pf2eDegreeName; text: string }[]
  /** A Strike the ability grants (claws: 1d6 slashing, agile, finesse). */
  unarmed: { name: string; dice: string; type: string; traits: string[] }[]
  /** The fist's new damage die (Powerful Fist: 6). */
  fistDie?: number
  /** Extra damage on Rage's, by level (Dragon instinct: +2, +6 from 7th). */
  rageDamage?: [level: number, extra: number][]
  /** Feats or actions it grants by name ("You gain the Shield Block general feat"). */
  grants: string[]
  /** Actions written inside it ("## Rage ◆"), read on their own. */
  embedded: Pf2eAbilityRules[]
  /** An embedded action's own text. */
  body?: string
  /** What a use costs besides actions ("Expend a harm or heal spell"), from its Cost line. */
  costNote?: string
  /** What it's used with ("imbued into a body ikon"), from its Usage line. */
  usage?: string
}

export type { Pf2eAmount, Pf2eDegreeName, Pf2eEnds }

export interface Pf2eAbilityInput {
  name: string
  text: string
  actions?: Pf2eActionCost
  frequency?: string
  trigger?: string
  requirements?: string
  traits?: string[]
  /** Stat lines the data keeps: what a use costs, what it's imbued into, how long it lasts. */
  cost?: string
  usage?: string
  duration?: string
}

const PF2E_SKILLS = [
  'Acrobatics',
  'Arcana',
  'Athletics',
  'Crafting',
  'Deception',
  'Diplomacy',
  'Intimidation',
  'Medicine',
  'Nature',
  'Occultism',
  'Performance',
  'Religion',
  'Society',
  'Stealth',
  'Survival',
  'Thievery',
]
const SKILL = `(?:${PF2E_SKILLS.join('|')}|Perception|Lore|[A-Z][a-z]+ Lore)`

const CONDITIONS = [
  'blinded',
  'clumsy',
  'concealed',
  'confused',
  'controlled',
  'dazzled',
  'deafened',
  'doomed',
  'drained',
  'enfeebled',
  'fascinated',
  'fatigued',
  'fleeing',
  'frightened',
  'grabbed',
  'hidden',
  'immobilized',
  'invisible',
  'off-guard',
  'paralyzed',
  'petrified',
  'prone',
  'quickened',
  'restrained',
  'sickened',
  'slowed',
  'stunned',
  'stupefied',
  'unconscious',
  'wounded',
]
const VALUED = new Set([
  'clumsy',
  'doomed',
  'drained',
  'enfeebled',
  'frightened',
  'sickened',
  'slowed',
  'stunned',
  'stupefied',
  'wounded',
])
const DAMAGE_TYPES =
  'acid|bludgeoning|cold|electricity|fire|force|mental|piercing|poison|slashing|sonic|spirit|vitality|void|bleed|precision|holy|unholy|physical|energy|untyped|splash'

/**
 * Every rules pattern the parser reads, named, so the test can check each still matches the
 * data. Text is read after `clean` (tables and "leads to" lists removed).
 */
export const PF2E_RULE_PATTERNS = {
  frequency:
    /\b(once|twice|three times|one|oncer)\s+(?:per|every|each)\s+(day|hour|10 minutes|minute|round|turn|week)\b/i,
  frequencyField: /\*\*Frequency\*\*\s*([^;*\n]+)/,
  triggerField: /\*\*Trigger\*\*\s*([^;*\n]+)/,
  requirementsField: /\*\*Requirements?\*\*\s*([^;*\n]+)/,
  traitsField: /\*\*Traits\*\*\s*([^\n]+)/,
  costField: /\*\*Cost\*\*\s*([^;*\n]+)/,
  cooldown:
    /\b[Cc]an(?:'|’)?t (?:use [^.]{1,60}?|do so|[A-Z][\w'’ ]+) again (?:for|until) (1 minute|10 minutes|1 hour|24 hours|1 day|(?:after )?(?:the next time you make )?your next daily preparations)/,
  immunity:
    /\b(?:temporarily )?immune to (?:all uses of |your |the )?([^.]{1,60}?) for (1 minute|10 minutes|1 hour|24 hours|1 day|1 week)\b/i,
  timeCost:
    /^(?:You )?(?:spend|spending|take|takes) (1 minute|10 minutes|1 hour|(?:\d+|one|two|several) (?:minutes|hours|days))\b/i,
  strike:
    /\b(?:[Mm]ake|[Aa]ttempt) (a|an|one|two|three) (?:single )?(?:(melee|ranged|unarmed|weapon|thrown|dynamo|slashing|piercing|bludgeoning)(?: or (?:melee|ranged|unarmed|weapon|thrown|dynamo|slashing|piercing|bludgeoning))? )*(?:weapon )?Strikes?\b|\bStrike (twice|two times)\b/,
  sameMap: /\beach using your current multiple attack penalty\b/i,
  twoWeapons: /\bone with each of your two (?:melee )?weapons\b/i,
  secondPenalty:
    /\bIf the second Strike is made with a weapon that doesn(?:'|’)t have the agile trait, it takes a [–−-](\d+) penalty/i,
  combineDamage: /\bcombine (?:their|the) damage\b/i,
  strideTwice: /\bStride (?:up to )?(twice|two times|three times)\b/,
  strideOnce:
    /\b(?:You |you |then |can )?(Stride|Step)\b(?! (?:up to )?(?:twice|two times|three times))/,
  freeWhen: /[^.]*\bas a free action if\b[^.]*\./,
  mapCounted:
    /\bcounts? as (two|three) attacks (?:when (?:calculating|determining)|for(?: the purposes? of (?:calculating|determining)| calculating)?|toward) your multiple attack penalty/i,
  mapNone: /\b(?:doesn't|does not|don't) count toward your multiple attack penalty/i,
  mapIgnored: /\byour multiple attack penalty doesn't apply to this Strike/i,
  extraDie: /\b(?:deal|deals) an extra die of weapon damage/i,
  extraDiceLevel:
    /\bat least (\d+)(?:st|nd|rd|th) level, increase (?:this|it) to (two|three|four) extra dice/gi,
  check: new RegExp(
    `\\b(?:[Aa]ttempts?|[Rr]oll|[Rr]olls|[Mm]ake|[Mm]akes) an? (?:single |secret )*(?:(DC \\d+) )?(${SKILL}(?:,? (?:or )?${SKILL})*|skill|flat) check`,
  ),
  checkAgainst:
    /\bagainst (?:the |a |an |that |each |its |your |their |one )?(?:\w+(?:'s|’s) |target(?:'s|’s) |creature(?:'s|’s) )?(Fortitude DC|Reflex DC|Will DC|Perception DC|AC)\b/,
  fixedDc: /\bDC (\d+)\b/,
  checkDcIs: new RegExp(`\\bThe (${SKILL}) check DC is usually (\\d+)`),
  tiersRow:
    /^\|\s*\*{0,2}(Trained|Expert|Master|Legendary)\*{0,2}\*?\s*\|\s*(\d+)\s*\|\s*2d8(?:\+(\d+))?\s*\|/gm,
  sameDcAsTreatWounds: /\bsame DC as for Treat Wounds\b/,
  outcome: /\*\*(Critical Success|Success|Failure|Critical Failure)\*\*\s*([^\n]+)/g,
  damage: new RegExp(
    `(\\d+d\\d+(?:\\s*\\+\\s*\\d+)?)(?: (persistent))?(?: (${DAMAGE_TYPES})(?: or (?:${DAMAGE_TYPES}))?)? damage`,
    'g',
  ),
  healing:
    /\b(?:regains?|restores?|recovers?|heals?|heal it for|heal them for)\s+(\d+d\d+(?:\s*\+\s*\d+)?)\s+(?:Hit Points|HP)/gi,
  increaseEvery:
    /increases? by (\d+d\d+) at (\d+)(?:st|nd|rd|th) level and every (\d+|two|three|four) levels thereafter/i,
  everyThereafterLead:
    /\bAt (\d+)(?:st|nd|rd|th) level and every (\d+|two|three|four) levels thereafter, [^.]*?increases? by (\d+d\d+)/i,
  increaseSteps:
    /increases? to (\d+d\d+) at (\d+)(?:st|nd|rd|th) level((?:,? (?:and )?\d+d\d+ at \d+(?:st|nd|rd|th) level)*)/i,
  perLevels:
    /^[^.]{0,40}?(?:per|for every|for each) (\d+|two|three|level)(?: levels?)?(?: you have)?\b(?!(?: you have)? beyond)/i,
  beyondLevel:
    /(\d+d\d+)(?: damage)? (?:for every|for each|per) level (?:you have )?beyond (\d+)(?:st|nd|rd|th)/i,
  scalingDice: /^\s*(?:for every|for each|per) (?:\d+ |two |three |four )?levels?\b/i,
  damageIs: /\bThe damage is (\d+d\d+)(?=, plus \d+d\d+ (?:damage )?(?:for every|for each|per) )/g,
  tempHp:
    /\b(?:gain|gains|gaining|grant you|get) (?:a number of )?temporary Hit Points equal to (your level plus your Constitution modifier|your level|half your level|your Constitution modifier|double your level|twice your level|three times your level)/i,
  tempHpFixed: /\b(?:gain|gains|gaining|get) (\d+) temporary Hit Points/i,
  bonus:
    /(?:([+])(\d+)(-foot)?|([–−-])(\d+)(-foot)?) (status|circumstance|item)? ?(bonus|penalty)(?: (?:to |on |against )| (?=when |while |for |if |per |either )|(?=[.,;)]| \(| and | or |$))([^.;]*)/g,
  speedIncrease: /\b[Yy]our (?:land )?Speed increases by (\d+) feet/,
  degreeShift:
    /\bWhen you roll an? (critical failure|failure|success) (?:on|at) (?:an? |the chosen )?(Fortitude|Reflex|Will) save(?:s)?(?: against ([^,]+?))?, you get an? (failure|success|critical success) instead/i,
  degreeShiftAll:
    /\bWhen you roll an? (critical failure|failure|success) on an? (?:saving throw|save)(?: against ([^,]+?))?, you get an? (failure|success|critical success) instead/i,
  proficiency:
    /\b[Yy]our proficiency ranks? (?:for|in|with) ([^.]+?) increases? to (expert|master|legendary)/g,
  resistance:
    /\bresistance (\d+|equal to (?:half )?your level|equal to your (?:Constitution|Wisdom|Charisma|Intelligence|Dexterity|Strength) modifier)(?: \(minimum (\d+)\))? to ([a-z, ]+?)(?: damage)?(?=[.,;)]| and | until| while| for| against| equal)/gi,
  resistanceTo:
    /\bresistance to ([a-z, ]+?)(?: damage)? equal to (half your level|your level|your (?:Constitution|Wisdom|Charisma) modifier)(?: \(minimum (\d+)\))?/gi,
  maxHp: /\b[Ii]ncrease your maximum Hit Points by (your level|\d+)/,
  condition: new RegExp(
    `\\b(?:become|becomes|becoming|is|are|be|gets?|lands?|knocked|knocks it|left|falls? and lands?|you're|it's|they're|remains?|also) (?:knocked )?(?:immediately )?(${CONDITIONS.join('|')})(?: (\\d+))?\\b`,
    'gi',
  ),
  unarmed:
    /\b(?:gain|have) an? ([a-z]+(?: [a-z]+)?) unarmed attack that deals (\d+d\d+) (bludgeoning|piercing|slashing|acid|cold|electricity|fire|poison|sonic) damage/gi,
  unarmedOption:
    /^\s*[-•] \*\*([A-Z][a-z]+(?: [a-z]+)?)\*\* (?:\(([^)]*)\) )?(\d+d\d+) (bludgeoning|piercing|slashing|acid|cold|electricity|fire|poison|sonic)(?: \(([^)]*)\))?/gm,
  fistDie:
    /\b(?:[Tt]he damage die for your fists?(?: unarmed attacks?)?|[Yy]our fist(?:'s|’s) damage die) (?:increases|changes|becomes) to 1d(\d+)/,
  rageDamage: /\bincrease (?:your |the )*additional damage from Rage (?:from \d+ )?to (\d+)/gi,
  specializationLevel: /Specialization(?: Ability)?(?: · Level (\d+))?/g,
  grants:
    /\b[Yy]ou gain the ([A-Z][\w'’ -]+?) (?:general |skill |class |ancestry )?(?:feat|action|reaction|free action|ability|activity|reaction)\b/g,
  durationStart: /\buntil the (?:start|beginning) of your next turn\b|\bfor 1 round\b/i,
  durationEnd: /\buntil the end of your turn\b/i,
  durationNextEnd: /\buntil the end of your next turn\b/i,
  durationTrigger:
    /\bagainst the triggering (?:attack|effect|check|roll|saving throw|damage|spell)\b|\bto the triggering\b/i,
  durationMinute: /\bfor 1 minute\b/i,
  durationEncounter: /\buntil the end of (?:the|this) encounter\b|\buntil the encounter ends\b/i,
  actionTarget:
    /^(?:checks to |your checks to |the check to |attempts to |rolls to |your |when you attempt to |when attempting to |when using the |when you use |when you |when |for )?((?:[A-Z][a-z]+)(?: (?:an?|the|a|[A-Z][a-z]+))*(?:,? or [A-Z][a-z]+(?: (?:an?|the|[A-Z][a-z]+))*)*)(?: checks?| attempts?| rolls?| actions?)?\b/,
  actionQualifier:
    /^to ((?:[A-Z][a-z]+)(?: (?:an?|the|[A-Z][a-z]+))*(?:,? or [A-Z][a-z]+(?: (?:an?|the|[A-Z][a-z]+))*)*)/,
  conditional:
    /\b(?:when|whenever|if|while|after|until|as long as|each time|the first time|before|for 1|for \d+|against|instead)\b/i,
  notAnAction:
    /^(?:Fortitude|Reflex|Will|Perception|AC|Armor|Hit Points|Hardness|Speed)\b|\bDCs?\b/,
  levelLabel: /^\s*[-•]?\s*\*\*[^*]*\((\d+)(?:st|nd|rd|th)\)\*\*/,
  levelLead: /^(?:At|Starting at|Beginning at|From) (\d+)(?:st|nd|rd|th) level\b/,
  levelHeading: /^#{1,4} [^\n]*?Level (\d+)\s*$/gm,
  labelledOption: /^(?:[-•]\s*)?\*\*[^*]+\*\*/,
  youAndAllies: /\byou and (?:all |your |each |any )*(?:allies|ally)\b/i,
  embeddedHeading: /^#{1,4} ([^\n]+?) ([◆↺◇]+(?: (?:to|or) [◆↺◇]+)?)\s*$/gm,
  embeddedBold:
    /^\s*\*\*\s*(?:(?:Activate|Transcendence)\s*[—–-]\s*)?([^*\n]+?)\s*\*\*\s*(?:[—–-]\s*([^◆↺◇(*\n]+?)\s*)?([◆↺◇]+)\s*(\([^)\n]*\))?([^\n]*)$/gm,
}

const P = PF2E_RULE_PATTERNS

const WORD_NUM: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  once: 1,
  oncer: 1,
  two: 2,
  twice: 2,
  three: 3,
  four: 4,
  'two times': 2,
  'three times': 3,
}
const num = (w: string) => WORD_NUM[w.toLowerCase()] ?? Number(w)

/** Drops what isn't rules: "## X leads to…" lists, tables, and the source line. */
export function clean(text: string) {
  return text
    .replace(/\n## [^\n]* leads to\.\.\.[\s\S]*$/, '')
    .replace(/^\|.*\|\s*$/gm, '')
    .replace(/^\*\*Source\*\*[^\n]*$/gm, '')
}

/** Cost from the data's `actions`, the sheet's glyph, or the book's words for a range. */
export function readCost(a: Pf2eActionCost | undefined): Pf2eCost | undefined {
  if (a === undefined || a === '') return undefined
  if (typeof a === 'number') return { kind: 'actions', min: a, max: a }
  const v = a.trim().toLowerCase()
  if (v === 'reaction' || v.startsWith('↺') || v.startsWith('reaction')) return { kind: 'reaction' }
  // "free or 1", "◇ or ◆" (Devise a Stratagem): free only in a case its text names, so 1 action.
  const freeOr = /^(?:free|◇) or (\d|◆+)$/.exec(v)
  if (freeOr) {
    const n = /\d/.test(freeOr[1]!) ? Number(freeOr[1]) : freeOr[1]!.length
    return { kind: 'actions', min: n, max: n }
  }
  if (v === 'free' || v === '◇' || v.startsWith('free')) return { kind: 'free' }
  const glyphs = [...v.matchAll(/◆+/g)].map((m) => m[0].length)
  if (glyphs.length) return { kind: 'actions', min: glyphs[0]!, max: glyphs.at(-1)! }
  const words = [...v.matchAll(/\b(single|one|two|three|1|2|3)\b/g)].map((m) =>
    m[1] === 'single' ? 1 : num(m[1]!),
  )
  if (words.length) return { kind: 'actions', min: words[0]!, max: words.at(-1)! }
  if (/\b(minute|hour|day)s?\b/.test(v)) return { kind: 'time', text: a.trim() }
  return undefined
}

const PERIOD: Record<string, Pf2ePeriod> = {
  turn: 'turn',
  round: 'round',
  minute: 'minute',
  '1 minute': 'minute',
  '10 minutes': '10min',
  hour: 'hour',
  '1 hour': 'hour',
  day: 'day',
  '1 day': 'day',
  '24 hours': 'day',
  week: 'week',
  '1 week': 'week',
}

/** "once per 10 minutes" → 1 per 10min; unknown wording (once per Crimson Shroud) → none. */
export function readFrequency(text: string | undefined): Pf2eFrequency | undefined {
  if (!text) return undefined
  const m = P.frequency.exec(text)
  if (!m) return undefined
  const period = PERIOD[m[2]!.toLowerCase()]
  return period ? { period, times: num(m[1]!), text: text.trim().replace(/\.$/, '') } : undefined
}

const sentences = (text: string) =>
  text
    .replace(/\n+/g, ' \n ')
    .split(/(?<=[.!?])\s+(?=[A-Z*(])|\n/)
    .map((s) => s.trim())
    .filter(Boolean)

const OTHERS =
  /\b(all(?:ies|y)|target|targets|creature|creatures|enemy|enemies|foe|foes|companion|familiar|eidolon|minion|they|it|its|their|them|he|she|each|mount|aura|bearer|wearer|wielder|attacker|everyone|anyone|any|characters|member|summon|undead|plants?|construct|spirit|they're)\b/gi

/** Whether the subject of a phrase is the hero: the last subject word before it is "you". */
function isSelf(before: string) {
  if (P.youAndAllies.test(before)) return true
  const you = [...before.matchAll(/\b(you|your|you're|yourself)\b/gi)].at(-1)?.index ?? -1
  const other = [...before.matchAll(OTHERS)].at(-1)?.index ?? -1
  return you >= 0 && you > other
}

/** Selectors for "AC", "attack rolls, Perception checks and saving throws", "Athletics checks". */
function readTargets(phrase: string): {
  selectors: Pf2eSelfMod['selector'][]
  skills: string[]
  actions: string[]
  rest: string
} {
  const out: Pf2eSelfMod['selector'][] = []
  const skills: string[] = []
  let rest = phrase.trim()
  const TARGETS: [RegExp, Pf2eSelfMod['selector'] | 'skill'][] = [
    [/^(?:your |their )?(?:AC|Armor Class)\b/, 'ac'],
    [/^(?:your |all )?(?:attack rolls?|Strikes?|weapon attack rolls?)\b/, 'attack'],
    [/^(?:your )?damage(?: rolls)?\b/, 'damage'],
    [/^(?:all |your )?(?:saving throws|saves)\b/, 'saves'],
    [/^(?:your )?Fortitude (?:saves?|saving throws?)\b/, 'fortitude'],
    [/^(?:your )?Reflex (?:saves?|saving throws?)\b/, 'reflex'],
    [/^(?:your )?Will (?:saves?|saving throws?)\b/, 'will'],
    [/^(?:your )?Perception checks for initiative\b|^initiative(?: rolls)?\b/, 'initiative'],
    [/^(?:your )?Perception(?: checks)?(?: and Perception DC)?\b/, 'perception'],
    [/^(?:your |all )?(?:land )?Speeds?\b/, 'speed'],
    [/^(?:all |your )?skill checks\b/, 'skills'],
    [/^(?:all |your )?checks(?: and DCs)?\b/, 'checks'],
    [
      /^(?:the|this|your|that) (?:check|roll|attack roll|save|saving throw|skill check)\b|^(?:the|your) triggering (?:check|roll|saving throw|save|attack roll)\b/,
      'roll',
    ],
    [new RegExp(`^(?:your )?(${PF2E_SKILLS.join('|')})\\b`), 'skill'],
  ]
  for (;;) {
    const hit = TARGETS.find(([re]) => re.test(rest))
    if (!hit) break
    const m = hit[0].exec(rest)!
    if (hit[1] === 'skill') {
      skills.push(m[1]!)
      if (!out.includes('skills')) out.push('skills')
    } else out.push(hit[1])
    rest = rest.slice(m[0].length)
    const joiner = /^(?:,\s*(?:and |or )?|\s+(?:and|or)\s+)/.exec(rest)
    const more = joiner && TARGETS.some(([re]) => re.test(rest.slice(joiner[0].length)))
    if (!more) break
    rest = rest.slice(joiner[0].length)
  }
  rest = rest.replace(/^ checks?\b/, '').trim()
  const actions: string[] = []
  const named = P.actionTarget.exec(rest)
  if (named && !PF2E_SKILLS.includes(named[1]!) && !P.notAnAction.test(named[1]!)) {
    actions.push(...named[1]!.split(/,? or |, /))
    if (!out.length) out.push('checks')
    rest = rest.slice(named[0].length).trim()
  } else {
    const to = P.actionQualifier.exec(rest)
    if (to && out.length) actions.push(...to[1]!.split(/,? or |, /))
  }
  if (/^,\s*\w+ing\b/.test(rest)) rest = ''
  return { selectors: out, skills, actions, rest: rest.replace(/^,\s*/, '') }
}

/** When a use's bonus ends, from its words. */
export function readEnds(text: string): Pf2eEnds | undefined {
  if (P.durationTrigger.test(text)) return 'trigger'
  if (P.durationStart.test(text)) return 'startOfTurn'
  if (P.durationNextEnd.test(text)) return 'endOfNextTurn'
  if (P.durationEnd.test(text)) return 'endOfTurn'
  if (P.durationEncounter.test(text)) return 'encounter'
  if (P.durationMinute.test(text)) return 'minute'
  return undefined
}

const AMOUNT: Record<string, Pf2eAmount> = {
  'your level plus your constitution modifier': 'levelPlusCon',
  'your level': 'level',
  'half your level': 'halfLevel',
  'your constitution modifier': 'con',
  'double your level': 'doubleLevel',
  'twice your level': 'doubleLevel',
  'three times your level': 'tripleLevel',
}

/** An amount at a level ("half your level" at 5th: 2). */
export function amountAt(a: Pf2eAmount, level: number, con = 0, min = 0) {
  const v =
    typeof a === 'number'
      ? a
      : a === 'level'
        ? level
        : a === 'halfLevel'
          ? Math.floor(level / 2)
          : a === 'doubleLevel'
            ? level * 2
            : a === 'tripleLevel'
              ? level * 3
              : a === 'con'
                ? con
                : level + con
  return Math.max(min, v)
}

function degreeAt(text: string, index: number): Pf2eDegreeName | undefined {
  const before = text.slice(0, index)
  const m = [...before.matchAll(/\*\*(Critical Success|Success|Failure|Critical Failure)\*\*/g)].at(
    -1,
  )
  if (!m) return undefined
  // The degree line runs to the end of its paragraph.
  if (before.slice((m.index ?? 0) + m[0].length).includes('\n')) return undefined
  return m[1]!.toLowerCase() as Pf2eDegreeName
}

/** Scaling written after the dice, in the same or the next sentence. */
function readScaling(rule: Pf2eDiceRule, after: string) {
  const window = after.slice(0, 320)
  const every = P.increaseEvery.exec(window)
  if (every) {
    rule.every = { add: every[1]!, from: Number(every[2]), step: num(every[3]!) }
    return
  }
  const lead = P.everyThereafterLead.exec(window)
  if (lead) {
    rule.every = { add: lead[3]!, from: Number(lead[1]), step: num(lead[2]!) }
    return
  }
  const steps = P.increaseSteps.exec(window)
  if (steps) {
    const list: [number, string][] = [[Number(steps[2]), steps[1]!]]
    for (const m of (steps[3] ?? '').matchAll(/(\d+d\d+) at (\d+)/g))
      list.push([Number(m[2]), m[1]!])
    rule.steps = list
    return
  }
  const beyond = P.beyondLevel.exec(window)
  if (beyond) {
    rule.beyond = { add: beyond[1]!, level: Number(beyond[2]) }
    return
  }
  const per = P.perLevels.exec(after)
  if (per) rule.perLevels = per[1] === 'level' ? 1 : num(per[1]!)
}

/** The dice of a rule at a level. */
export function diceAt(rule: Pf2eDiceRule, level: number): string {
  const m = /^(\d+)d(\d+)(.*)$/.exec(rule.dice.replace(/\s+/g, ''))
  if (!m) return rule.dice
  let count = Number(m[1])
  const sides = m[2]!
  const mod = m[3] ?? ''
  if (rule.steps) {
    const at = [...rule.steps].reverse().find(([l]) => l <= level)
    if (at) return `${at[1]}${mod}`
  }
  const add = (d: string, times: number) => {
    const a = /^(\d+)d(\d+)/.exec(d)
    if (a && a[2] === sides) count += Number(a[1]) * times
  }
  if (rule.every && level >= rule.every.from)
    add(rule.every.add, Math.floor((level - rule.every.from) / rule.every.step) + 1)
  if (rule.beyond && level > rule.beyond.level) add(rule.beyond.add, level - rule.beyond.level)
  if (rule.perLevels) count = Math.max(1, Math.floor(level / rule.perLevels)) * count
  return `${count}d${sides}${mod}`
}

function readDice(text: string, heal: boolean): Pf2eDiceRule[] {
  const re = heal ? P.healing : P.damage
  re.lastIndex = 0
  const out: Pf2eDiceRule[] = []
  // "The damage is 4d6, plus 1d6 for every level…" (Enervating Wail): damage named before it.
  const found = [...text.matchAll(re), ...(heal ? [] : text.matchAll(P.damageIs))].sort(
    (a, b) => (a.index ?? 0) - (b.index ?? 0),
  )
  const seen = new Set<number>()
  for (const m of found) {
    const index = m.index ?? 0
    const at = index + m[0].indexOf(m[1]!)
    if (seen.has(at)) continue
    seen.add(at)
    const after = text.slice(index + m[0].length)
    // "plus 1d6 damage for every level you have beyond 6th" is the scaling, not more damage.
    if (/\bplus\s*$/.test(text.slice(0, index)) && P.scalingDice.test(after)) continue
    // Dice for durations ("for 1d4 rounds") aren't damage.
    const rule: Pf2eDiceRule = { dice: m[1]!.replace(/\s+/g, '') }
    if (!heal) {
      if (m[2]) rule.persistent = true
      if (m[3]) rule.type = m[3]
    } else rule.heal = true
    const degree = degreeAt(text, index)
    if (degree) rule.degree = degree
    readScaling(rule, after)
    out.push(rule)
  }
  return out
}

const RANK: Record<string, Pf2eRank> = { trained: 'T', expert: 'E', master: 'M', legendary: 'L' }

function readProficiency(text: string): Pf2eProficiencyUp[] {
  const out: Pf2eProficiencyUp[] = []
  P.proficiency.lastIndex = 0
  for (const m of text.matchAll(P.proficiency)) {
    const what = m[1]!.toLowerCase()
    const rank = RANK[m[2]!.toLowerCase()]!
    const at = gate(text, m.index ?? 0)
    const save = /^(fortitude|reflex|will) saves?$/.exec(what)?.[1]
    if (save) out.push({ stat: (save[0]!.toUpperCase() + save.slice(1)) as 'Will', rank, ...at })
    else if (/^perception$/.test(what)) out.push({ stat: 'Perception', rank, ...at })
    else if (/class dc/.test(what)) out.push({ stat: 'Class DC', rank, ...at })
    else if (/spell attack/.test(what)) out.push({ stat: 'spell', rank, ...at })
    else if (/unarmored defense|unarmed defense/.test(what) && !/weapon/.test(what))
      out.push({ stat: 'AC', rank, ...at })
    else if (/simple (?:weapons|and martial)/.test(what) && /unarmed attacks/.test(what))
      out.push({ stat: 'attack', rank, ...at })
  }
  return out
}

function readResistances(text: string): Pf2eResistance[] {
  const out: Pf2eResistance[] = []
  const amount = (w: string): Pf2eAmount =>
    /^\d+$/.test(w) ? Number(w) : (AMOUNT[w.replace(/^equal to /, '').toLowerCase()] ?? 'halfLevel')
  for (const s of sentences(text)) {
    for (const m of s.matchAll(P.resistance)) {
      if (!isSelf(s.slice(0, m.index))) continue
      out.push({
        type: m[3]!.trim(),
        amount: amount(m[1]!),
        ...(m[2] ? { min: Number(m[2]) } : {}),
        conditional: isConditional(s),
        sentence: s,
        ...gate(text, text.indexOf(s)),
      })
    }
    for (const m of s.matchAll(P.resistanceTo)) {
      if (!isSelf(s.slice(0, m.index))) continue
      out.push({
        type: m[1]!.trim(),
        amount: amount(m[2]!),
        ...(m[3] ? { min: Number(m[3]) } : {}),
        conditional: isConditional(s),
        sentence: s,
        ...gate(text, text.indexOf(s)),
      })
    }
  }
  return out
}

/**
 * The level a part of an ability starts at: its option's label ("**Fifth Doctrine (15th)**"),
 * "At 13th level," before it in its sentence, or the heading over it ("## Specialization
 * Ability · Level 7"). Undefined from 1st.
 */
function gateAt(text: string, index: number): number | undefined {
  const lineStart = text.lastIndexOf('\n', index) + 1
  const line = text.slice(lineStart, index)
  const label = P.levelLabel.exec(line)
  if (label) return Number(label[1])
  const sentence = line.split(/(?<=[.!?])\s+/).at(-1) ?? ''
  const at = P.levelLead.exec(sentence)
  if (at) return Number(at[1])
  const heading = [...text.slice(0, index).matchAll(P.levelHeading)].at(-1)
  return heading ? Number(heading[1]) : undefined
}
const gate = (text: string, index: number) => {
  const level = gateAt(text, index)
  return level && level > 1 ? { level } : {}
}

/** A sentence that says when it applies. */
const isConditional = (s: string) => P.conditional.test(s) || P.labelledOption.test(s)

function readSelfMods(text: string): Pf2eSelfMod[] {
  const out: Pf2eSelfMod[] = []
  for (const s of sentences(text)) {
    for (const m of s.matchAll(P.bonus)) {
      const before = s.slice(0, m.index)
      if (!isSelf(before)) continue
      const value = m[1] ? Number(m[2]) : -Number(m[5])
      const foot = m[3] || m[6]
      const { selectors, skills, actions, rest } = readTargets(m[9]!)
      const sel: Pf2eSelfMod['selector'][] = foot
        ? ['speed']
        : selectors.length
          ? selectors
          : ['note']
      for (const selector of sel)
        out.push({
          selector,
          value,
          type: (m[7] as Pf2eSelfMod['type']) ?? 'untyped',
          ...(selector === 'skills' && skills.length ? { skills } : {}),
          ...(actions.length ? { actions } : {}),
          qualifier: rest,
          conditional: actions.length ? rest !== '' : isConditional(s) || rest !== '',
          sentence: s,
          ...gate(text, text.indexOf(s)),
        })
    }
  }
  return out
}

function readConditions(text: string): Pf2eConditionRule[] {
  const out: Pf2eConditionRule[] = []
  for (const s of sentences(text)) {
    for (const m of s.matchAll(P.condition)) {
      const name = m[1]!.toLowerCase()
      const value = m[2] ? Number(m[2]) : undefined
      if (VALUED.has(name) && value === undefined) continue
      const before = s.slice(0, m.index)
      const lead = /^\*\*(?:Critical Success|Success|Failure|Critical Failure)\*\*/.test(s)
      const after = s.slice((m.index ?? 0) + m[0].length)
      const self =
        !/^ (?:from|to|by|against) you\b/.test(after) &&
        (lead
          ? /\byou\b/i.test(before.replace(/^\*\*[^*]+\*\*/, '')) && isSelf(before)
          : /\b[Yy]ou(?:'re|’re)?\s+(?:also\s+|immediately\s+|then\s+)?$/.test(before))
      const degree = degreeAt(text, text.indexOf(s) + (m.index ?? 0))
      const display = name === 'off-guard' ? 'Off-guard' : name[0]!.toUpperCase() + name.slice(1)
      if (!out.some((c) => c.name === display && c.degree === degree && c.self === self))
        out.push({
          name: display,
          ...(value ? { value } : {}),
          self,
          ...(degree ? { degree } : {}),
        })
    }
  }
  return out
}

function readCheck(text: string, traits: string[]): Pf2eCheckRule | undefined {
  const m = P.check.exec(text)
  if (!m) {
    if (P.sameDcAsTreatWounds.test(text)) return { skills: ['Medicine'], tiers: TREAT_WOUNDS_TIERS }
    const usual = P.checkDcIs.exec(text)
    return usual ? { skills: [usual[1]!], dc: Number(usual[2]) } : undefined
  }
  const words = m[2]!
  const skills =
    words === 'skill'
      ? ['any']
      : words === 'flat'
        ? ['flat']
        : [...words.matchAll(new RegExp(SKILL, 'g'))].map((x) => x[0])
  const sentence = text.slice(m.index).split(/(?<=\.)\s/)[0] ?? ''
  const against = P.checkAgainst.exec(sentence)?.[1]
  const dc = m[1] ? Number(m[1].slice(3)) : undefined
  const rule: Pf2eCheckRule = { skills }
  if (against) rule.against = against
  if (dc) rule.dc = dc
  else if (skills[0] === 'flat') {
    const fixed = P.fixedDc.exec(sentence)
    if (fixed) rule.dc = Number(fixed[1])
  }
  if (traits.some((t) => t.toLowerCase() === 'attack')) rule.attack = true
  if (P.sameDcAsTreatWounds.test(text)) rule.tiers = TREAT_WOUNDS_TIERS
  return rule
}

/** Treat Wounds' DCs and extra healing by proficiency (Player Core p. 242). */
export const TREAT_WOUNDS_TIERS: Pf2eCheckRule['tiers'] = [
  { rank: 'T', dc: 15, bonus: 0 },
  { rank: 'E', dc: 20, bonus: 10 },
  { rank: 'M', dc: 30, bonus: 30 },
  { rank: 'L', dc: 40, bonus: 50 },
]

function readTiers(raw: string): Pf2eCheckRule['tiers'] {
  const rows = [...raw.matchAll(P.tiersRow)]
  if (rows.length < 2) return undefined
  return rows.map((r) => ({
    rank: RANK[r[1]!.toLowerCase()]!,
    dc: Number(r[2]),
    bonus: Number(r[3] ?? 0),
  }))
}

function readStrike(text: string): Pf2eStrikeRule | undefined {
  const m = P.strike.exec(text)
  if (!m) return undefined
  const kinds = m[0].toLowerCase()
  const count = m[3] ? 2 : m[1] ? num(m[1]) : 1
  const before = text.slice(0, m.index)
  const twice = P.strideTwice.exec(before)
  const strides = twice ? num(twice[1]!) : P.strideOnce.test(before) ? 1 : 0
  const counted = P.mapCounted.exec(text)
  // "**Failure** This attack does not count toward your multiple attack penalty" (Exacting
  // Strike): only that degree's attack is left out.
  const none = P.mapNone.exec(text)
  const noneOn = none ? degreeAt(text, none.index) : undefined
  const rule: Pf2eStrikeRule = {
    count,
    strides,
    mapCount: counted ? num(counted[1]!) : none && !noneOn ? 0 : count,
  }
  if (noneOn) rule.mapNoneOn = noneOn
  if (/melee/.test(kinds) && !/ranged/.test(kinds)) rule.melee = true
  if (/ranged/.test(kinds) && !/melee/.test(kinds)) rule.ranged = true
  if (/unarmed/.test(kinds) && !/melee|ranged|weapon/.test(kinds)) rule.unarmed = true
  const types = kinds.match(/slashing|piercing|bludgeoning/g)
  if (types) rule.damageTypes = types
  if (P.mapIgnored.test(text)) rule.ignoreMap = true
  if (P.sameMap.test(text)) rule.sameMap = true
  if (P.twoWeapons.test(text)) {
    rule.twoWeapons = true
    if (/two melee weapons/i.test(text)) rule.melee = true
  }
  const second = P.secondPenalty.exec(text)
  if (second) rule.secondPenalty = Number(second[1])
  if (P.combineDamage.test(text)) rule.combine = true
  if (P.extraDie.test(text)) {
    const steps: [number, number][] = [[1, 1]]
    P.extraDiceLevel.lastIndex = 0
    for (const x of text.matchAll(P.extraDiceLevel)) steps.push([Number(x[1]), num(x[2]!)])
    rule.extraDice = steps
  }
  return rule
}

function readDegreeShifts(text: string): Pf2eDegreeShift[] {
  const out: Pf2eDegreeShift[] = []
  for (const s of sentences(text)) {
    const one = P.degreeShift.exec(s)
    if (one) {
      out.push({
        save: (one[2]![0]!.toUpperCase() + one[2]!.slice(1).toLowerCase()) as 'Will',
        from: one[1]!.toLowerCase() as Pf2eDegreeName,
        to: one[4]!.toLowerCase() as Pf2eDegreeName,
        ...(one[3] ? { against: one[3] } : {}),
        ...gate(text, text.indexOf(s)),
      })
      continue
    }
    const all = P.degreeShiftAll.exec(s)
    if (all)
      out.push({
        save: 'all',
        from: all[1]!.toLowerCase() as Pf2eDegreeName,
        to: all[3]!.toLowerCase() as Pf2eDegreeName,
        ...(all[2] ? { against: all[2] } : {}),
        ...gate(text, text.indexOf(s)),
      })
  }
  return out
}

function readTempHp(text: string): Pf2eAbilityRules['tempHp'] {
  for (const s of sentences(text)) {
    const m = P.tempHp.exec(s)
    if (m && isSelf(s.slice(0, m.index + 1) + ' you')) {
      const ends = readEnds(s)
      return { amount: AMOUNT[m[1]!.toLowerCase()]!, ...(ends ? { ends } : {}) }
    }
    const f = P.tempHpFixed.exec(s)
    if (f && isSelf(s.slice(0, f.index) + ' you')) {
      const ends = readEnds(s)
      return { amount: Number(f[1]), ...(ends ? { ends } : {}) }
    }
  }
  return undefined
}

/** Reads fields written into the text ("**Frequency** once per day; **Trigger** …"). */
function field(re: RegExp, text: string) {
  return re.exec(text)?.[1]?.trim().replace(/[;.]$/, '')
}

const splitTraits = (s: string | undefined) =>
  (s ?? '')
    .replace(/[()]/g, '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)

/** Actions written inside an ability's text, each with the text that belongs to it. */
export function embeddedActions(raw: string): (Pf2eAbilityInput & { at: number })[] {
  const out: (Pf2eAbilityInput & { at: number })[] = []
  const headings = [...raw.matchAll(P.embeddedHeading)]
  headings.forEach((m) => {
    const start = (m.index ?? 0) + m[0].length
    const nextHeading = raw.slice(start).search(/^#{1,4} /m)
    const body = nextHeading < 0 ? raw.slice(start) : raw.slice(start, start + nextHeading)
    out.push({
      at: m.index ?? 0,
      name: m[1]!.trim(),
      actions: m[2]!,
      text: body.replace(/^[\s\S]*?^---\s*$/m, '').trim(),
      frequency: field(P.frequencyField, body),
      trigger: field(P.triggerField, body),
      requirements: field(P.requirementsField, body),
      cost: field(P.costField, body),
      traits: splitTraits(field(P.traitsField, body)),
    })
  })
  for (const m of raw.matchAll(P.embeddedBold)) {
    const name = (m[2] ?? m[1]!).trim()
    if (/^(Frequency|Trigger|Requirements?|Effect|Cost|Traits|Critical|Success|Failure)/.test(name))
      continue
    const line = m[5] ?? ''
    out.push({
      at: m.index ?? 0,
      name,
      actions: m[3]!,
      text: (/\*\*Effects?\*\*\s*([\s\S]*)$/.exec(line)?.[1] ?? line).trim(),
      frequency: field(P.frequencyField, line),
      trigger: field(P.triggerField, line),
      requirements: field(P.requirementsField, line),
      cost: field(P.costField, line),
      traits: splitTraits(m[4]),
    })
  }
  return out
}

/** What one ability does, and the actions written inside it. */
export function readAbility(input: Pf2eAbilityInput): Pf2eAbilityRules {
  const raw = input.text ?? ''
  const inner = embeddedActions(raw)
  // The ability's own text stops where its first embedded action starts.
  const ownRaw = inner.length ? raw.slice(0, Math.min(...inner.map((e) => e.at))) : raw
  const text = clean(ownRaw)
  const traits = input.traits ?? []
  const frequencyText = input.frequency ?? field(P.frequencyField, text)
  let frequency = readFrequency(frequencyText)
  const immune = P.immunity.exec(text)
  if (!frequency && immune && /\b(this|your|it)\b|^[A-Z]/.test(immune[1]!)) {
    const period = PERIOD[immune[2]!.toLowerCase()]
    if (period) frequency = { period, times: 1, text: immune[0], perTarget: true }
  }
  if (!frequency) {
    const cool = P.cooldown.exec(text)
    if (cool) {
      const period = PERIOD[cool[1]!.toLowerCase()] ?? 'day'
      frequency = { period, times: 1, text: cool[0] }
    }
  }
  frequency ??= readFrequency(P.frequency.exec(text)?.[0])
  let cost = readCost(input.actions)
  if (!cost) {
    const time = P.timeCost.exec(text.trim())
    if (time) cost = { kind: 'time', text: time[1]! }
  }
  const strike = cost || input.trigger || field(P.triggerField, text) ? readStrike(text) : undefined
  const check = readCheck(text, traits)
  if (check && !check.tiers) {
    const tiers = readTiers(raw)
    if (tiers) check.tiers = tiers
  }
  const healing = readDice(text, true)
  if (check?.tiers && !healing.length) healing.push({ dice: '2d8', heal: true, degree: 'success' })
  const unarmed = [
    ...[...text.matchAll(P.unarmed)].map((m) => ({
      name: m[1]!.replace(/^\w/, (c) => c.toUpperCase()),
      dice: m[2]!,
      type: m[3]!,
      traits: [] as string[],
    })),
    ...[...ownRaw.matchAll(P.unarmedOption)].map((m) => ({
      name: m[1]!,
      dice: m[3]!,
      type: m[4]!,
      traits: splitTraits(m[2] ?? m[5]),
    })),
  ]
  const fist = P.fistDie.exec(text)
  const rage = readRageDamage(ownRaw)
  const speed = P.speedIncrease.exec(text)
  const maxHp = P.maxHp.exec(text)
  const tempHp = readTempHp(text)
  const ends = (input.duration ? readEnds(`for ${input.duration}`) : undefined) ?? readEnds(text)
  P.grants.lastIndex = 0
  const rules: Pf2eAbilityRules = {
    name: input.name,
    traits,
    damage: readDice(text, false).filter((d) => !strike || d.degree || d.type),
    healing,
    conditions: readConditions(text),
    selfMods: readSelfMods(text),
    resistances: readResistances(text),
    degreeShifts: readDegreeShifts(text),
    proficiency: readProficiency(text),
    outcomes: [...text.matchAll(P.outcome)].map((m) => ({
      degree: m[1]!.toLowerCase() as Pf2eDegreeName,
      text: m[2]!.trim(),
    })),
    grants: [...text.matchAll(P.grants)].map((m) => m[1]!.trim()),
    unarmed,
    embedded: inner.map((e) => ({ ...readAbility(e), body: e.text })),
  }
  if (cost) rules.cost = cost
  const freeWhen =
    typeof input.actions === 'string' && /^(?:free|◇) or/i.test(input.actions)
      ? P.freeWhen.exec(text)?.[0]
      : undefined
  const costNote = input.cost ?? field(P.costField, text) ?? freeWhen
  if (costNote) rules.costNote = costNote
  if (input.usage) rules.usage = input.usage
  if (frequency) rules.frequency = frequency
  const trigger = input.trigger ?? field(P.triggerField, text)
  if (trigger) rules.trigger = trigger
  const requirements = input.requirements ?? field(P.requirementsField, text)
  if (requirements) rules.requirements = requirements
  if (strike) rules.strike = strike
  if (check) rules.check = check
  if (tempHp) rules.tempHp = tempHp
  if (ends) rules.ends = ends
  if (speed && isSelf(text.slice(0, speed.index + 4))) rules.speed = Number(speed[1])
  if (maxHp) rules.maxHp = /^\d+$/.test(maxHp[1]!) ? Number(maxHp[1]) : 'level'
  if (fist) rules.fistDie = Number(fist[1])
  if (rage.length) rules.rageDamage = rage
  return rules
}

/**
 * A barbarian instinct's Rage damage (Player Core 2 pp. 74–77): "increase the additional
 * damage from Rage from 2 to 4", its specialization ability's from 7th level, and "if you have
 * greater weapon specialization" from 15th. Given as the extra over Rage's own 2.
 */
function readRageDamage(raw: string): [number, number][] {
  const out: [number, number][] = []
  for (const m of raw.matchAll(P.rageDamage)) {
    const before = raw.slice(0, m.index)
    const spec = [...before.matchAll(P.specializationLevel)].at(-1)
    const greater = /greater weapon specialization[^.]*$/i.test(before)
    const level = greater ? 15 : spec ? Number(spec[1] ?? 7) : 1
    out.push([level, Number(m[1]) - 2])
  }
  return out.sort((a, b) => a[0] - b[0])
}

/** Uses an action whose check the ability makes ("you can Demoralize"), from known names. */
export function usedAction(text: string, known: Iterable<string>): string | undefined {
  const own = clean(text)
  let best: { name: string; at: number } | undefined
  for (const name of known) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const m = new RegExp(
      `(?:\\b(?:[Yy]ou can|[Yy]ou may|[Tt]hen|[Aa]ttempt to|and|or)\\s+|(?:^|[.!:]\\s+)(?:[Yy]ou\\s+)?)${esc}\\b`,
    ).exec(own)
    if (m && (!best || (m.index ?? 0) < best.at)) best = { name, at: m.index ?? 0 }
  }
  return best?.name
}

/** How many of a text's bonuses and penalties go to the hero, and how many to others. */
export function bonusSubjects(text: string) {
  let self = 0
  let others = 0
  for (const s of sentences(clean(text)))
    for (const m of s.matchAll(P.bonus)) {
      if (isSelf(s.slice(0, m.index))) self += 1
      else others += 1
    }
  return { self, others }
}

export type Pf2eAbilityKind = 'effect' | 'roll' | 'use' | 'text'

/** What the app does with an ability (and what it grants inside it). */
export function abilityKind(r: Pf2eAbilityRules, hasEffect: boolean): Pf2eAbilityKind {
  const own = ownKind(r, hasEffect)
  if (own !== 'text') return own
  const inner = r.embedded.map((e) => ownKind(e, false))
  return inner.includes('roll')
    ? 'roll'
    : inner.includes('use')
      ? 'use'
      : inner.includes('effect')
        ? 'effect'
        : 'text'
}

function ownKind(r: Pf2eAbilityRules, hasEffect: boolean): Pf2eAbilityKind {
  if (r.strike || r.check || r.damage.length || r.healing.length || r.uses) return 'roll'
  if (
    hasEffect ||
    r.selfMods.length ||
    r.tempHp ||
    r.speed ||
    r.resistances.length ||
    r.degreeShifts.length ||
    r.proficiency.length ||
    r.maxHp ||
    r.unarmed.length ||
    r.fistDie ||
    r.rageDamage
  )
    return 'effect'
  if (r.cost || r.frequency || r.trigger || r.costNote || r.grants.length) return 'use'
  return 'text'
}
