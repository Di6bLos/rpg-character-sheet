// What a Pathfinder 2e spell does, read from its rules text in `data/pf2e` (Player Core
// pp. 297–303): its defense (a spell attack against AC, p. 303, or a save, basic or not,
// p. 302), the damage and healing it rolls with their types (persistent, splash), the degree of
// success blocks and the conditions each one gives (p. 401), heightening (p. 297: "Heightened
// (+N)" adds per N ranks, "Heightened (Nth)" sets the values from that rank), the versions cast
// with 1–3 actions (Heal, Force Barrage), whether it's sustained, and the effect in
// `data/pf2e/effects.ts` it turns on. `castRolls` rolls it at the rank it's cast.
// `tests/pf2eSpellRules.test.ts` checks every spell parses and every rules regex here still
// matches some spell, so rewording the data fails loudly.
import { PF2E_EFFECTS } from '~/data/pf2e/effects'
import type { Pf2eEffectDef, Pf2eSpellDef } from '~/data/pf2e/types'
import { type Rng, rollAttack, rollDice, sign } from '~/utils/dice'
import { type Pf2eDegree, degreeOf } from '~/utils/pf2ePlay'

export type Pf2eSave = 'Fortitude' | 'Reflex' | 'Will'

/** Dice and a flat amount: 2d6, 1d4+1, or a flat 8 (`count` 0). */
export interface Pf2eDice {
  count: number
  sides: number
  mod: number
}

/** One roll a spell makes: damage of a type, healing or temporary Hit Points. */
export interface Pf2eSpellPart {
  dice: Pf2eDice
  /** `damage` (typed or not), `healing`, `temp` (temporary Hit Points). */
  role: 'damage' | 'healing' | 'temp'
  /** The damage type, lowercased ("slashing or piercing" for a choice); '' when none is named. */
  type: string
  persistent?: boolean
  splash?: boolean
  /** Only on this degree of success (the block or "On a critical success" sentence it's in). */
  degree?: Pf2eDegree
  /** Only for the version cast with this many actions. */
  actions?: number
  /**
   * Damage or healing the spell deals later or elsewhere (a creature that ends its turn in the
   * area, a Sustain), not with the cast: shown, not rolled. `note` is its sentence.
   */
  later?: boolean
  note?: string
  /** Only against these creatures: Heal's vitality damage hurts undead, Harm heals them. */
  vs?: string
}

/** A Strike a battle form grants (its dice aren't the spell's damage). */
export interface Pf2eFormStrike {
  name: string
  dice: Pf2eDice
  type: string
}

/** What one step of "Heightened (+N)" adds to a part (index into `parts`). */
export interface Pf2eHeightenAdd {
  part: number
  dice: Pf2eDice
}

/** A "Heightened (Nth)" block: from that rank on, its amounts set (or add to) the parts. */
export interface Pf2eHeightenFixed {
  rank: number
  text: string
  /** `part` index set or added to, or -1 for a part that joins. */
  sets: { part: number; to: Pf2eSpellPart; add?: boolean }[]
}

export interface Pf2eSpellRules {
  /** A spell attack roll against AC (p. 303). */
  attack: boolean
  /** The saves it calls for; `basic` follows p. 302's double, full, half, none. */
  saves: { save: Pf2eSave; basic: boolean }[]
  /** The defense as written when it isn't one of those ("see text"). */
  defenseNote?: string
  parts: Pf2eSpellPart[]
  /** Battle form Strikes the spell grants. */
  forms: Pf2eFormStrike[]
  /** Dice that are how long something lasts ("for 1d4 rounds"). */
  durationDice: Pf2eDice[]
  /** Dice rolled on a table or for a number ("Roll 1d4 to determine the color"). */
  tableDice: Pf2eDice[]
  /** The degree of success blocks as written. */
  degrees: Partial<Record<Pf2eDegree, string>>
  /** Conditions each degree gives the target (frightened 2, fleeing). */
  conditions: Partial<Record<Pf2eDegree, { name: string; value?: number }[]>>
  heighten: { every?: number; adds: Pf2eHeightenAdd[]; fixed: Pf2eHeightenFixed[] }
  /** Versions by actions spent (Heal: 1 touch, 2 at range +8, 3 an emanation). */
  actionOptions: number[]
  variants: { actions: number; text: string }[]
  /** Force Barrage: pieces per action, and how many more per heightened step. */
  perAction?: { noun: string; perStep: number }
  /** Ignition: a melee spell attack turns every damage die into this size. */
  meleeDie?: number
  sustained: boolean
  /** The effect in data/pf2e/effects.ts the spell turns on, and whether it's always on you. */
  effect?: { def: Pf2eEffectDef; self: boolean }
  /**
   * A psychic's amp (Dark Archive (Remastered) p. 9): what the psi cantrip does for 1 Focus
   * Point, parsed alike; listed, not rolled.
   */
  amp?: Pf2eSpellRules
}

const DEGREE_NAMES: Record<string, Pf2eDegree> = {
  'Critical Success': 'critical success',
  Success: 'success',
  Failure: 'failure',
  'Critical Failure': 'critical failure',
}

const DAMAGE_TYPES = [
  'acid',
  'bludgeoning',
  'cold',
  'electricity',
  'fire',
  'force',
  'mental',
  'piercing',
  'poison',
  'slashing',
  'sonic',
  'spirit',
  'vitality',
  'void',
  'bleed',
  'precision',
  'positive',
  'negative',
  'holy',
  'unholy',
  'chaotic',
  'evil',
  'good',
  'lawful',
  'divine',
  'energy',
  'physical',
]
const TYPE = `(?:${DAMAGE_TYPES.join('|')})`
const TYPE_WORD = new RegExp(`\\b(${TYPE})\\b`, 'gi')

/** Conditions a degree of success can give (Player Core pp. 442–447). */
const CONDITIONS = [
  'blinded',
  'clumsy',
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
  'immobilized',
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
]
const CONDITION = new RegExp(`\\b(${CONDITIONS.join('|')})(?: (\\d+))?\\b`, 'gi')

const DICE = /(\d+)d(\d+)(?:\s*\+\s*(\d+)(?!\s*d\d))?/g
const FLAT_DAMAGE = new RegExp(
  `(?<![\\d+\\-–d])\\b(\\d+) (persistent )?(${TYPE}) (splash )?damage\\b`,
  'gi',
)
const FLAT_UNTYPED = /\b(?:deal|deals|dealing|take|takes|taking) (\d+) damage\b/gi
const NOT_DEALT =
  /\b(?:resistance|weakness|first|up to|reduces?|reduced|prevents?|ignores?)\b[^.]*$/i
const DEFENSE_SAVE = /\b(basic )?(Fortitude|Reflex|Will)\b/gi
const TEXT_ATTACK = /\b(?:make|makes|making|attempt) an? (?:melee |ranged )?spell attack\b/i
const TEXT_BASIC = /\bbasic (Fortitude|Reflex|Will) save\b/g
const TEXT_SAVE = /\b(basic )?(Fortitude|Reflex|Will) save\b/i
const AMP = /\*\*Amp\*\*/
const AMP_HEIGHTENED = /\*\*Amp Heightened/g
const DEGREE_HEAD = /\*\*(Critical Success|Success|Failure|Critical Failure)\*\*/g
const BOLD_HEAD = /\*\*[^*\n]+\*\*/g
const HEIGHTENED = /\*\*Heightened \((\+(\d+)|(\d+)(?:st|nd|rd|th))\)\*\*/g
const VARIANT_LINE = /^\s*-?\s*(◆{1,3})(?!◆)\s*(.*)$/
const FORM_LINE = /\b(?:Melee|Ranged)\b(?:\*\*)?\s*◆|\*\*Damage\*\*/
const FORM_STRIKE =
  /\b(?:Melee|Ranged)\b(?:\*\*)?\s*◆*\s*([^,(*]+?)\s*(?:\([^)]*\))?,\s*(?:\*\*)?Damage(?:\*\*)?\s*$/
const DURATION_AFTER = /^\s*(?:rounds?|minutes?|hours?|days?|turns?|weeks?|months?|years?)\b/i
const TEMP_AFTER = /^\s*(?:additional |extra )?temporary Hit Points\b/i
const HEAL_AFTER = /^\s*(?:additional |extra )?(?:Hit Points|HP)\b/
const LOSES_BEFORE = /\blos(?:e|es|ing)\s*$/i
const DAMAGE_AFTER = new RegExp(
  `^\\s*(?:additional |extra )?(persistent\\s+)?(?:(${TYPE}(?:,\\s*${TYPE})*(?:,?\\s+(?:or|and)\\s+${TYPE})?)\\s+)?(splash\\s+)?(?:damage\\b|(?=(?:and|plus|,)\\s+\\d+d\\d+\\s+(?:persistent\\s+)?${TYPE}\\b))`,
  'i',
)
const TYPED_AFTER = new RegExp(`^\\s*(?:additional |extra )?(persistent\\s+)?(${TYPE})\\b`, 'i')
const DAMAGE_BEFORE = new RegExp(
  `\\b(?:(${TYPE}) )?damage (?:is|of|increases (?:by|to)|equal to)\\s*$`,
  'i',
)
const TABLE_BEFORE = /(?:\broll|\|\s*\*\*)\s*$/i
const ALTERNATIVE = new RegExp(`^\\s*(?:${TYPE}\\s+)?(?:damage\\s+)?or\\s+$`, 'i')
const SENTENCE_CRIT = /\b[Oo]n a critical (?:success|hit)\b/
const SENTENCE_CRIT_FAIL = /\b[Oo]n a critical failure\b/
const SENTENCE_FAIL = /\b[Oo]n a failure\b/
const SENTENCE_CRIT_FAILS = /\bcritically fails\b|\b[Oo]n a critical failure\b/
const SENTENCE_FAILS = /\b(?:fails|failed) (?:its|their|the|this) save\b|\b[Oo]n a failure\b/
const SPEND_MORE = /\bIf you spend (\d+) or more actions Casting the Spell\b/i
const MIRROR_DAMAGE = /\byou deal that amount of (\w+) damage\b/i
const MIRROR_HEAL = /\byou restore that amount of Hit Points\b/i
const FLAT_HEAL =
  /\b(?:increase the Hit Points restored by|restores an additional) (\d+)(?: Hit Points)?\b/i
const FLAT_HEAL_STEP =
  /\b(?:extra|additional) healing for the (\d+)-action version increases by (\d+)\b/i
const FLAT_STEP = new RegExp(
  `(?:^|\\band\\s+|,\\s*)(?:the\\s+)?(?:initial\\s+)?(?:persistent\\s+)?(?:${TYPE}\\s+)*damage(?:\\s+on a critical (?:hit|success|failure))?\\s+(?:increases|is increased)\\s+by\\s+(\\d+)\\b(?!\\s*(?:d\\d|feet|-foot))`,
  'gi',
)
const EACH_INCREASE = /\b(?:each|both) increases?\b|\bincreases?\s+by\s*$/i
const CONTINUES =
  /^\s*(?:on a (?:critical )?(?:success|failure)|for the [^,]*?versions?)?\s*,?\s*(?:or|and)?\s*(?:by|to)?\s*$/i
const EACH_AFTER = /^\s*each\b/i
const ACTION_SCOPE = /\bfor the (\d+)-action version\b/i
const ACTIONS_SCOPE = /\bfor the (\d+)- and (\d+)-action versions\b/i
const OTHER_VERSIONS = /\bfor (?:the )?other versions\b/i
const ALL_VERSIONS = /\bfor all versions\b/i
const PER_ACTION = /\bincrease the number of (\w+) you shoot by one\b/i
const PER_ACTION_STEP = /\bYou fire one additional (\w+) with each action you spend\b/i
const MELEE_DIE = /\bincreases all the spell's damage dice to d(\d+)s\b/i
const SELF_ALLIES = /\bYou and (?:all )?(?:your )?allies\b/
const SUSTAINED = /\bsustained\b/i
const DEGREES_AFTER =
  /^\s*on a ((?:critical )?(?:success|failure)(?:,? (?:or|and) (?:a )?(?:critical )?(?:success|failure))*)/i
const ACTIONS_ROUNDS = /^([1-3]) to 2 rounds$/
const ACTIONS_RANGE = /^([1-3]) (to|or) ([1-3])$/

const diceOf = (m: RegExpMatchArray): Pf2eDice => ({
  count: Number(m[1]),
  sides: Number(m[2]),
  mod: Number(m[3] ?? 0),
})
const flat = (mod: number): Pf2eDice => ({ count: 0, sides: 0, mod })

/** "2d6+3", "8", "2d6". */
export function diceText(d: Pf2eDice): string {
  if (!d.count) return String(d.mod)
  return `${d.count}d${d.sides}${d.mod ? sign(d.mod) : ''}`
}

const addDice = (a: Pf2eDice, b: Pf2eDice, times = 1): Pf2eDice => ({
  count: a.count + b.count * times,
  sides: a.count ? a.sides : b.sides,
  mod: a.mod + b.mod * times,
})

/** The main text and its "Heightened" blocks. */
function sections(full: string) {
  const ampAt = full.search(AMP)
  const text = ampAt >= 0 ? full.slice(0, ampAt).replace(/\n-{3,}\s*$/, '') : full
  const amp =
    ampAt >= 0 ? full.slice(ampAt).replace(AMP, '').replace(AMP_HEIGHTENED, '**Heightened') : ''
  const heads = [...text.matchAll(HEIGHTENED)]
  const main = (heads[0] ? text.slice(0, heads[0].index) : text).replace(/\n-{3,}\s*$/, '')
  const blocks = heads.map((h, i) => {
    const start = h.index + h[0].length
    const end = heads[i + 1]?.index ?? text.length
    return {
      step: h[2] ? Number(h[2]) : undefined,
      rank: h[3] ? Number(h[3]) : undefined,
      text: text
        .slice(start, end)
        .replace(/\n-{3,}\s*$/, '')
        .trim(),
    }
  })
  return { main, blocks, amp: amp.trim() }
}

/** Where each degree of success block runs in the main text. */
function degreeRanges(main: string) {
  const bold = [...main.matchAll(BOLD_HEAD)].map((m) => m.index)
  return [...main.matchAll(DEGREE_HEAD)].map((m) => {
    const start = m.index + m[0].length
    const end = bold.find((b) => b > m.index) ?? main.length
    return { degree: DEGREE_NAMES[m[1]!]!, start, end, text: main.slice(start, end).trim() }
  })
}

/** Line ranges of the 1–3 action versions and of battle form Strikes. */
function lineRanges(main: string) {
  const variants: { actions: number; start: number; end: number; text: string }[] = []
  const forms: { start: number; end: number }[] = []
  let at = 0
  for (const line of main.split('\n')) {
    const v = VARIANT_LINE.exec(line)
    if (v) variants.push({ actions: v[1]!.length, start: at, end: at + line.length, text: v[2]! })
    if (FORM_LINE.test(line)) forms.push({ start: at, end: at + line.length })
    at += line.length + 1
  }
  return { variants, forms }
}

/** Sentence spans, so a part knows which sentence it's in. */
function sentenceSpans(main: string) {
  const spans: { start: number; end: number }[] = []
  let start = 0
  for (const m of main.matchAll(/(?<=[.!?])\s+|\n+/g)) {
    spans.push({ start, end: m.index })
    start = m.index + m[0].length
  }
  spans.push({ start, end: main.length })
  return spans
}

interface DiceUse {
  kind: 'damage' | 'healing' | 'temp' | 'duration' | 'form' | 'table' | 'other'
  dice: Pf2eDice
  index: number
  end: number
  type: string
  persistent: boolean
  splash: boolean
}

/** What one dice expression in the text is, from the words around it. */
function classify(text: string, m: RegExpMatchArray, inForm: boolean): DiceUse {
  const dice = diceOf(m)
  const index = m.index!
  const end = index + m[0].length
  const after = text.slice(end, end + 80)
  const before = text.slice(Math.max(0, index - 40), index)
  const base = { dice, index, end, type: '', persistent: false, splash: false }
  if (inForm)
    return { ...base, kind: 'form', type: TYPED_AFTER.exec(after)?.[2]?.toLowerCase() ?? '' }
  if (DURATION_AFTER.test(after)) return { ...base, kind: 'duration' }
  if (TEMP_AFTER.test(after)) return { ...base, kind: 'temp' }
  if (HEAL_AFTER.test(after))
    return LOSES_BEFORE.test(before) ? { ...base, kind: 'damage' } : { ...base, kind: 'healing' }
  const d = DAMAGE_AFTER.exec(after)
  if (d)
    return {
      ...base,
      kind: 'damage',
      type: d[2]?.toLowerCase().replace(/\s+/g, ' ') ?? '',
      persistent: !!d[1],
      splash: !!d[3],
    }
  const typed = TYPED_AFTER.exec(after)
  if (typed)
    return { ...base, kind: 'damage', type: typed[2]!.toLowerCase(), persistent: !!typed[1] }
  const said = DAMAGE_BEFORE.exec(before)
  if (said) return { ...base, kind: 'damage', type: said[1]?.toLowerCase() ?? '' }
  if (TABLE_BEFORE.test(before)) return { ...base, kind: 'table' }
  return { ...base, kind: 'other' }
}

/** Every dice expression in the text, classified, and flat damage ("2 persistent bleed"). */
function diceUses(main: string, forms: { start: number; end: number }[]): DiceUse[] {
  const inForm = (i: number) => forms.some((f) => i >= f.start && i < f.end)
  const uses = [...main.matchAll(DICE)].map((m) => classify(main, m, inForm(m.index)))
  for (const m of main.matchAll(FLAT_DAMAGE)) {
    if (inForm(m.index) || NOT_DEALT.test(main.slice(Math.max(0, m.index - 30), m.index))) continue
    uses.push({
      kind: 'damage',
      dice: flat(Number(m[1])),
      index: m.index,
      end: m.index + m[0].length,
      type: m[3]!.toLowerCase(),
      persistent: !!m[2],
      splash: !!m[4],
    })
  }
  for (const m of main.matchAll(FLAT_UNTYPED)) {
    if (inForm(m.index)) continue
    const index = m.index + m[0].indexOf(m[1]!)
    const end = index + m[1]!.length
    uses.push({
      kind: 'damage',
      dice: flat(Number(m[1])),
      index,
      end,
      type: '',
      persistent: false,
      splash: false,
    })
  }
  return uses.sort((a, b) => a.index - b.index)
}

function parseSaves(defense: string | undefined, main: string) {
  const saves: { save: Pf2eSave; basic: boolean }[] = []
  const source = defense ?? TEXT_SAVE.exec(main)?.[0] ?? ''
  let lastBasic = false
  // Daze's defense says "Will" where its text says "with a basic Will save".
  const textBasic = new Set(
    [...main.matchAll(TEXT_BASIC)].map((m) => m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1)),
  )
  for (const m of source.matchAll(DEFENSE_SAVE)) {
    const save = (m[2]!.charAt(0).toUpperCase() + m[2]!.slice(1).toLowerCase()) as Pf2eSave
    const joined = /\bor\s*$/.test(source.slice(0, m.index))
    const basic: boolean = !!m[1] || (joined && lastBasic) || textBasic.has(save)
    lastBasic = basic
    if (!saves.some((s) => s.save === save)) saves.push({ save, basic })
  }
  return saves
}

const sameKind = (a: Pf2eSpellPart, b: Pf2eSpellPart) =>
  a.role === b.role &&
  !!a.persistent === !!b.persistent &&
  !!a.splash === !!b.splash &&
  a.degree === b.degree &&
  !!a.later === !!b.later &&
  a.dice.count > 0 === b.dice.count > 0 &&
  (a.type === b.type || !a.type || !b.type)

/** The main text's damage and healing, by sentence, degree block and action version. */
function mainParts(main: string, forms: { start: number; end: number }[]) {
  const ranges = degreeRanges(main)
  const { variants } = lineRanges(main)
  const sentences = sentenceSpans(main)
  const uses = diceUses(main, forms)
  const parts: (Pf2eSpellPart & { sentence: number })[] = []
  let last: DiceUse | undefined
  for (const u of uses) {
    const prev = last
    last = u
    if (u.kind !== 'damage' && u.kind !== 'healing' && u.kind !== 'temp') continue
    // "your choice of 2d6 slashing damage or 2d6 piercing damage": one roll, either type.
    const was = parts.at(-1)
    if (
      prev &&
      was &&
      u.kind === 'damage' &&
      was.role === 'damage' &&
      diceText(was.dice) === diceText(u.dice) &&
      ALTERNATIVE.test(main.slice(prev.end, u.index))
    ) {
      was.type = `${was.type} or ${u.type}`
      continue
    }
    const sentence = sentences.findIndex((s) => u.index >= s.start && u.index <= s.end)
    const lead = main.slice(sentences[sentence]?.start ?? 0, u.index)
    const degree =
      ranges.find((r) => u.index >= r.start && u.index < r.end)?.degree ??
      (SENTENCE_CRIT.test(lead)
        ? 'critical success'
        : SENTENCE_CRIT_FAIL.test(lead)
          ? 'critical failure'
          : SENTENCE_FAIL.test(lead)
            ? 'failure'
            : undefined)
    const from = SPEND_MORE.exec(lead)
    const actions =
      variants.find((v) => u.index >= v.start && u.index <= v.end)?.actions ??
      (from ? Number(from[1]) : undefined)
    const part = {
      dice: u.dice,
      role: u.kind,
      type: u.type,
      sentence,
      ...(u.persistent ? { persistent: true } : {}),
      ...(u.splash ? { splash: true } : {}),
      ...(degree ? { degree } : {}),
      ...(actions ? { actions } : {}),
    }
    // The same roll written twice ("On a critical success…" and the Critical Success block).
    if (parts.some((p) => sameKind(p, part) && diceText(p.dice) === diceText(part.dice))) continue
    parts.push(part)
    // "If you spend 2 or more actions…": the same part for each version from there up.
    for (let more = (from && actions ? actions : 3) + 1; more <= 3; more++)
      parts.push({ ...part, actions: more })
  }
  // The cast's own damage is in the first sentence that deals some; damage in later
  // sentences (ending a turn in the area, Sustaining) happens later and isn't rolled with it.
  const firstDamage = parts.find((p) => p.role === 'damage' && !p.degree && !p.actions)
  const firstHeal = parts.find((p) => p.role !== 'damage' && !p.degree && !p.actions)
  for (const p of parts) {
    if (p.degree || p.actions || p.persistent) continue
    const first = p.role === 'damage' ? firstDamage : firstHeal
    if (first && p.sentence !== first.sentence && p.sentence !== firstDamage?.sentence) {
      const s = sentences[p.sentence]
      p.later = true
      if (s) p.note = main.slice(s.start, s.end).trim()
    }
  }
  return { parts: parts.map(({ sentence: _, ...p }) => p as Pf2eSpellPart), ranges, variants }
}

type Scope = number[] | 'others' | 'all' | null

/** "for the 2-action version", "for the 2- and 3-action versions", "for the other versions". */
function scopeOf(text: string): Scope {
  const two = ACTIONS_SCOPE.exec(text)
  if (two) return [Number(two[1]), Number(two[2])]
  const one = ACTION_SCOPE.exec(text)
  if (one) return [Number(one[1])]
  if (OTHER_VERSIONS.test(text)) return 'others'
  if (ALL_VERSIONS.test(text)) return 'all'
  return null
}

interface Amount {
  before: string
  after: string
  dice: Pf2eDice
}

/** Each amount in a heightened block (dice, or a flat "damage increases by 1"), with its clause. */
function amounts(block: string): Amount[] {
  const found = [
    ...[...block.matchAll(DICE)].map((m) => ({
      index: m.index,
      end: m.index + m[0].length,
      dice: diceOf(m),
    })),
    ...[...block.matchAll(FLAT_STEP)].map((m) => {
      const at = m.index + m[0].lastIndexOf(m[1]!)
      return { index: at, end: at + m[1]!.length, dice: flat(Number(m[1])) }
    }),
  ].sort((a, b) => a.index - b.index)
  let from = 0
  let previous = ''
  return found.map((f, i) => {
    const sentenceStart = Math.max(from, block.lastIndexOf('. ', f.index) + 1)
    const clauseStart = Math.max(
      sentenceStart,
      block.lastIndexOf(', and', f.index) + 1,
      block.lastIndexOf('; ', f.index) + 1,
    )
    const next = found[i + 1]?.index ?? block.length
    const after = block.slice(f.end, next)
    // "The slashing damage, initial electricity damage, and persistent … each increase by 1d4":
    // the list is the subject, so the clause runs from the start of the sentence.
    const list =
      EACH_INCREASE.test(block.slice(clauseStart, f.index)) &&
      /\b(?:each|both)\b/i.test(block.slice(clauseStart, f.index))
    const start = list || EACH_AFTER.test(after) ? sentenceStart : clauseStart
    from = f.end
    let before = block.slice(start, f.index)
    // ", or by 2d8 on a failure": the same subject as the amount before it.
    if (CONTINUES.test(before) && previous) before = previous
    previous = before
    return { before, after, dice: f.dice }
  })
}

const LATER_SUBJECT =
  /\b(?:end|start)s? (?:its|their) turns?|\bSustain\b|\beach (?:round|hour|day)\b/i
const PLAIN_WORDS = new Set(
  'the damage increases increase increased initial dealt deals deal each both with from that this spell spells amount also additional extra persistent splash target targets creature creatures'.split(
    ' ',
  ),
)

const typesOf = (p: Pf2eSpellPart) => (p.type.match(TYPE_WORD) ?? []).map((t) => t.toLowerCase())

/** "on a success", "on a failure or critical failure" right after an amount. */
function degreesAfter(after: string): Pf2eDegree[] {
  const m = DEGREES_AFTER.exec(after)
  if (!m) return []
  return [...m[1]!.matchAll(/(critical )?(success|failure)/gi)].map(
    (d) => `${d[1] ? 'critical ' : ''}${d[2]!.toLowerCase()}` as Pf2eDegree,
  )
}

/** The words in a subject that say which damage it is, as 5-letter stems ("burning space"). */
function qualifiers(subject: string) {
  return [...subject.toLowerCase().matchAll(/[a-z’']{4,}/g)]
    .map((m) => m[0])
    .filter((w) => !PLAIN_WORDS.has(w) && !DAMAGE_TYPES.includes(w))
    .map((w) => w.slice(0, 5))
}

/** The part one clause's subject names ("the persistent fire damage on a critical hit"). */
function subjectTarget(
  parts: Pf2eSpellPart[],
  subject: string,
  after: string,
  taken: Set<number>,
): { index?: number; make?: Omit<Pf2eSpellPart, 'dice'> }[] {
  const typeAfter = TYPED_AFTER.exec(after)
  const named = [...subject.matchAll(TYPE_WORD)].map((m) => m[1]!.toLowerCase())
  const types = typeAfter ? [typeAfter[2]!.toLowerCase()] : named
  const persistent = /\bpersistent\b/i.test(subject) || !!typeAfter?.[1]
  const splash = /\bsplash\b/i.test(subject)
  const temp = /\btemporary Hit Points\b/i.test(subject) || TEMP_AFTER.test(after)
  const healing = !temp && /\b(?:heal|healing|Hit Points|HP|regain|recover|restore)/i.test(subject)
  const damage = !temp && (/\bdamage\b/i.test(subject) || !!typeAfter || !healing)
  const degree: Pf2eDegree | undefined = /\bcritical (?:hit|success)\b/i.test(subject)
    ? 'critical success'
    : /\bcritical failure\b/i.test(subject)
      ? 'critical failure'
      : undefined
  const later = LATER_SUBJECT.test(subject)
  const quals = qualifiers(subject)
  // A subject that names what the damage is from ("the burning space", "against holy
  // creatures") goes to the later part whose sentence says so; otherwise the cast's own.
  const find = (want: (p: Pf2eSpellPart) => boolean) => {
    const fit = parts.map((p, i) => ({ p, i })).filter(({ p, i }) => want(p) && !taken.has(i))
    const said = fit.find(
      ({ p }) => p.later && quals.some((q) => p.note?.toLowerCase().includes(q)),
    )
    const pick =
      said ??
      (later ? fit.find(({ p }) => p.later) : undefined) ??
      fit.find(({ p }) => !p.later) ??
      fit[0]
    return pick?.i ?? -1
  }
  const out: { index?: number; make?: Omit<Pf2eSpellPart, 'dice'> }[] = []
  if (temp) {
    const at = find((p) => p.role === 'temp')
    out.push(at >= 0 ? { index: at } : { make: { role: 'temp', type: '' } })
  }
  if (healing) {
    const at = find((p) => p.role === 'healing' && p.dice.count > 0)
    out.push(at >= 0 ? { index: at } : { make: { role: 'healing', type: '' } })
  }
  if (damage) {
    // "increases by 1d8 on a success, or by 2d8 on a failure or critical failure".
    const onDegrees = degreesAfter(after)
    const kindOf = (p: Pf2eSpellPart, strict: boolean) =>
      p.role === 'damage' &&
      (!strict || !!p.persistent === persistent) &&
      !!p.splash === splash &&
      (!degree || p.degree === degree || !p.degree)
    const typedFor = (strict: boolean) =>
      types.flatMap((t) => {
        const at = find((p) => kindOf(p, strict) && typesOf(p).includes(t))
        return at >= 0 ? [{ index: at }] : []
      })
    const dmg = (p: Pf2eSpellPart) => kindOf(p, true)
    // "The bleed damage on a critical failure": bleed is persistent even when it isn't said.
    const typed = typedFor(true).length ? typedFor(true) : typedFor(false)
    if (onDegrees.length) {
      const at = parts
        .map((p, i) =>
          dmg(p) && p.degree && onDegrees.includes(p.degree) && !taken.has(i) ? i : -1,
        )
        .filter((i) => i >= 0)
      if (at.length) {
        out.push(...at.map((index) => ({ index })))
        return out
      }
    }
    if (typed.length) out.push(...typed)
    else {
      const at = find(dmg)
      const make = { role: 'damage' as const, type: types[0] ?? '', persistent, splash, degree }
      out.push(at >= 0 ? { index: at } : { make })
    }
  }
  return out
}

/**
 * The parts one heightened amount goes to. A clause that names an action version goes to that
 * version's part; one that doesn't goes to that part in every version, except those another
 * clause in the block named ("by 1d6, or by 2d6 for the 2-action version").
 */
function targets(parts: Pf2eSpellPart[], a: Amount, scope: Scope, named: Set<number>) {
  const subjects =
    EACH_INCREASE.test(a.before) || EACH_AFTER.test(a.after)
      ? a.before
          .replace(/\b(?:each|both)\b[\s\S]*$|\bincreases?\s+by\s*$/i, '')
          .split(/,\s*(?:and\s+)?|\s+and\s+/)
          .filter((s) => s.trim())
      : [a.before]
  const picked: { indexes: number[]; make?: Omit<Pf2eSpellPart, 'dice'> }[] = []
  // One amount adds to a part once ("the initial damage, as well as the burst damage, each").
  const taken = new Set<number>()
  for (const subject of subjects.length ? subjects : [a.before])
    for (const t of subjectTarget(parts, subject, a.after, taken)) {
      if (t.make) {
        picked.push({
          indexes: [],
          make:
            Array.isArray(scope) && scope.length === 1 ? { ...t.make, actions: scope[0] } : t.make,
        })
        continue
      }
      const primary = parts[t.index!]!
      const kin = parts
        .map((p, i) =>
          i === t.index ||
          (sameKind(p, primary) && (p.actions !== undefined || primary.actions !== undefined))
            ? i
            : -1,
        )
        .filter((i) => i >= 0)
      const inScope = kin.filter((i) => {
        const p = parts[i]!
        if (Array.isArray(scope)) return p.actions !== undefined && scope.includes(p.actions)
        if (scope === 'all') return true
        return !named.has(i)
      })
      const indexes = inScope.length ? inScope : [t.index!]
      for (const i of indexes) taken.add(i)
      picked.push({ indexes })
    }
  return picked
}

/** Runs a block's amounts, those naming an action version first. */
function eachAmount(
  block: string,
  parts: Pf2eSpellPart[],
  use: (a: Amount, indexes: number[], make?: Omit<Pf2eSpellPart, 'dice'>) => void,
) {
  const all = amounts(block).map((a) => ({ a, scope: scopeOf(a.after) ?? scopeOf(a.before) }))
  const named = new Set<number>()
  const ordered = [
    ...all.filter((x) => Array.isArray(x.scope)),
    ...all.filter((x) => !Array.isArray(x.scope)),
  ]
  for (const { a, scope } of ordered)
    for (const t of targets(parts, a, scope, named)) {
      if (Array.isArray(scope)) for (const i of t.indexes) named.add(i)
      use(a, t.indexes, t.make)
    }
}

/** "Heightened (+N)": what each step adds. */
function parseStep(block: string, parts: Pf2eSpellPart[]): Pf2eHeightenAdd[] {
  const adds: Pf2eHeightenAdd[] = []
  eachAmount(block, parts, (a, indexes, make) => {
    if (make) {
      // Nothing in the main text to add to: shown from the heightened rank on, not rolled.
      const note = `${a.before}${diceText(a.dice)}${a.after}`.trim()
      parts.push({ ...make, dice: { count: 0, sides: a.dice.sides, mod: 0 }, later: true, note })
      indexes = [parts.length - 1]
    }
    for (const part of indexes) adds.push({ part, dice: a.dice })
  })
  const heal = FLAT_HEAL_STEP.exec(block)
  if (heal) {
    const actions = Number(heal[1])
    const at = parts.findIndex(
      (p) => p.role === 'healing' && p.actions === actions && !p.dice.count,
    )
    if (at >= 0) adds.push({ part: at, dice: flat(Number(heal[2])) })
  }
  return adds
}

const ADDS =
  /\b(?:increases?|increased|increase)\b[^.]*?\bby\s*$|\b(?:additional|extra|another)\s*$/i

/** "Heightened (Nth)": its amounts set the parts they name ("increases to 9d10"), or add. */
function parseFixed(rank: number, block: string, parts: Pf2eSpellPart[]): Pf2eHeightenFixed {
  const sets: Pf2eHeightenFixed['sets'] = []
  eachAmount(block, parts, (a, indexes, make) => {
    const add = ADDS.test(a.before)
    for (const part of indexes)
      sets.push({ part, to: { ...parts[part]!, dice: a.dice }, ...(add ? { add } : {}) })
    if (make) {
      const note = `${a.before}${diceText(a.dice)}${a.after}`.trim()
      sets.push({ part: -1, to: { ...make, dice: a.dice, later: true, note } })
    }
  })
  return { rank, text: block, sets }
}

/** Versions by actions: "1 to 3" → [1, 2, 3], "2 or 3" → [2, 3], "2 to 2 rounds" → [2, 3]. */
function actionOptions(actions: Pf2eSpellDef['actions']): number[] {
  if (typeof actions !== 'string') return []
  const n = Number
  const rounds = ACTIONS_ROUNDS.exec(actions)
  if (rounds) return [...new Set([n(rounds[1]!), 3])]
  const m = ACTIONS_RANGE.exec(actions)
  if (!m) return []
  const lo = n(m[1]!)
  const hi = n(m[3]!)
  if (m[2] === 'or') return [lo, hi]
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
}

/** Two actions when the spell has a 2-action version (Heal's usual one), else the fewest. */
export const defaultActions = (rules: Pf2eSpellRules) =>
  rules.actionOptions.includes(2) ? 2 : rules.actionOptions[0]

const EFFECTS = new Map(
  PF2E_EFFECTS.filter((e) => !e.name.endsWith('(ally)')).map((e) => [e.name, e]),
)

const cache = new WeakMap<Pf2eSpellDef, Pf2eSpellRules>()

/** Everything the spell's text says it rolls and does, structured. */
export function spellRules(spell: Pf2eSpellDef): Pf2eSpellRules {
  const hit = cache.get(spell)
  if (hit) return hit
  const { main, blocks, amp } = sections(spell.text)
  const { forms } = lineRanges(main)
  const { parts, ranges, variants } = mainParts(main, forms)
  const defense = spell.defense
  const attack = defense ? /\bAC\b/.test(defense) : TEXT_ATTACK.test(main)
  const saves = parseSaves(defense, main)
  const uses = diceUses(main, forms)
  const formStrikes = uses
    .filter((u) => u.kind === 'form')
    .map((u) => {
      const line = forms.find((f) => u.index >= f.start && u.index < f.end)!
      const name = FORM_STRIKE.exec(main.slice(line.start, u.index))?.[1]?.trim() ?? 'Strike'
      return { name, dice: u.dice, type: u.type }
    })
  // Heal and Harm: the other use of the same dice (vitality damage to undead, healing undead).
  const first = parts.find((p) => !p.actions && !p.degree)
  const mirrorDamage = MIRROR_DAMAGE.exec(main)
  const healsUndead = first?.role === 'damage' && MIRROR_HEAL.test(main)
  const undead = healsUndead ? { vs: 'undead' } : {}
  if (first?.role === 'healing' && mirrorDamage)
    parts.push({
      dice: { ...first.dice },
      role: 'damage',
      type: mirrorDamage[1]!.toLowerCase(),
      vs: 'undead',
    })
  if (healsUndead) parts.push({ dice: { ...first.dice }, role: 'healing', type: '', ...undead })
  for (const v of variants) {
    const more = FLAT_HEAL.exec(v.text)
    if (more)
      parts.push({
        dice: flat(Number(more[1])),
        role: 'healing',
        type: '',
        actions: v.actions,
        ...undead,
      })
  }

  const heighten: Pf2eSpellRules['heighten'] = { adds: [], fixed: [] }
  for (const b of blocks) {
    if (b.step) {
      heighten.every = b.step
      heighten.adds.push(...parseStep(b.text, parts))
    } else if (b.rank) heighten.fixed.push(parseFixed(b.rank, b.text, parts))
  }

  const degrees: Pf2eSpellRules['degrees'] = {}
  const conditions: Pf2eSpellRules['conditions'] = {}
  for (const r of ranges) {
    degrees[r.degree] = r.text
    const found = new Map<string, number | undefined>()
    for (const m of r.text.matchAll(CONDITION)) {
      const name = m[1]!.toLowerCase()
      const value = m[2] ? Number(m[2]) : undefined
      const had = found.get(name)
      found.set(name, had === undefined ? value : Math.max(had, value ?? 0))
    }
    if (found.size)
      conditions[r.degree] = [...found].map(([name, value]) =>
        value === undefined ? { name } : { name, value },
      )
  }
  // "If the target critically fails the save, it is also stunned 1" (outside the blocks).
  for (const sentence of main.split(/(?<=[.!?])\s+|\n+/)) {
    if (ranges.some((r) => r.text.includes(sentence))) continue
    const at: Pf2eDegree[] = SENTENCE_CRIT_FAILS.test(sentence)
      ? ['critical failure']
      : SENTENCE_FAILS.test(sentence)
        ? ['failure', 'critical failure']
        : []
    for (const degree of at)
      for (const m of sentence.matchAll(CONDITION)) {
        const list = (conditions[degree] ??= [])
        const name = m[1]!.toLowerCase()
        if (!list.some((c) => c.name === name))
          list.push(m[2] ? { name, value: Number(m[2]) } : { name })
      }
  }

  const perAction = PER_ACTION.exec(main)
  const perStep = blocks.some((b) => b.step && PER_ACTION_STEP.test(b.text))
  const meleeDie = MELEE_DIE.exec(main)
  const def = EFFECTS.get(spell.name)
  const rules: Pf2eSpellRules = {
    attack,
    saves,
    ...(defense && !attack && !saves.length ? { defenseNote: defense } : {}),
    parts,
    forms: formStrikes,
    durationDice: uses.filter((u) => u.kind === 'duration').map((u) => u.dice),
    tableDice: uses.filter((u) => u.kind === 'table').map((u) => u.dice),
    degrees,
    conditions,
    heighten,
    actionOptions: actionOptions(spell.actions),
    variants: variants.map((v) => ({ actions: v.actions, text: v.text })),
    ...(perAction ? { perAction: { noun: perAction[1]!, perStep: perStep ? 1 : 0 } } : {}),
    ...(meleeDie ? { meleeDie: Number(meleeDie[1]) } : {}),
    sustained: SUSTAINED.test(spell.duration ?? ''),
    ...(def
      ? { effect: { def, self: (!spell.targets && !spell.range) || SELF_ALLIES.test(main) } }
      : {}),
    ...(amp
      ? {
          amp: spellRules({ ...spell, name: `${spell.name} (amp)`, text: amp, defense: undefined }),
        }
      : {}),
  }
  cache.set(spell, rules)
  return rules
}

export interface Pf2eCastOptions {
  /** The rank it's cast at (a cantrip at half the level, a slot's rank when heightened). */
  rank: number
  /** For spells with 1–3 action versions; the default is `defaultActions`. */
  actions?: number
  /** A melee spell attack (Ignition's d6s). */
  melee?: boolean
}

/** Force Barrage: how many shards at this rank and action count. */
export function pieces(spell: Pf2eSpellDef, rules: Pf2eSpellRules, o: Pf2eCastOptions) {
  const actions = o.actions ?? defaultActions(rules) ?? 1
  if (!rules.perAction) return 0
  const steps = Math.max(0, Math.floor((o.rank - spell.rank) / (rules.heighten.every ?? 2)))
  return actions * (1 + rules.perAction.perStep * steps)
}

/**
 * The parts at a rank and action count (p. 297): each "+N" step adds its dice, the highest
 * "Nth" block at or below the rank sets its values, and an action version's own dice replace
 * the base ones (Heal's +8 adds to them).
 */
export function partsAt(
  spell: Pf2eSpellDef,
  rules: Pf2eSpellRules,
  o: Pf2eCastOptions,
): Pf2eSpellPart[] {
  const every = rules.heighten.every
  const steps = every ? Math.max(0, Math.floor((o.rank - spell.rank) / every)) : 0
  let parts = rules.parts.map((p) => ({ ...p, dice: { ...p.dice } }))
  for (const a of rules.heighten.adds) {
    const p = parts[a.part]
    if (p) p.dice = addDice(p.dice, a.dice, steps)
  }
  const fixed = rules.heighten.fixed
    .filter((f) => f.rank <= o.rank)
    .sort((a, b) => b.rank - a.rank)[0]
  for (const s of fixed?.sets ?? []) {
    const p = parts[s.part]
    if (!p) parts.push({ ...s.to, dice: { ...s.to.dice } })
    else p.dice = s.add ? addDice(p.dice, s.to.dice) : { ...s.to.dice }
  }
  const actions = o.actions ?? defaultActions(rules)
  if (rules.actionOptions.length && actions) {
    const own = parts.filter((p) => p.actions === actions && p.dice.count > 0)
    parts = parts.filter((p) => {
      if (p.actions !== undefined) return p.actions === actions
      return !own.some((v) => sameKind(v, p) && !p.later)
    })
  }
  const each = pieces(spell, rules, o)
  if (each)
    parts = parts.map((p) => ({
      ...p,
      dice: { count: p.dice.count * each, sides: p.dice.sides, mod: p.dice.mod * each },
    }))
  if (o.melee && rules.meleeDie)
    parts = parts.map((p) =>
      p.dice.count && p.role === 'damage'
        ? { ...p, dice: { ...p.dice, sides: rules.meleeDie! } }
        : p,
    )
  return parts.filter((p) => p.dice.count > 0 || p.dice.mod > 0)
}

/** A scaling effect's value at a rank (Heroism +2 from 6th, +3 from 9th; Enlarge +4 from 4th). */
export function effectValue(spell: Pf2eSpellDef, def: Pf2eEffectDef, rank: number) {
  if (!def.values?.length) return undefined
  // "Heightened (+N)" steps past the spell's rank, or the "Heightened (Nth)" ranks reached.
  const step = spell.heightened?.step
  const reached = step
    ? Math.max(0, Math.floor((rank - spell.rank) / step))
    : (spell.heightened?.ranks ?? []).filter((r) => r <= rank).length
  return def.values[Math.min(def.values.length - 1, reached)]
}

const BASIC: Record<Pf2eDegree, number> = {
  'critical success': 0,
  success: 0.5,
  failure: 1,
  'critical failure': 2,
}
const DEGREE_ORDER: Pf2eDegree[] = ['critical success', 'success', 'failure', 'critical failure']
const SHORT: Record<Pf2eDegree, string> = {
  'critical success': 'crit success',
  success: 'success',
  failure: 'failure',
  'critical failure': 'crit failure',
}

export interface Pf2eCastRoll {
  /** The result line. */
  text: string
  /** Healing rolled (for Heal yourself), if the spell heals. */
  healing?: number
  /** Temporary Hit Points rolled. */
  temp?: number
  /** The spell attack's degree against the target's AC, when it was given. */
  degree?: Pf2eDegree
}

interface Rolled {
  part: Pf2eSpellPart
  total: number
}

const label = (p: Pf2eSpellPart) =>
  [p.persistent ? 'persistent' : '', p.type, p.splash ? 'splash' : ''].filter(Boolean).join(' ')

/** "9 (7 electricity, 2 sonic)" or "9 fire"; `times` doubles or halves (rounded down). */
function sumText(rolled: Rolled[], times = 1) {
  const total = Math.floor(rolled.reduce((n, r) => n + r.total, 0) * times)
  if (rolled.length === 1) {
    const l = label(rolled[0]!.part)
    return `${total}${l ? ` ${l}` : ''}`
  }
  const each = rolled.map((r) => {
    const l = label(r.part)
    return `${Math.floor(r.total * times)}${l ? ` ${l}` : ''}`
  })
  return `${total} (${each.join(', ')})`
}

/** "2d6 persistent fire", "1d8 healing", "5 temp HP". */
const partText = (p: Pf2eSpellPart) =>
  p.role === 'healing'
    ? `${diceText(p.dice)} healing${p.vs ? ` to ${p.vs}` : ''}`
    : p.role === 'temp'
      ? `${diceText(p.dice)} temp HP`
      : `${diceText(p.dice)}${label(p) ? ` ${label(p)}` : ''}${p.vs ? ` to ${p.vs}` : ''}`

const conditionText = (c: { name: string; value?: number }) =>
  c.value === undefined ? c.name : `${c.name} ${c.value}`

const firstSentence = (text: string) => {
  const one = text.replace(/\s+/g, ' ').trim()
  const end = one.search(/(?<=\.)\s/)
  return end > 0 ? one.slice(0, end) : one
}

export interface Pf2eCastContext extends Pf2eCastOptions {
  /** Spell attack modifier, the multiple attack penalty already taken off. */
  attackBonus: number
  dc: number
  /** The target's AC, when known. */
  targetAc?: number | null
  rng?: Rng
}

/**
 * Rolls what a spell rolls at the rank it's cast (pp. 297, 302–303): a spell attack against the
 * target's AC (a critical hit doubles the damage, persistent included), the damage once with a
 * basic save's four results (none, half, full, double), each degree's own text and dice for
 * other saves, and healing. Damage the spell deals later is listed, not rolled. Empty text
 * when the spell rolls nothing.
 */
export function castRolls(spell: Pf2eSpellDef, c: Pf2eCastContext): Pf2eCastRoll {
  const rules = spellRules(spell)
  const parts = partsAt(spell, rules, c)
  const roll = (p: Pf2eSpellPart): Rolled => ({
    part: p,
    total: p.dice.count ? rollDice(p.dice, c.rng).total : p.dice.mod,
  })
  const now = parts.filter((p) => !p.later)
  const healParts = now.filter((p) => p.role === 'healing' && !p.degree && !p.vs)
  const healUndead = now.filter((p) => p.role === 'healing' && !p.degree && p.vs)
  const tempParts = now.filter((p) => p.role === 'temp' && !p.degree)
  const damage = now.filter((p) => p.role === 'damage' && !p.degree && !p.persistent)
  const persistent = now.filter((p) => p.role === 'damage' && !p.degree && p.persistent)
  const byDegree = (d: Pf2eDegree) => now.filter((p) => p.degree === d && p.role === 'damage')
  const count = pieces(spell, rules, c)
  const shards = count ? ` (${count} ${rules.perAction!.noun})` : ''
  const out: string[] = []
  const result: Pf2eCastRoll = { text: '' }

  if (healParts.length) {
    const healed = healParts.map(roll).reduce((n, r) => n + r.total, 0)
    result.healing = healed
    out.push(`Heals ${healed} HP (${healParts.map((p) => diceText(p.dice)).join(' + ')}).`)
  }
  if (healUndead.length) {
    const healed = healUndead.map(roll).reduce((n, r) => n + r.total, 0)
    const dice = healUndead.map((p) => diceText(p.dice)).join(' + ')
    out.push(`Heals ${healUndead[0]!.vs} ${healed} HP (${dice}).`)
  }
  if (tempParts.length) {
    const temp = tempParts.map(roll).reduce((n, r) => n + r.total, 0)
    result.temp = temp
    out.push(`${temp} temporary HP (${tempParts.map((p) => diceText(p.dice)).join(' + ')}).`)
  }

  const rolled = damage.map(roll)
  const persist = persistent.map(roll)
  const dmgDice = damage.map((p) => diceText(p.dice)).join(' + ')
  const persistNote = persist.length ? ` Plus ${sumText(persist)} damage.` : ''
  if (rules.attack) {
    const a = rollAttack(c.attackBonus, c.rng)
    const nat = a.natural ? `, natural ${a.natural}` : ''
    const degree = c.targetAc ? degreeOf(a.total, a.d20, c.targetAc) : undefined
    if (degree) result.degree = degree
    const vs = degree ? ` vs AC ${c.targetAc}: ${SHORT[degree]}` : ''
    out.push(`Spell attack ${a.total} (${a.d20} ${sign(c.attackBonus)}${nat})${vs}.`)
    if (rolled.length || persist.length) {
      const extra = byDegree('critical success').map(roll)
      const extraNote = extra.length ? ` plus ${sumText(extra)}` : ''
      const crit = `${sumText([...rolled, ...persist], 2)}${extraNote}`
      if (!degree)
        out.push(
          `Damage ${sumText(rolled)}${shards} (${dmgDice}) on a hit;${persistNote.replace(/\.$/, ';')} critical hit ${crit}.`,
        )
      else if (degree === 'critical success') out.push(`Critical hit: ${crit} damage.`)
      else if (degree === 'success') out.push(`Hit: ${sumText(rolled)} damage.${persistNote}`)
      else out.push(rules.degrees[degree] ? firstSentence(rules.degrees[degree]!) : 'No damage.')
    }
  } else if (c.dc && rules.saves.length) {
    const save = rules.saves.map((s) => `${s.basic ? 'basic ' : ''}${s.save}`).join(' or ')
    const vs = damage.length && damage.every((p) => p.vs) ? `Against ${damage[0]!.vs}: ` : ''
    out.push(`${vs}DC ${c.dc} ${save}.`)
    if (rolled.length && rules.saves.some((s) => s.basic)) {
      const each = DEGREE_ORDER.map((d) => {
        const extra = byDegree(d).map(roll)
        const base = BASIC[d] ? sumText(rolled, BASIC[d]) : '0'
        return `${SHORT[d]} ${base}${extra.length ? ` + ${sumText(extra)}` : ''}`
      })
      out.push(`Damage ${dmgDice}${shards}: ${each.join(', ')}.${persistNote}`)
      const gives = DEGREE_ORDER.flatMap((d) => {
        const list = rules.conditions[d]
        return list?.length ? [`${SHORT[d]} ${list.map(conditionText).join(', ')}`] : []
      })
      if (gives.length) out.push(`Conditions: ${gives.join('; ')}.`)
    } else {
      if (rolled.length) out.push(`Damage ${sumText(rolled)}${shards} (${dmgDice}).${persistNote}`)
      else if (persistNote) out.push(persistNote.trim())
      for (const d of DEGREE_ORDER) {
        const extra = byDegree(d).map(roll)
        const text = rules.degrees[d]
        if (!text && !extra.length) continue
        const dmg = extra.length ? ` [${sumText(extra)}]` : ''
        out.push(`${SHORT[d]}: ${firstSentence(text ?? '')}${dmg}`)
      }
    }
  } else if (rolled.length) {
    out.push(`Damage ${sumText(rolled)}${shards} (${dmgDice}).${persistNote}`)
  } else if (persistNote) out.push(persistNote.trim())
  const later = parts.filter((p) => p.later).map(partText)
  if (later.length) out.push(`Not rolled (see the text): ${later.join(', ')}.`)
  result.text = out.join(' ')
  return result
}

/** The spell's defense and what it rolls at a rank, for its row: "basic Reflex · 6d6 fire". */
export function spellSummary(spell: Pf2eSpellDef, o: Pf2eCastOptions): string {
  const rules = spellRules(spell)
  const parts = partsAt(spell, rules, o).filter((p) => !p.degree && !p.later)
  const defense = rules.attack
    ? 'spell attack'
    : rules.saves.map((s) => `${s.basic ? 'basic ' : ''}${s.save}`).join(' or ')
  const order = { healing: 0, temp: 1, damage: 2 }
  const rolls = [...parts].sort((a, b) => order[a.role] - order[b.role]).map(partText)
  const def = rules.effect?.def
  const value = def ? effectValue(spell, def, o.rank) : undefined
  const effect = def ? `${def.name}${value === undefined ? '' : ` +${value}`}` : ''
  return [defense, rolls.join(' + '), effect, rules.sustained ? 'sustained' : '']
    .filter(Boolean)
    .join(' · ')
}

/**
 * Every pattern the parser reads spell text, defenses and action costs with, for
 * `tests/pf2eSpellRules.test.ts` to check each still matches some spell.
 */
export const SPELL_PATTERNS: Record<string, RegExp> = {
  TYPE_WORD,
  CONDITION,
  DICE,
  FLAT_DAMAGE,
  FLAT_UNTYPED,
  NOT_DEALT,
  DEFENSE_SAVE,
  TEXT_ATTACK,
  TEXT_SAVE,
  AMP,
  AMP_HEIGHTENED,
  DEGREE_HEAD,
  BOLD_HEAD,
  HEIGHTENED,
  VARIANT_LINE,
  FORM_LINE,
  FORM_STRIKE,
  DURATION_AFTER,
  TEMP_AFTER,
  HEAL_AFTER,
  LOSES_BEFORE,
  DAMAGE_AFTER,
  TYPED_AFTER,
  DAMAGE_BEFORE,
  TABLE_BEFORE,
  ALTERNATIVE,
  SENTENCE_CRIT,
  SENTENCE_CRIT_FAIL,
  SENTENCE_FAIL,
  SENTENCE_CRIT_FAILS,
  SENTENCE_FAILS,
  TEXT_BASIC,
  SPEND_MORE,
  MIRROR_DAMAGE,
  MIRROR_HEAL,
  FLAT_HEAL,
  FLAT_HEAL_STEP,
  FLAT_STEP,
  EACH_INCREASE,
  EACH_AFTER,
  ACTION_SCOPE,
  ACTIONS_SCOPE,
  OTHER_VERSIONS,
  ALL_VERSIONS,
  PER_ACTION,
  PER_ACTION_STEP,
  MELEE_DIE,
  SELF_ALLIES,
  SUSTAINED,
  LATER_SUBJECT,
  DEGREES_AFTER,
  ACTIONS_ROUNDS,
  ACTIONS_RANGE,
  ADDS,
}
