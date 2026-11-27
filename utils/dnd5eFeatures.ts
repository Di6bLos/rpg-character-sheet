// Every class feature, subclass feature, species trait, feat benefit and option-group pick
// (Eldritch Invocations, Metamagic, maneuvers, Arcane Shots, artificer plans, and any group the
// data adds) a 5e (2024) hero has, as a usable entry: its cost on the turn (`activation`), the
// limited use it spends (by the resource of its name, its parent's, or the option's `cost`
// such as "1 Superiority Die" or "2 Sorcery Points"), its dice (class table columns resolved),
// damage type and save DC, read from the data's mechanics fields. `DND5E_FEATURE_RULES` adds
// what fields can't say: Rage and Steady Aim turn on effects, Second Wind and Lay on Hands
// heal, Action Surge gives an action, Flurry of Blows makes Unarmed Strikes, Cunning Action
// takes a core action as a Bonus Action. Everything else still shows, as a card with its text
// and counter. Also the 2024 core actions (SRD 5.2.1 pp. 9–11). Pure; the Actions, Reactions,
// Resources and Features panels use it. tests/dnd5eRules.test.ts checks each rule's name is in
// the data.
import type { Dnd5eData } from '~/data/dnd5e'
import type { Dnd5eActivation, Dnd5eFeature, Dnd5eMechanics, Dnd5eSave } from '~/data/dnd5e/types'
import type { Dnd5eAbility, Dnd5eFeatureEntry, Dnd5eSheet } from '~/types/sheets'
import { type Dnd5eColumns, type Dnd5eTarget, adjustAttackTest } from '~/utils/dnd5eAttacks'
import { addEffect, DND5E_EFFECTS } from '~/utils/dnd5eEffects'
import {
  type Dnd5eCost,
  costWhy,
  d20Test,
  castingFor,
  classOfSource,
  dnd5eHero,
  heroClasses,
  gainTempHp,
  heal,
  norm5e,
  sourceLevel,
  payCost,
  restoreUses,
  rollTest,
  spendHitDie,
  spendUses,
  useOnce,
  usedOnce,
  usesLeft,
} from '~/utils/dnd5ePlay'
import { type Rng, parseDice, rollDice, sign } from '~/utils/dice'

export type Dnd5eFeatureData = Pick<
  Dnd5eData,
  'classes' | 'subclasses' | 'feats' | 'options' | 'species'
>

/** What a feature does that its fields can't say. */
export interface Dnd5eFeatureRule {
  /** Turns on an effect (`DND5E_EFFECTS`). */
  effect?: string
  /** Heals: its dice (or these) plus the class level, an ability modifier or PB. */
  heal?: { dice?: string; plus?: ('level' | 'PB' | Dnd5eAbility)[] }
  /** Temporary Hit Points, the same way. */
  temp?: { dice?: string; plus?: ('level' | 'PB' | Dnd5eAbility)[] }
  /** Extra actions this turn (Action Surge). */
  actions?: number
  /** Core actions it takes (Cunning Action's Dash, Patient Defense's Disengage and Dodge). */
  core?: string[]
  /** Unarmed Strikes it makes (Flurry of Blows: 2, 3 with Heightened Focus). */
  unarmed?: number
  /** A pool spent by the amount chosen (Lay on Hands). */
  pool?: boolean
  /** Spends a Hit Point Die (Durable's Speedy Recovery). */
  hitDie?: boolean
  /** Gives the resource of this name back in full (Uncanny Metabolism's Focus Points). */
  refill?: string
  /** Its dice go to an ally, not rolled here (Bardic Inspiration). */
  give?: boolean
  /** Its dice by character level (Breath Weapon, Divine Spark). */
  diceAt?: Record<number, string>
  /** What it costs when the data doesn't say. */
  cost?: Dnd5eCost
  /** Not used from the Actions panel: the Resources panel does it (Font of Magic, Arcane Recovery). */
  skip?: boolean
  /**
   * The value the effect keeps: an ability modifier (at least +1), a number by class level, a
   * pool's die size (`die`: Feinting Attack) or its roll (`roll`: Evasive Footwork's AC).
   */
  value?: Dnd5eAbility | { at: Record<number, number> } | { die: string } | { roll: string }
  /** The resource it spends when the data doesn't say (Cutting Words: Bardic Inspiration). */
  resource?: string
  /** How many uses of it (Elemental Burst: 2 Focus Points). */
  spend?: number
  /** Its dice and healing go to someone else: rolled and said, not applied. */
  toAlly?: boolean
  /** A condition it gives you (Nature's Veil: Invisible). */
  condition?: string
  /** It makes a spell attack roll (Holy Bolt), against the Target row's AC. */
  spellAttack?: Dnd5eAbility
  /** Added to its damage or healing: class level or an ability modifier. */
  plus?: ('level' | Dnd5eAbility)[]
  /** Its dice count is the Rage Damage bonus or an ability modifier (Lava Burst: Rage d4s). */
  diceTimes?: 'rage' | Dnd5eAbility | number
  /** You also regain as many Hit Points as it deals (Devouring Plague). */
  healSame?: boolean
  /** Its pool is dice (Warrior of the Gods' d12s): the amount spent is how many to roll. */
  poolDice?: string
  /** A line it adds to the result. */
  say?: string
}

export const DND5E_FEATURE_RULES: Record<string, Dnd5eFeatureRule> = {
  Rage: { effect: 'rage' },
  'Reckless Attack': { effect: 'reckless', cost: 'free' },
  'Second Wind': { heal: { plus: ['level'] } },
  'Action Surge': { actions: 1 },
  'Steady Aim': { effect: 'steady-aim' },
  'Cunning Action: Dash': { core: ['dash'] },
  'Cunning Action: Disengage': { core: ['disengage'] },
  'Cunning Action: Hide': { core: ['hide'] },
  'Monk’s Focus: Flurry of Blows': { unarmed: 2 },
  'Monk’s Focus: Patient Defense': { core: ['disengage', 'dodge'] },
  'Monk’s Focus: Step of the Wind': { core: ['disengage', 'dash'] },
  'Uncanny Metabolism': { heal: { plus: ['level'] }, refill: 'Monk’s Focus' },
  'Wild Shape': { effect: 'wild-shape' },
  'Lay on Hands': { pool: true },
  'Innate Sorcery': { effect: 'innate-sorcery' },
  'Bardic Inspiration': { give: true },
  'Dark One’s Blessing': { temp: { plus: ['CHA', 'level'] }, cost: 'free' },
  Tireless: { temp: { plus: ['WIS'] } },
  'Adrenaline Rush': { core: ['dash'], temp: { plus: ['PB'] } },
  'Healing Hands': { heal: { dice: 'PBd4' } },
  'Breath Weapon': { diceAt: { 1: '1d10', 5: '2d10', 11: '3d10', 17: '4d10' } },
  'Channel Divinity: Divine Spark': { diceAt: { 1: '1d8', 7: '2d8', 13: '3d8', 18: '4d8' } },
  'Durable: Speedy Recovery': { hitDie: true },
  'Arcane Recovery': { skip: true },
  'Magical Cunning': { skip: true },
  'Converting Spell Slots to Sorcery Points': { skip: true },
  'Creating Spell Slots': { skip: true },
  'Spell Slot to Wild Shape': { skip: true },
  'Wild Shape to Spell Slot': { skip: true },
  'Lucky: Luck Points': { skip: true },
  'Font of Inspiration': { skip: true },
  'Flash of Genius': { skip: true },
  Portent: { skip: true },
  'Tides of Chaos': { effect: 'tides-of-chaos', cost: 'free' },
  // Barbarian subclasses
  'Rage of the Gods': { effect: 'rage-of-the-gods', cost: 'free' },
  'Warrior of the Gods': { pool: true, poolDice: '1d12' },
  'Raging Elements: Icefury': { spellAttack: 'CON', diceTimes: 'rage' },
  'Raging Elements: Lava Burst': { diceTimes: 'rage' },
  'Raging Elements: Lightning Bolt': { diceTimes: 'rage' },
  'Spirit Shield': { diceTimes: 'rage', toAlly: true },
  'Zealous Presence': { say: 'Up to ten other creatures within 60 ft gain Zealous Presence.' },
  // Bard
  'Cutting Words': { resource: 'Bardic Inspiration' },
  'Mantle of Inspiration': {
    resource: 'Bardic Inspiration',
    toAlly: true,
    say: 'Up to CHA creatures gain twice the roll in temporary HP and may move.',
  },
  'Inspiring Movement': { resource: 'Bardic Inspiration' },
  'Tandem Footwork': {
    resource: 'Bardic Inspiration',
    toAlly: true,
    say: 'You and allies within 30 ft add it to Initiative.',
  },
  'Spirits from Beyond': { resource: 'Bardic Inspiration' },
  // Cleric
  'Holy Bolt': {
    resource: 'Channel Divinity',
    spellAttack: 'WIS',
    plus: ['WIS'],
    say: 'On a hit, a creature you see within 60 ft heals 1d10 + WIS.',
  },
  'Radiance of the Dawn': { resource: 'Channel Divinity', plus: ['level'] },
  'Preserve Life': {
    resource: 'Channel Divinity',
    say: 'Divide five times your Cleric level in healing among Bloodied creatures within 30 ft.',
  },
  'Path to the Grave': { resource: 'Channel Divinity' },
  Shadowform: { resource: 'Channel Divinity', effect: 'shadowform' },
  'Devouring Plague': { healSame: true },
  'Luminous Barrier': {
    resource: 'Channel Divinity',
    toAlly: true,
    plus: ['level', 'WIS'],
    say: 'Each blessed creature gains that many temporary HP and resists all damage while they last.',
  },
  'Divine Foreknowledge': { effect: 'foreknowledge' },
  'Invoke Duplicity': { resource: 'Channel Divinity' },
  'Mind Magic': { resource: 'Channel Divinity' },
  'Modify Magic: Fortifying Spell': {
    resource: 'Channel Divinity',
    toAlly: true,
    plus: ['level'],
    say: 'One of the spell’s targets gains that many temporary HP.',
  },
  'Modify Magic: Tenacious Spell': { resource: 'Channel Divinity', toAlly: true },
  // Druid
  'Moonlight Step': { effect: 'moonlight-step' },
  'Starry Form: Archer': {
    effect: 'starry-archer',
    resource: 'Wild Shape',
    spellAttack: 'WIS',
    plus: ['WIS'],
  },
  'Starry Form: Chalice': {
    effect: 'starry-chalice',
    resource: 'Wild Shape',
    toAlly: true,
    plus: ['WIS'],
  },
  'Starry Form: Dragon': { effect: 'starry-dragon', resource: 'Wild Shape' },
  'Wrath of the Sea': { effect: 'wrath-of-the-sea', resource: 'Wild Shape', diceTimes: 'WIS' },
  'Land’s Aid': {
    resource: 'Wild Shape',
    say: 'One creature you choose in the Sphere regains 2d6 HP.',
  },
  'Nature’s Sanctuary': { resource: 'Wild Shape' },
  // Fighter
  'Feinting Attack': { effect: 'feinting', value: { die: 'Combat Superiority' } },
  'Lunging Attack': { core: ['dash'], effect: 'lunging', value: { die: 'Combat Superiority' } },
  'Evasive Footwork': {
    core: ['disengage'],
    effect: 'evasive-footwork',
    value: { roll: 'Combat Superiority' },
  },
  'Bait and Switch': { effect: 'bait-and-switch', value: { roll: 'Combat Superiority' } },
  Rally: {
    toAlly: true,
    say: 'An ally within 30 ft gains the roll + half your Fighter level in temporary HP.',
  },
  'Battle Shout': {
    toAlly: true,
    say: 'Allies within 30 ft add the roll to damage on their next melee hit before your next turn.',
  },
  'Demoralizing Shout': {
    toAlly: true,
    say: 'Enemies within 30 ft take the roll off their next melee hit against anyone but you.',
  },
  'Commander’s Strike': {
    cost: 'attack',
    toAlly: true,
    say: 'Give up one attack: an ally uses its Reaction to attack, adding the roll to damage on a hit.',
  },
  'Telekinetic Adept: Psi-Powered Leap': { effect: 'psi-leap' },
  'Group Recovery': {
    toAlly: true,
    plus: ['level'],
    say: 'Up to CHA allies within 30 ft each regain that many HP.',
  },
  // Monk
  'Hand of Healing': { heal: { plus: ['WIS'] }, resource: 'Monk’s Focus' },
  'Wholeness of Body': { heal: { plus: ['WIS'] } },
  'Elemental Attunement': { effect: 'elemental-attunement', resource: 'Monk’s Focus' },
  'Elemental Burst': { resource: 'Monk’s Focus', spend: 2, diceTimes: 3 },
  'Shadow Step': { effect: 'shadow-step' },
  'Cloak of Shadows': { condition: 'Invisible', resource: 'Monk’s Focus', spend: 3 },
  'Superior Defense': {
    effect: 'superior-defense',
    resource: 'Monk’s Focus',
    spend: 3,
    cost: 'free',
  },
  'Quivering Palm': { resource: 'Monk’s Focus', spend: 4 },
  'Hand of Ultimate Mercy': { resource: 'Monk’s Focus', spend: 5, plus: ['WIS'], toAlly: true },
  // Paladin
  'Sacred Weapon': {
    effect: 'sacred-weapon',
    value: 'CHA',
    resource: 'Channel Divinity',
    cost: 'free',
  },
  'Vow of Enmity': { effect: 'vow-of-enmity', resource: 'Channel Divinity', cost: 'free' },
  'Peerless Athlete': { effect: 'peerless-athlete', resource: 'Channel Divinity' },
  'Nature’s Wrath': { resource: 'Channel Divinity' },
  'Abjure Foes': { resource: 'Channel Divinity' },
  'Inspiring Smite': {
    resource: 'Channel Divinity',
    toAlly: true,
    plus: ['level'],
    say: 'Split that many temporary HP among creatures within 30 ft, you included.',
  },
  'Beacon of Light': { resource: 'Channel Divinity' },
  'Holy Nimbus': { effect: 'holy-nimbus' },
  'Living Legend': { effect: 'living-legend' },
  'Elder Champion': { effect: 'elder-champion' },
  'Avenging Angel': { effect: 'avenging-angel' },
  'Noble Scion': { effect: 'noble-scion' },
  // Ranger
  'Nature’s Veil': { condition: 'Invisible' },
  'Wrath of the Wild': { effect: 'wrath-of-the-wild', value: { at: { 3: 1, 11: 2 } } },
  'Fortifying Soul': {
    toAlly: true,
    plus: ['level'],
    say: 'Up to WIS creatures each heal that much.',
  },
  'Soul Fragments: Soul Cleave': { resource: 'Soul Fragments', plus: ['WIS'] },
  // Rogue, Sorcerer, Warlock, Wizard
  'Ghost Walk': { effect: 'ghost-walk' },
  'Psychic Veil': { condition: 'Invisible' },
  'Umbral Form': { effect: 'umbral-form', cost: 'free' },
  'Crown of Spellfire': { effect: 'crown-of-spellfire', cost: 'free' },
  'Dragon Wings': { effect: 'dragon-wings' },
  'Trance of Order': { effect: 'trance-of-order' },
  'Form of Dread': { effect: 'form-of-dread', temp: { dice: '1d10', plus: ['level'] } },
  'Steps of the Fey: Refreshing Step': { toAlly: true },
  Bladesong: { effect: 'bladesong', value: 'INT' },
  // Artificer
  'Experimental Elixir: Healing': { heal: { plus: ['INT'] } },
  'Experimental Elixir: Swiftness': { effect: 'elixir-swiftness' },
  'Experimental Elixir: Resilience': { effect: 'elixir-resilience' },
  'Experimental Elixir: Boldness': { effect: 'elixir-boldness' },
  'Experimental Elixir: Flight': { effect: 'elixir-flight' },
}

/** A feature or pick the hero has, ready to show and use. */
export interface Dnd5eEntry {
  key: string
  name: string
  /** What gives it, as the sheet records it ("Fighter 2", "Elf", "Feat · Human", "Metamagic"). */
  from: string
  kind: 'class' | 'subclass' | 'species' | 'feat' | 'option' | 'other'
  /** The rules in short: the data's summary, else the sheet's or the SRD's text. */
  text: string
  /** The SRD's full text, when `text` is its summary. */
  full?: string
  cost: Dnd5eCost | null
  /** The limited use it spends, and how many. */
  resource?: string
  spend: number
  /** Spends Pact Magic slots (Eldritch Smite). */
  pact?: boolean
  dice?: string
  damageType?: string
  save?: { ability: Dnd5eAbility; dc: number }
  rule?: Dnd5eFeatureRule
  /** Rolls damage at a target: it goes to the Attacks panel's Abilities group. */
  attack: boolean
  /** Has nothing to use (no cost, no uses): a card only. */
  passive: boolean
  duration?: string
  /** A use limit that comes back each turn ("once a turn"). */
  oncePerTurn?: boolean
  /** The feature this is an option of (Cunning Action for its Dash). */
  parent?: string
  /** What else gives a use back, as the data says ("a level 5 spell slot"). */
  restore?: string
  /** The level of the class it comes from ("your Barbarian level"); the hero's level otherwise. */
  classLevel?: number
}

/**
 * The class table columns ("Rage Damage", "Sneak Attack", "Martial Arts") of every class the
 * hero has, each at that class's level, the first class's first when two share a name.
 */
export function heroColumns(
  s: Dnd5eSheet,
  level: number,
  data: Pick<Dnd5eFeatureData, 'classes'> | null,
): Dnd5eColumns {
  const out: Dnd5eColumns = {}
  for (const c of [...heroClasses(s, level)].reverse()) {
    const cls = data?.classes.find((x) => x.slug === c.slug)
    Object.assign(out, cls?.levels.find((l) => l.level === c.level)?.columns ?? {})
  }
  return out
}

const ACTIVATION: Record<Dnd5eActivation, Dnd5eCost> = {
  action: 'action',
  magic: 'magic',
  bonus: 'bonus',
  reaction: 'reaction',
  free: 'free',
  special: 'special',
}

/** "Fighter 2" → Fighter at level 2; "Champion 3"; "Feat · Human"; "Elf". */
function owner(from: string): { name: string; level?: number } {
  const m = /^(.*\S)\s+(\d+)$/.exec(from)
  return m
    ? { name: m[1]!, level: Number(m[2]) }
    : { name: from.replace(/^Feat(?: · .*)?$/, 'Feat') }
}

/** The data record behind a sheet feature, with what kind it is; null for a hand-made one. */
export function featureRecord(
  s: Dnd5eSheet,
  f: Dnd5eFeatureEntry,
  data: Dnd5eFeatureData,
): { kind: Dnd5eEntry['kind']; mech: Dnd5eMechanics & { text?: string; summary?: string } } | null {
  const from = f.from
  if (!from) return null
  const n = norm5e(f.name)
  const o = owner(from)
  const track = classOfSource(s, from)
  const cls = data.classes.find((c) => c.slug === (track?.slug ?? s.classSlug))
  const sub = data.subclasses.find((x) => x.slug === (track ? track.subclassSlug : s.subclassSlug))
  const byName = <T extends { name: string }>(list: T[] | undefined) =>
    list?.find((x) => norm5e(x.name) === n)
  const named = (list: Dnd5eFeature[] | undefined): Dnd5eMechanics | undefined => {
    const direct = byName(list)
    if (direct) return direct
    const [head, opt] = f.name.split(/:\s+/)
    if (!opt) return undefined
    const p = list?.find((x) => norm5e(x.name) === norm5e(head!))
    return p?.options?.find((x) => norm5e(x.name) === norm5e(opt))
  }
  if (cls && norm5e(o.name) === norm5e(cls.name)) {
    const r = named(cls.features)
    if (r) return { kind: 'class', mech: r }
  }
  if (sub && norm5e(o.name) === norm5e(sub.name)) {
    const r = named(sub.features)
    if (r) return { kind: 'subclass', mech: r }
  }
  if (o.name === 'Feat' || from.startsWith('Feat')) {
    const feat = byName(data.feats)
    if (feat) return { kind: 'feat', mech: feat }
  }
  for (const g of data.options) {
    if (norm5e(g.name) !== norm5e(from)) continue
    const e = byName(g.entries)
    if (e) return { kind: 'option', mech: e }
  }
  const species = data.species.find((x) => x.slug === s.speciesSlug)
  if (species && norm5e(from).startsWith(norm5e(species.name))) {
    const t = byName(species.traits) ?? byName(species.lineages?.options)
    if (t) return { kind: 'species', mech: t }
  }
  const feat = data.feats.find((x) => norm5e(x.name) === norm5e(from))
  if (feat) {
    const b = byName(feat.benefits)
    if (b) return { kind: 'feat', mech: b }
  }
  return null
}

/** The resource a cost string names: "1 Superiority Die", "2 Sorcery Points", "1 Focus Point". */
function costResource(
  s: Dnd5eSheet,
  cost: string,
): { resource?: string; spend: number; pact?: boolean } {
  const m = /^(\d+)\s+(.+)$/.exec(cost.trim())
  const spend = m ? Number(m[1]) : 1
  const unit = norm5e(m?.[2] ?? cost)
  if (/pact magic/.test(unit)) return { spend, pact: true }
  const words = unit
    .replace(/s$/, '')
    .split(' ')
    .filter((w) => w.length > 3)
  const keyWords = words.map((w) => w.replace(/(ies|y|ie)$/, ''))
  const resources = s.resources ?? []
  const hit =
    resources.find((r) => keyWords.some((w) => norm5e(r.name).includes(w))) ??
    (/sorcery/.test(unit) ? resources.find((r) => r.name === 'Font of Magic') : undefined) ??
    (/superiority/.test(unit) ? resources.find((r) => /superiority/i.test(r.name)) : undefined)
  return { ...(hit ? { resource: hit.name } : {}), spend }
}

function saveDc(
  s: Dnd5eSheet,
  level: number,
  save: Dnd5eSave,
  from = '',
): { ability: Dnd5eAbility; dc: number } {
  const hero = dnd5eHero(s, level)
  if (typeof save.dc === 'number') return { ability: save.ability, dc: save.dc }
  if (save.dc === 'spell') {
    return {
      ability: save.ability,
      dc: castingFor(s, from)?.saveDc ?? s.castingStats?.saveDc ?? 8 + hero.pb + hero.mod('WIS'),
    }
  }
  const abilities = save.dc.replace('8+PB+', '').split('/') as Dnd5eAbility[]
  return { ability: save.ability, dc: 8 + hero.pb + Math.max(...abilities.map((a) => hero.mod(a))) }
}

/** Dice as the hero rolls them now: a class table column, "PBd4", a level step. */
export function resolveDice(
  s: Dnd5eSheet,
  level: number,
  dice: string | undefined,
  cols: Dnd5eColumns | undefined,
  rule?: Dnd5eFeatureRule,
): string | undefined {
  if (rule?.diceAt)
    return Object.entries(rule.diceAt).reduce<string | undefined>(
      (d, [at, v]) => (level >= Number(at) ? v : d),
      undefined,
    )
  if (!dice) return undefined
  if (dice.startsWith('column:')) return cols?.[dice.slice(7)]?.match(/\d*d\d+/)?.[0]
  if (dice.startsWith('PB')) return `${dnd5eHero(s, level).pb}${dice.slice(2)}`
  return dice
}

type Mech = Dnd5eMechanics & { text?: string; summary?: string; cost?: string; name?: string }

/** A rule's `diceTimes`: the die rolled that many times (Rage Damage d4s, WIS d6s). */
function timesDice(
  s: Dnd5eSheet,
  level: number,
  dice: string | undefined,
  rule: Dnd5eFeatureRule | undefined,
  cols: Dnd5eColumns | undefined,
): string | undefined {
  const d = dice ? parseDice(dice) : null
  if (!d || !rule?.diceTimes) return dice
  const t = rule.diceTimes
  const n =
    typeof t === 'number'
      ? t
      : t === 'rage'
        ? Number(/\d+/.exec(cols?.['Rage Damage'] ?? '')?.[0] ?? 1)
        : Math.max(1, dnd5eHero(s, level).mod(t))
  return `${n}d${d.sides}`
}

function makeEntry(
  s: Dnd5eSheet,
  level: number,
  p: {
    key: string
    name: string
    from: string
    kind: Dnd5eEntry['kind']
    text: string
    mech: Mech
    parentResource?: string
    cols?: Dnd5eColumns
  },
): Dnd5eEntry {
  const { mech } = p
  const rule = DND5E_FEATURE_RULES[p.name]
  const resources = s.resources ?? []
  let resource = resources.find((r) => r.name === p.name)?.name
  let spend = 1
  let pact = false
  if (!resource && mech.cost) {
    const c = costResource(s, mech.cost)
    resource = c.resource
    spend = c.spend
    pact = !!c.pact
  }
  if (!resource && rule?.resource && resources.some((r) => r.name === rule.resource)) {
    resource = rule.resource
    spend = rule.spend ?? 1
  }
  if (!resource && !mech.uses) resource = p.parentResource
  if (!resource && p.kind === 'feat' && !mech.uses)
    resource = resources.find(
      (r) => r.name.startsWith(`${p.name}: `) && !/spell/i.test(r.name),
    )?.name
  const cost =
    rule?.cost ??
    (mech.activation ? ACTIVATION[mech.activation] : resource && !mech.uses ? 'special' : null)
  const classLevel = sourceLevel(s, level, p.from)
  const dice = timesDice(
    s,
    level,
    resolveDice(s, classLevel, mech.dice, p.cols, rule),
    rule,
    p.cols,
  )
  const save = mech.save ? saveDc(s, level, mech.save, p.from) : undefined
  const oncePerTurn = mech.uses?.recharge === 'turn'
  const heals = !!rule?.heal || !!rule?.temp || !!rule?.pool
  return {
    key: p.key,
    name: p.name,
    from: p.from,
    kind: p.kind,
    text: mech.summary || p.text || mech.text || '',
    ...(mech.text && mech.summary && mech.text !== mech.summary ? { full: mech.text } : {}),
    cost,
    ...(resource ? { resource } : {}),
    spend,
    ...(pact ? { pact } : {}),
    ...(dice ? { dice } : {}),
    ...(mech.damageType ? { damageType: mech.damageType } : {}),
    ...(save ? { save } : {}),
    ...(rule ? { rule } : {}),
    attack:
      !!cost &&
      !rule?.toAlly &&
      (!!rule?.spellAttack || (!!dice && !heals && !rule?.give && (!!save || !!mech.damageType))),
    passive: !cost && !resource && !(oncePerTurn && (!!dice || !!save)),
    ...(mech.duration ? { duration: mech.duration } : {}),
    ...(oncePerTurn ? { oncePerTurn } : {}),
    ...(mech.uses?.restore ? { restore: mech.uses.restore } : {}),
    classLevel,
  }
}

/** Options a feature's text lays out (Cunning Action's Dash, Channel Divinity's Divine Spark) that are used on their own. */
function usableOptions(mech: Mech): Mech[] {
  if (!mech.options?.length || mech.choices?.some((c) => c.kind === 'option')) return []
  return mech.options
    .filter((o) => o.activation || o.dice || o.save || o.uses || mech.activation)
    .filter((o) => !DND5E_FEATURE_RULES[o.name]?.skip)
    .map((o) => ({ ...o, activation: o.activation ?? mech.activation }))
}

/** Every entry the hero has, in the sheet's order (passive ones included). */
export function heroEntries(
  s: Dnd5eSheet,
  level: number,
  data: Dnd5eFeatureData | null,
  cols?: Dnd5eColumns,
): Dnd5eEntry[] {
  const out: Dnd5eEntry[] = []
  const seen = new Set<string>()
  for (const f of s.features ?? []) {
    if (f.from === 'Summary' || f.from === 'Background') continue
    const key = `${f.from ?? ''}|${f.name}`
    if (seen.has(key)) continue
    seen.add(key)
    const found = data ? featureRecord(s, f, data) : null
    const mech: Mech = found?.mech ?? {}
    const kind = found?.kind ?? 'other'
    const from = f.from ?? ''
    const subs = usableOptions(mech)
    const main = makeEntry(s, level, { key, name: f.name, from, kind, text: f.desc, mech, cols })
    if (subs.length && !main.resource) main.cost = null
    if (subs.length && !main.resource) main.passive = true
    if (subs.length && main.resource && !mech.activation) main.cost = null
    out.push(main)
    for (const o of subs) {
      const name = `${f.name}: ${o.name}`
      if (seen.has(`${from}|${name}`)) continue
      seen.add(`${from}|${name}`)
      out.push(
        makeEntry(s, level, {
          key: `${from}|${name}`,
          name,
          from,
          kind,
          text: o.summary ?? o.text ?? '',
          mech: o,
          ...(main.resource ? { parentResource: main.resource } : {}),
          cols,
        }),
      )
      out[out.length - 1]!.parent = f.name
    }
  }
  return out
}

/** Why an entry can't be used now, or ''. */
export function entryWhy(s: Dnd5eSheet, e: Dnd5eEntry): string {
  if (e.cost) {
    const why = costWhy(s, e.cost)
    if (why) return why
  }
  if (e.pact) {
    const p = s.castingStats?.pact
    if (!p || (s.pactUsed ?? 0) + e.spend > p.slots) return 'No Pact Magic slot left'
  }
  if (e.resource && !e.rule?.pool && usesLeft(s, e.resource) < e.spend) return 'None left'
  if (e.oncePerTurn && usedOnce(s, `entry:${e.key}`)) return 'Used this turn'
  return ''
}

function plusOf(
  s: Dnd5eSheet,
  level: number,
  plus: ('level' | 'PB' | Dnd5eAbility)[] | undefined,
  classLevel = level,
) {
  const hero = dnd5eHero(s, level)
  return (plus ?? []).map((p) =>
    p === 'level'
      ? { label: 'level', value: classLevel }
      : p === 'PB'
        ? { label: 'PB', value: hero.pb }
        : { label: p, value: hero.mod(p) },
  )
}

function rollAmount(
  s: Dnd5eSheet,
  level: number,
  dice: string | undefined,
  plus: ('level' | 'PB' | Dnd5eAbility)[] | undefined,
  rng?: Rng,
  classLevel = level,
): { total: number; text: string } {
  const d = dice ? parseDice(dice) : null
  const r = d ? rollDice(d, rng) : null
  const adds = plusOf(s, level, plus, classLevel)
  const total = Math.max(0, (r?.total ?? 0) + adds.reduce((n, a) => n + a.value, 0))
  const text = [
    r ? `${dice} ${r.rolls.join('+')}` : '',
    ...adds.map((a) => `${sign(a.value)} ${a.label}`),
  ]
    .filter(Boolean)
    .join(' ')
  return { total, text }
}

const CORE_NAMES: Record<string, string> = {
  dash: 'Dash',
  disengage: 'Disengage',
  dodge: 'Dodge',
  hide: 'Hide',
}

/** A core action's effect on the hero (Dash, Disengage, Dodge); Hide says what it takes. */
export function coreEffect(s: Dnd5eSheet, id: string): string {
  if (id === 'hide')
    return 'Hide: a DC 15 Dexterity (Stealth) check; on a success you have the Invisible condition while hidden.'
  if (!DND5E_EFFECTS[id]) return ''
  addEffect(s, id)
  return `${CORE_NAMES[id] ?? id}: ${DND5E_EFFECTS[id]!.note}`
}

/** The die of a resource ("1d8"), for rules that read a pool's die. */
const poolDie = (s: Dnd5eSheet, name: string) => {
  const m = /(\d*)d(\d+)/.exec(s.resources?.find((r) => r.name === name)?.dice ?? '')
  return m ? `${m[1] || 1}d${m[2]}` : ''
}

/** The number an effect keeps from its rule's `value`. */
function effectValue(
  s: Dnd5eSheet,
  level: number,
  v: Dnd5eFeatureRule['value'],
  rng?: Rng,
): number | undefined {
  if (!v) return undefined
  if (typeof v === 'string') return Math.max(1, dnd5eHero(s, level).mod(v))
  if ('at' in v)
    return Object.entries(v.at).reduce((n, [at, x]) => (level >= Number(at) ? x : n), 0)
  const d = parseDice(poolDie(s, 'die' in v ? v.die : v.roll))
  if (!d) return undefined
  return 'die' in v ? d.sides : rollDice(d, rng).total
}

/**
 * What a few features add when they're used, beyond their rule: Rage's Vitality Surge temp HP
 * and Mindless Rage (SRD 5.2.1 p. 30), Wild Shape's temporary HP (Druid level, three times it
 * with Circle Forms, p. 44), Patient Defense's Heightened Focus temp HP (p. 51), Action Surge's
 * Grieving Mantle.
 */
function useExtras(
  s: Dnd5eSheet,
  level: number,
  e: Dnd5eEntry,
  cols: Dnd5eColumns | undefined,
  rng?: Rng,
): string[] {
  const hero = dnd5eHero(s, level)
  const out: string[] = []
  if (e.name === 'Rage') {
    const used = { ...s.used }
    delete used['Fanatical Focus']
    s.used = used
    if (hero.has('Vitality of the Tree'))
      out.push(gainTempHp(s, hero.levelOf('Vitality of the Tree'), 'Vitality Surge'))
    if (hero.has('Mindless Rage')) {
      const had: string[] = (s.conditions ?? []).filter(
        (c) => c === 'Charmed' || c === 'Frightened',
      )
      s.conditions = (s.conditions ?? []).filter((c) => !had.includes(c))
      if (had.length) out.push(`Mindless Rage: ${had.join(' and ')} ended`)
    }
    if (hero.has('Rage of the Wilds')) out.push('pick a spirit (Bear, Eagle or Wolf) in Conditions')
  }
  if (e.name === 'Wild Shape') {
    const moon = hero.has('Circle Forms')
    const druid = e.classLevel ?? level
    out.push(gainTempHp(s, moon ? 3 * druid : druid, moon ? 'Circle Forms' : 'Wild Shape'))
  }
  if (e.name === 'Monk’s Focus: Patient Defense' && hero.has('Heightened Focus')) {
    const ma = (cols?.['Martial Arts'] ?? '').match(/(\d*)d(\d+)/)
    if (ma) {
      const r = rollDice({ count: 2 * Number(ma[1] || 1), sides: Number(ma[2]), mod: 0 }, rng)
      out.push(gainTempHp(s, r.total, 'Heightened Focus'))
    }
  }
  if (e.name === 'Action Surge' && hero.has('Grieving Mantle')) {
    addEffect(s, 'grieving-mantle')
    out.push('Grieving Mantle is on')
  }
  if (e.name === 'Action Surge' && hero.has('Arcane Charge'))
    out.push('Arcane Charge: teleport up to 30 ft before or after the extra action')
  if (e.name === 'Action Surge' && hero.has('Rallying Surge'))
    out.push('Rallying Surge: up to CHA allies within 30 ft can use a Reaction to attack or move')
  if (e.name === 'Second Wind' && hero.has('Tactical Shift'))
    out.push('Tactical Shift: move up to half your Speed without provoking')
  if (e.name === 'Monk’s Focus: Patient Defense' && hero.has('Drunken Technique') && e.resource)
    out.push('Drunken Technique: +10 ft Speed this turn and an Unarmed Strike')
  return out
}

/** A spell attack a feature makes (Holy Bolt, Icefury): the roll against the Target row's AC. */
function featureAttack(
  s: Dnd5eSheet,
  level: number,
  e: Dnd5eEntry,
  ability: Dnd5eAbility,
  o: { target?: Dnd5eTarget; rng?: Rng },
): { line: string; hit: boolean | null; crit: boolean } {
  const hero = dnd5eHero(s, level)
  const bonus = hero.mod(ability) + hero.pb
  const t = d20Test(s, level, {
    label: e.name,
    kind: 'attack',
    ability,
    bonus,
    lines: [`Spell attack ${sign(bonus)}`],
  })
  adjustAttackTest(s, t, {
    melee: false,
    strength: false,
    ...(o.target ? { target: o.target } : {}),
  })
  const r = rollTest(s, t, o.rng ? { rng: o.rng } : {})
  const ac = o.target?.ac ?? null
  const crit = r.natural === 20
  const hit = r.natural === 1 ? false : crit ? true : ac === null ? null : r.total >= ac
  const line = `${r.total} to hit${ac !== null ? ` vs AC ${ac}` : ''} (${r.rolls.join(' / ')} ${sign(t.bonus)})${hit === false ? ', a miss' : crit ? ', a Critical Hit' : hit ? ', a hit' : ''}`
  return { line, hit, crit }
}

/**
 * Uses an entry: pays its cost on the turn, spends its uses (or `amount` of a pool), then does
 * what its rule says (an effect with its value, a condition, healing, temporary HP, an extra
 * action, core actions, a Hit Point Die, a spell attack) or rolls its dice and says its save DC;
 * dice meant for an ally are rolled and said. Returns the result line; `why` when it can't be
 * used.
 */
export function useEntry(
  s: Dnd5eSheet,
  level: number,
  e: Dnd5eEntry,
  o: { amount?: number; rng?: Rng; target?: Dnd5eTarget; columns?: Dnd5eColumns } = {},
): string {
  const why = entryWhy(s, e)
  if (why) return `${e.name}: ${why}.`
  const r = e.rule
  if (r?.pool) {
    const n = Math.max(0, Math.min(o.amount ?? 0, usesLeft(s, e.resource ?? e.name)))
    if (!n) return `${e.name}: choose how many ${r.poolDice ? 'dice' : 'points'} to spend.`
    if (e.cost) payCost(s, level, e.cost)
    spendUses(s, e.resource ?? e.name, n)
    const d = r.poolDice ? parseDice(r.poolDice) : null
    const amount = d ? rollDice({ count: n * d.count, sides: d.sides, mod: 0 }, o.rng).total : n
    const what = r.poolDice
      ? `${n} ${r.poolDice.replace(/^1/, '')} spent`
      : `${n} point${n === 1 ? '' : 's'} spent`
    return `${e.name}: ${what}. ${heal(s, amount)}`
  }
  if (e.cost) payCost(s, level, e.cost)
  if (e.pact) s.pactUsed = (s.pactUsed ?? 0) + e.spend
  else if (e.resource) spendUses(s, e.resource, e.spend)
  if (e.oncePerTurn) useOnce(s, `entry:${e.key}`)
  const parts: string[] = []
  const spent = e.pact
    ? 'a Pact Magic slot'
    : e.resource && e.resource !== e.name
      ? `${e.spend > 1 ? `${e.spend} ` : ''}${e.resource}`
      : ''
  if (r?.effect && DND5E_EFFECTS[r.effect]) {
    const value = effectValue(s, e.classLevel ?? level, r.value, o.rng)
    addEffect(s, r.effect, {
      ...(s.turn?.active ? { held: false } : {}),
      ...(value !== undefined ? { value } : {}),
    })
    parts.push(
      `${DND5E_EFFECTS[r.effect]!.name} is on${value !== undefined && r.value && typeof r.value === 'object' && 'roll' in r.value ? ` (+${value})` : ''}`,
    )
  }
  if (r?.condition && !(s.conditions ?? []).includes(r.condition)) {
    s.conditions = [...(s.conditions ?? []), r.condition]
    parts.push(`you have the ${r.condition} condition`)
  }
  if (r?.actions && s.turn?.active) {
    s.turn.actions += r.actions
    s.turn.actionsMax += r.actions
    parts.push(`+${r.actions} action this turn`)
  }
  for (const c of r?.core ?? []) parts.push(coreEffect(s, c).replace(/:.*$/, ''))
  if (r?.heal) {
    const a = rollAmount(
      s,
      level,
      r.heal.dice ? resolveDice(s, e.classLevel ?? level, r.heal.dice, undefined) : e.dice,
      r.heal.plus,
      o.rng,
      e.classLevel,
    )
    parts.push(`${heal(s, a.total) || `heals ${a.total}`} (${a.text})`)
  }
  if (r?.temp) {
    const a = rollAmount(s, level, r.temp.dice ?? e.dice, r.temp.plus, o.rng, e.classLevel)
    parts.push(`${gainTempHp(s, Math.max(1, a.total), e.name)} (${a.text})`)
  }
  if (r?.refill) {
    restoreUses(s, r.refill)
    parts.push(`${r.refill} refilled`)
  }
  if (r?.hitDie) parts.push(spendHitDie(s, level, o.rng ? { rng: o.rng } : {}))
  if (r?.unarmed) parts.push(`make ${r.unarmed} Unarmed Strikes`)
  const dice = e.dice || (r?.toAlly && e.resource ? poolDie(s, e.resource) : '')
  if (!r?.heal && !r?.temp && (dice || r?.toAlly || r?.spellAttack)) {
    const atk = r?.spellAttack ? featureAttack(s, level, e, r.spellAttack, o) : null
    if (atk) parts.push(atk.line)
    if (r?.give) parts.push(`an ally gains your ${dice} to add to a failed D20 Test`)
    else if (atk?.hit !== false && (dice || r?.plus)) {
      const d = dice ? parseDice(dice) : null
      const crit = !!atk?.crit
      const roll = d ? rollDice({ ...d, count: d.count * (crit ? 2 : 1) }, o.rng) : null
      const adds = plusOf(s, level, r?.plus, e.classLevel)
      const total = Math.max(0, (roll?.total ?? 0) + adds.reduce((n, a) => n + a.value, 0))
      const text = [
        roll ? `${d!.count * (crit ? 2 : 1)}d${d!.sides} ${roll.rolls.join('+')}` : '',
        ...adds.map((a) => `${sign(a.value)} ${a.label}`),
      ]
        .filter(Boolean)
        .join(' ')
      const kind = r?.toAlly ? ' for an ally' : e.damageType ? ` ${e.damageType.toLowerCase()}` : ''
      parts.push(`${total}${kind} (${text})`)
      if (r?.healSame) parts.push(`you ${heal(s, total).replace(/^Healed/, 'heal')}`)
    }
  }
  if (e.save) parts.push(`DC ${e.save.dc} ${e.save.ability} save`)
  parts.push(...useExtras(s, level, e, o.columns, o.rng))
  if (r?.say) parts.push(r.say.replace(/\.$/, ''))
  const head = `${e.name}${spent ? ` (${spent})` : ''}`
  return parts.length ? `${head}: ${parts.join('; ')}.` : `${head}: used.`
}

/** The 2024 core actions (SRD 5.2.1 pp. 9–11), with what the sheet does for each. */
export const DND5E_CORE_ACTIONS: { id: string; name: string; cost: Dnd5eCost; text: string }[] = [
  {
    id: 'attack',
    name: 'Attack',
    cost: 'action',
    text: 'Attack with a weapon or an Unarmed Strike: the Attacks panel makes them, with Extra Attack inside the one action.',
  },
  {
    id: 'dash',
    name: 'Dash',
    cost: 'action',
    text: 'Extra movement equal to your Speed this turn.',
  },
  {
    id: 'disengage',
    name: 'Disengage',
    cost: 'action',
    text: 'Your movement provokes no Opportunity Attacks this turn.',
  },
  {
    id: 'dodge',
    name: 'Dodge',
    cost: 'action',
    text: 'Until your next turn, attacks against you have Disadvantage and you have Advantage on Dexterity saves.',
  },
  {
    id: 'help',
    name: 'Help',
    cost: 'action',
    text: 'Give an ally Advantage on their next ability check, or on their next attack against an enemy within 5 ft of you.',
  },
  {
    id: 'hide',
    name: 'Hide',
    cost: 'action',
    text: 'A DC 15 Dexterity (Stealth) check out of sight; on a success you have the Invisible condition while hidden.',
  },
  {
    id: 'influence',
    name: 'Influence',
    cost: 'action',
    text: 'A Charisma or Wisdom check to sway a creature’s attitude.',
  },
  {
    id: 'magic',
    name: 'Magic',
    cost: 'magic',
    text: 'Cast a spell, use a magic item or a magical feature: the Spells panel casts them.',
  },
  {
    id: 'ready',
    name: 'Ready',
    cost: 'action',
    text: 'Choose a trigger and an action; take it with your Reaction when the trigger happens.',
  },
  {
    id: 'search',
    name: 'Search',
    cost: 'action',
    text: 'A Wisdom check (Insight, Medicine, Perception or Survival) to find something.',
  },
  {
    id: 'study',
    name: 'Study',
    cost: 'action',
    text: 'An Intelligence check (Arcana, History, Investigation, Nature or Religion) to recall or work something out.',
  },
  {
    id: 'utilize',
    name: 'Utilize',
    cost: 'action',
    text: 'Use a nonmagical object (your free object interaction covers one a turn).',
  },
]

/** Takes a core action: pays it and does what the sheet tracks (Dash, Disengage, Dodge). */
export function takeCoreAction(s: Dnd5eSheet, level: number, id: string): string {
  const a = DND5E_CORE_ACTIONS.find((x) => x.id === id)
  if (!a) return ''
  const why = costWhy(s, a.cost)
  if (why) return `${a.name}: ${why}.`
  payCost(s, level, a.cost)
  return coreEffect(s, id) || `${a.name}: ${a.text}`
}
