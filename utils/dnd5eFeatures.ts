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
import type { Dnd5eColumns } from '~/utils/dnd5eAttacks'
import { addEffect, DND5E_EFFECTS } from '~/utils/dnd5eEffects'
import {
  type Dnd5eCost,
  costWhy,
  dnd5eHero,
  gainTempHp,
  heal,
  norm5e,
  payCost,
  restoreUses,
  spendHitDie,
  spendUses,
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
  /** Not used from the Actions panel: its own panel does it (Font of Magic's conversions). */
  skip?: boolean
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
  'Converting Spell Slots to Sorcery Points': { skip: true },
  'Creating Spell Slots': { skip: true },
  'Spell Slot to Wild Shape': { skip: true },
  'Wild Shape to Spell Slot': { skip: true },
}

/** A feature or pick the hero has, ready to show and use. */
export interface Dnd5eEntry {
  key: string
  name: string
  /** What gives it, as the sheet records it ("Fighter 2", "Elf", "Feat · Human", "Metamagic"). */
  from: string
  kind: 'class' | 'subclass' | 'species' | 'feat' | 'option' | 'other'
  /** The rules text: SRD text or Lantern's summary, or what a hand-made sheet says. */
  text: string
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
  const cls = data.classes.find((c) => c.slug === s.classSlug)
  const sub = data.subclasses.find((x) => x.slug === s.subclassSlug)
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
): { ability: Dnd5eAbility; dc: number } {
  const hero = dnd5eHero(s, level)
  if (typeof save.dc === 'number') return { ability: save.ability, dc: save.dc }
  if (save.dc === 'spell')
    return { ability: save.ability, dc: s.castingStats?.saveDc ?? 8 + hero.pb + hero.mod('WIS') }
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
  if (!resource && !mech.uses) resource = p.parentResource
  if (!resource && p.kind === 'feat' && !mech.uses)
    resource = resources.find(
      (r) => r.name.startsWith(`${p.name}: `) && !/spell/i.test(r.name),
    )?.name
  const cost =
    rule?.cost ??
    (mech.activation ? ACTIVATION[mech.activation] : resource && !mech.uses ? 'special' : null)
  const dice = resolveDice(s, level, mech.dice, p.cols, rule)
  const save = mech.save ? saveDc(s, level, mech.save) : undefined
  const oncePerTurn = mech.uses?.recharge === 'turn'
  const heals = !!rule?.heal || !!rule?.temp || !!rule?.pool
  return {
    key: p.key,
    name: p.name,
    from: p.from,
    kind: p.kind,
    text: p.text || mech.summary || mech.text || '',
    cost,
    ...(resource ? { resource } : {}),
    spend,
    ...(pact ? { pact } : {}),
    ...(dice ? { dice } : {}),
    ...(mech.damageType ? { damageType: mech.damageType } : {}),
    ...(save ? { save } : {}),
    ...(rule ? { rule } : {}),
    attack: !!dice && !heals && !rule?.give && (!!save || !!mech.damageType) && !!cost,
    passive: !cost && !resource && !oncePerTurn,
    ...(mech.duration ? { duration: mech.duration } : {}),
    ...(oncePerTurn ? { oncePerTurn } : {}),
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
  if (e.oncePerTurn && s.turn?.once.includes(`entry:${e.key}`)) return 'Used this turn'
  return ''
}

function plusOf(s: Dnd5eSheet, level: number, plus: ('level' | 'PB' | Dnd5eAbility)[] | undefined) {
  const hero = dnd5eHero(s, level)
  return (plus ?? []).map((p) =>
    p === 'level'
      ? { label: 'level', value: level }
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
): { total: number; text: string } {
  const d = dice ? parseDice(dice) : null
  const r = d ? rollDice(d, rng) : null
  const adds = plusOf(s, level, plus)
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

/**
 * Uses an entry: pays its cost on the turn, spends its uses (or `amount` of a pool), then does
 * what its rule says (an effect, healing, temporary HP, an extra action, core actions, a Hit
 * Point Die) or rolls its dice and says its save DC. Returns the result line; `why` when it
 * can't be used.
 */
export function useEntry(
  s: Dnd5eSheet,
  level: number,
  e: Dnd5eEntry,
  o: { amount?: number; rng?: Rng } = {},
): string {
  const why = entryWhy(s, e)
  if (why) return `${e.name}: ${why}.`
  const r = e.rule
  if (r?.pool) {
    const n = Math.max(0, Math.min(o.amount ?? 0, usesLeft(s, e.resource ?? e.name)))
    if (!n) return `${e.name}: choose how many points to spend.`
    if (e.cost) payCost(s, level, e.cost)
    spendUses(s, e.resource ?? e.name, n)
    return `${e.name}: ${n} point${n === 1 ? '' : 's'} spent. ${heal(s, n)}`
  }
  if (e.cost) payCost(s, level, e.cost)
  if (e.pact) s.pactUsed = (s.pactUsed ?? 0) + e.spend
  else if (e.resource) spendUses(s, e.resource, e.spend)
  if (e.oncePerTurn && s.turn) s.turn.once = [...s.turn.once, `entry:${e.key}`]
  const parts: string[] = []
  const spent = e.pact
    ? 'a Pact Magic slot'
    : e.resource
      ? `${e.spend > 1 ? `${e.spend} ` : ''}${e.resource}`
      : ''
  if (r?.effect && DND5E_EFFECTS[r.effect]) {
    addEffect(s, r.effect, s.turn?.active ? { held: false } : {})
    parts.push(`${DND5E_EFFECTS[r.effect]!.name} is on`)
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
      r.heal.dice ? resolveDice(s, level, r.heal.dice, undefined) : e.dice,
      r.heal.plus,
      o.rng,
    )
    parts.push(`${heal(s, a.total) || `heals ${a.total}`} (${a.text})`)
  }
  if (r?.temp) {
    const a = rollAmount(s, level, r.temp.dice ?? e.dice, r.temp.plus, o.rng)
    parts.push(`${gainTempHp(s, Math.max(1, a.total), e.name)} (${a.text})`)
  }
  if (r?.refill) {
    restoreUses(s, r.refill)
    parts.push(`${r.refill} refilled`)
  }
  if (r?.hitDie) parts.push(spendHitDie(s, level, o.rng ? { rng: o.rng } : {}))
  if (r?.unarmed) parts.push(`make ${r.unarmed} Unarmed Strikes`)
  if (!r?.heal && !r?.temp && e.dice) {
    if (r?.give) parts.push(`an ally gains your ${e.dice} to add to a failed D20 Test`)
    else {
      const a = rollAmount(s, level, e.dice, undefined, o.rng)
      parts.push(`${a.total}${e.damageType ? ` ${e.damageType.toLowerCase()}` : ''} (${a.text})`)
    }
  }
  if (e.save) parts.push(`DC ${e.save.dc} ${e.save.ability} save`)
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
