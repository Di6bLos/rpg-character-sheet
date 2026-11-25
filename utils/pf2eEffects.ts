// Applies the structured ability effects in `data/pf2e/effects.ts` to a PF2e sheet: which
// ones the hero has (by the names of their feats, features, picks and spells), which are on
// (permanent ones always, toggles the hero turned on, effects from allies), the modifiers they
// add to a number (stacked with conditions by `adjusted` in utils/pf2ePlay.ts), extra Strike
// damage dice, Speed, and the dying rules Diehard and Toughness change. Abilities without a
// written entry get one read from their text (`derivedEffects`, utils/pf2eAbilityRules.ts):
// bonuses and penalties to the hero, resistances, proficiency increases and degree upgrades
// on saves; a written entry always wins.
import { PF2E_EFFECTS } from '~/data/pf2e/effects'
import type {
  Pf2eDegreeName,
  Pf2eEffect,
  Pf2eEffectDef,
  Pf2eEnds,
  Pf2eSelector,
} from '~/data/pf2e/types'
import type { Pf2eAttr, Pf2eFeat, Pf2eRank, Pf2eSheet } from '~/types/sheets'
import { type Pf2eAbilityRules, amountAt, readAbility } from '~/utils/pf2eAbilityRules'
import { inventoryEffects } from '~/utils/pf2eInventory'
import type { Pf2eMod, Pf2eStatContext } from '~/utils/pf2ePlay'

const BY_NAME = new Map(PF2E_EFFECTS.map((e) => [e.name, e]))

/** A sheet's feat as the parser reads it. */
export const featInput = (f: Pf2eFeat) => ({
  name: f.name,
  text: f.desc.replace(/\\n/g, '\n'),
  actions: f.action,
  ...(f.frequency ? { frequency: f.frequency } : {}),
  ...(f.trigger ? { trigger: f.trigger } : {}),
  ...(f.requirements ? { requirements: f.requirements } : {}),
  ...(f.traits ? { traits: f.traits } : {}),
})

const parsed = new Map<string, Pf2eAbilityRules>()
/** The feat's rules, read once per name and text. */
export function featRules(f: Pf2eFeat): Pf2eAbilityRules {
  const key = [
    f.name,
    f.action,
    f.frequency,
    f.trigger,
    f.requirements,
    f.traits?.join(),
    f.desc,
  ].join('\n')
  let r = parsed.get(key)
  if (!r) {
    r = readAbility(featInput(f))
    parsed.set(key, r)
  }
  return r
}

const active = (r: Pf2eAbilityRules) => !!(r.cost || r.trigger || r.frequency)

/**
 * Effects read from an ability's text (and the actions written inside it): what's always true
 * (proficiency increases, degree upgrades, an unconditional bonus or resistance) is
 * `permanent`; a bonus that comes with a use or holds only sometimes is a toggle the player
 * (or the Use button) turns on, with its sentence as the note and when it ends.
 */
export function derivedEffects(r: Pf2eAbilityRules, book = ''): Pf2eEffectDef[] {
  const out = r.embedded.flatMap((e) => derivedEffects(e, book))
  const always: Pf2eEffect[] = []
  const sometimes: Pf2eEffect[] = []
  const alwaysNotes: string[] = []
  const notes: string[] = []
  const useIt = active(r)
  for (const m of r.selfMods) {
    if (m.selector === 'roll') continue
    if (m.selector === 'note') {
      alwaysNotes.push(m.sentence)
      continue
    }
    const effect: Pf2eEffect = {
      kind: 'modifier',
      selector: [m.selector],
      value: m.value,
      type: m.type,
      ...(m.skills ? { skills: m.skills } : {}),
      ...(m.actions ? { actions: m.actions } : {}),
      ...(m.level ? { level: m.level } : {}),
    }
    if (useIt || m.conditional) {
      sometimes.push(effect)
      notes.push(m.sentence)
    } else always.push(effect)
  }
  for (const x of r.resistances) {
    const effect: Pf2eEffect = {
      kind: 'resistance',
      type: x.type,
      amount: x.amount,
      ...(x.min ? { min: x.min } : {}),
      ...(x.level ? { level: x.level } : {}),
    }
    if (useIt || x.conditional) {
      sometimes.push(effect)
      notes.push(x.sentence)
    } else always.push(effect)
  }
  if (r.speed)
    always.push({ kind: 'modifier', selector: ['speed'], value: r.speed, type: 'untyped' })
  for (const d of r.degreeShifts) always.push({ kind: 'degree', ...d })
  for (const p of r.proficiency) always.push({ kind: 'proficiency', ...p })
  if (r.fistDie) always.push({ kind: 'fistDie', die: r.fistDie })
  if (r.maxHp) alwaysNotes.push(`Max HP +${r.maxHp === 'level' ? 'your level' : r.maxHp}.`)
  const source = { book }
  if (r.rageDamage) {
    const [first, ...rest] = r.rageDamage
    out.push({
      name: `${r.name} (Rage damage)`,
      source,
      mode: 'permanent',
      requires: 'Rage',
      derived: true,
      effects: [
        {
          kind: 'modifier',
          selector: ['damage'],
          value: first![0] <= 1 ? first![1] : 0,
          byLevel: [...(first![0] > 1 ? [first!] : []), ...rest],
          type: 'untyped',
          melee: true,
          agileHalf: true,
        },
      ],
      note: 'Added to Rage’s damage as your instinct says; some instincts change its type or need a choice when you Rage.',
    })
  }
  if (always.length || alwaysNotes.length)
    out.push({
      name: r.name,
      source,
      mode: 'permanent',
      derived: true,
      effects: always,
      ...(alwaysNotes.length ? { note: alwaysNotes.join(' ') } : {}),
    })
  if (sometimes.length) {
    const ends = r.ends
    out.push({
      name: always.length || alwaysNotes.length ? `${r.name} (when it applies)` : r.name,
      source,
      mode: 'toggle',
      derived: true,
      effects: sometimes,
      note: [...new Set(notes)].join(' '),
      ...(ends ? { ends } : {}),
    })
  }
  return out
}

/**
 * Bloodlines whose blood magic has a written entry (Player Core 2 p. 144): the toggle read from
 * the bloodline's text would only repeat it (Fey's Cloak of Ribbons, Imperial's Imperious
 * Defense, Aesir, Diabolic, Elemental).
 */
const WRITTEN_BLOOD_MAGIC = new Set(
  PF2E_EFFECTS.filter((e) => e.has?.type === 'Bloodline').map((e) => e.has!.name),
)

/** Derived effects of the hero's abilities that have no written entry. */
function sheetDerived(s: Pf2eSheet): Pf2eEffectDef[] {
  return s.feats.flatMap((f) => {
    const blood = f.type.toLowerCase() === 'bloodline' && WRITTEN_BLOOD_MAGIC.has(f.name)
    return derivedEffects(featRules(f), f.type).filter(
      (d) =>
        !(blood && d.mode === 'toggle') &&
        !BY_NAME.has(d.name) &&
        !BY_NAME.has(d.name.replace(/ \((?:when it applies|Rage damage)\)$/, '')),
    )
  })
}

/** Effects of items: a used consumable's (an elixir's bonus) and worn or held items' bonuses. */
const itemEffects = (s: Pf2eSheet) => [...(s.effects?.items ?? []), ...inventoryEffects(s)]

/** A def by name: written ones first, then the hero's derived ones and their items'. */
export function pf2eEffectDef(s: Pf2eSheet, name: string): Pf2eEffectDef | undefined {
  return (
    BY_NAME.get(name) ??
    sheetDerived(s).find((d) => d.name === name) ??
    itemEffects(s).find((d) => d.name === name)
  )
}

/** Effects allies can give the hero, to pick from. */
export const GIVEN_EFFECTS = PF2E_EFFECTS.filter((e) => e.mode === 'given')

/** Names of everything the hero has that an effect could belong to. */
export function abilityNames(s: Pf2eSheet) {
  return new Set([
    ...s.feats.map((f) => f.name),
    ...(s.focusSpells ?? []).map((f) => f.name),
    ...(s.spellcasting?.cantrips ?? []).map((f) => f.name),
    ...(s.spellcasting?.spells ?? []).map((f) => f.name),
    ...(s.archetypeCasting ?? []).flatMap((c) => [...c.cantrips, ...c.spells]).map((f) => f.name),
  ])
}

/** Whether the hero has the ability an entry names in `has` (of that kind, when it says). */
const hasAbility = (s: Pf2eSheet, has: NonNullable<Pf2eEffectDef['has']>) =>
  s.feats.some(
    (f) => f.name === has.name && (!has.type || f.type.toLowerCase() === has.type.toLowerCase()),
  )

/** The hero's own effects: permanent ones and toggles they can turn on, written or derived. */
export function ownEffects(s: Pf2eSheet): Pf2eEffectDef[] {
  const names = abilityNames(s)
  for (const f of s.feats) for (const e of featRules(f).embedded) names.add(e.name)
  return [
    ...PF2E_EFFECTS.filter(
      (e) => e.mode !== 'given' && (e.has ? hasAbility(s, e.has) : names.has(e.name)),
    ),
    ...sheetDerived(s),
    ...itemEffects(s),
  ]
}

export interface Pf2eActiveEffect {
  def: Pf2eEffectDef
  /** The chosen value of a scaling effect from an ally (Heroism +2). */
  value?: number
}

/** Effects on right now; one that `requires` another only while that one is on. */
export function activeEffects(s: Pf2eSheet): Pf2eActiveEffect[] {
  const on = new Set(s.effects?.on ?? [])
  const own = ownEffects(s)
    .filter((e) => e.mode === 'permanent' || on.has(e.name))
    .filter((e) => !e.requires || on.has(e.requires))
    .map((def) => {
      const value = s.effects?.values?.[def.name]
      return value === undefined ? { def } : { def, value }
    })
  const given = (s.effects?.given ?? []).flatMap((g) => {
    const def = BY_NAME.get(g.name)
    return def ? [{ def, value: g.value }] : []
  })
  return [...own, ...given]
}

/** Effects of a kind that are on, those that start at a higher level than the hero's left out. */
const allOf = <K extends Pf2eEffect['kind']>(s: Pf2eSheet, kind: K) =>
  activeEffects(s).flatMap((a) =>
    a.def.effects
      .filter((e): e is Extract<Pf2eEffect, { kind: K }> => e.kind === kind)
      .filter((e) => !('level' in e) || (e.level ?? 1) <= (s.level ?? 1))
      .map((effect) => ({ effect, active: a })),
  )

/** The selectors a number answers to. */
function selectors(ctx: Pf2eStatContext): Pf2eSelector[] {
  const out: Pf2eSelector[] = []
  if (ctx.kind === 'ac') out.push('ac')
  if (ctx.kind === 'attack') out.push('attack')
  if (ctx.kind === 'damage') out.push('damage')
  if (ctx.kind === 'perception') out.push('perception')
  if (ctx.initiative) out.push('initiative')
  if (ctx.kind === 'skill') out.push('skills')
  if (ctx.kind === 'save') {
    out.push('saves')
    if (ctx.save) out.push(ctx.save.toLowerCase() as Pf2eSelector)
  }
  if (ctx.kind !== 'damage') out.push('checks')
  return out
}

/**
 * A shield is broken at or below its Broken Threshold (p. 269): it can't Shield Block and
 * gives no AC while raised until it's Repaired above it. A shield without max HP isn't tracked.
 */
export const shieldBroken = (s: Pf2eSheet) => s.shield.hpMax > 0 && s.shield.hp <= s.shield.bt

/**
 * The shield's own circumstance bonus to AC (Buckler +1, most +2, p. 274); +2 when the sheet
 * doesn't say (older sheets, or the editor's field left empty).
 */
export const shieldAc = (s: Pf2eSheet) =>
  typeof s.shield.ac === 'number' && Number.isFinite(s.shield.ac) ? s.shield.ac : 2

/** What a raised, unbroken shield adds to AC, as a circumstance bonus (p. 274). */
export const raisedShieldBonus = (s: Pf2eSheet) =>
  s.shield.name.trim() !== '' && s.shield.raised && !shieldBroken(s) ? shieldAc(s) : 0

const atLevel = (steps: [number, number][], level: number, fallback: number) =>
  [...steps].reverse().find(([at]) => at <= level)?.[1] ?? fallback

/** Modifiers active effects (and a raised shield) add to one number. */
export function effectMods(s: Pf2eSheet, ctx: Pf2eStatContext): Pf2eMod[] {
  const want = selectors(ctx)
  const traits = ctx.traits ?? []
  // Rage's damage is halved if the weapon is agile (Player Core 2 p. 72), flag or trait.
  const agile = ctx.agile || traits.includes('agile')
  const agileOrFinesse = agile || traits.includes('finesse')
  const found = allOf(s, 'modifier').flatMap(({ effect: e, active }) => {
    if (!e.selector.some((x) => want.includes(x))) return []
    if (e.melee && !ctx.melee) return []
    if (e.weapons === 'agileFinesse' && !agileOrFinesse) return []
    if (e.weapons === 'unarmed' && !traits.includes('unarmed')) return []
    if (e.skills && (ctx.kind !== 'skill' || !e.skills.includes(ctx.skill ?? ''))) return []
    if (e.actions && !e.actions.some((a) => a.toLowerCase() === ctx.action?.toLowerCase()))
      return []
    if (
      e.selector.includes('initiative') &&
      !ctx.initiative &&
      !e.selector.some((x) => x !== 'initiative' && want.includes(x))
    )
      return []
    const base = active.value ?? (e.byLevel ? atLevel(e.byLevel, ctx.level ?? 1, e.value) : e.value)
    const value = e.agileHalf && agile ? Math.floor(base / 2) : base
    return value ? [{ value, type: e.type, source: active.def.name, with: e.cumulativeWith }] : []
  })
  // A bonus that's cumulative with named ones of its type adds to them instead of only the
  // higher counting (Mountain Stance's item bonus with Mystic Armor's, Player Core 2 p. 118).
  const adds = new Map(
    found.map((m) => [
      m,
      found.filter((o) => o !== m && o.type === m.type && m.with?.includes(o.source)),
    ]),
  )
  const absorbed = new Set([...adds.values()].flat())
  const mods: Pf2eMod[] = found
    .filter((m) => !absorbed.has(m))
    .map((m) => {
      const more = adds.get(m) ?? []
      return {
        value: more.reduce((n, o) => n + o.value, m.value),
        type: m.type,
        source: [m.source, ...more.map((o) => o.source)].join(' + '),
      }
    })
  const up = proficiencyGain(s, ctx)
  if (up) mods.push(up)
  // Raise a Shield: the shield's circumstance bonus to AC (Player Core p. 274), so it doesn't
  // stack with the Shield spell's; a broken shield gives none.
  const raised = raisedShieldBonus(s)
  if (ctx.kind === 'ac' && raised)
    mods.push({ value: raised, type: 'circumstance', source: 'Raised shield' })
  if (ctx.kind === 'ac')
    for (const { effect, active } of allOf(s, 'dexCap')) {
      const over = s.attrs.DEX - effect.value
      if (over > 0)
        mods.push({ value: -over, type: 'untyped', source: `${active.def.name} (Dex cap)` })
    }
  if (ctx.kind === 'damage') {
    // Weapon specialization: the best one for the Strike's rank (p. 136).
    const rank = ctx.rank ? effectiveRank(s, 'attack', ctx.rank) : 'U'
    const spec = allOf(s, 'specialization')
      .map(({ effect, active }) => ({
        value: effect.damage[rank] ?? 0,
        source: active.def.name,
      }))
      .sort((a, b) => b.value - a.value)[0]
    if (spec?.value) mods.push({ value: spec.value, type: 'untyped', source: spec.source })
    // Thief: DEX to finesse melee damage instead of STR when it's higher (p. 167).
    if (ctx.melee && traits.includes('finesse'))
      for (const { effect, active } of allOf(s, 'damageAttribute')) {
        const gain = s.attrs[effect.attr] - s.attrs.STR
        if (gain > 0)
          mods.push({ value: gain, type: 'untyped', source: `${active.def.name} (${effect.attr})` })
      }
  }
  return mods
}

/** The multiple attack penalties for the 2nd and 3rd attack (the Flurry edge's, when on). */
export function mapPenalties(s: Pf2eSheet, agile: boolean): [number, number, number] {
  const flurry = allOf(s, 'map')[0]?.effect
  if (flurry)
    return agile ? [0, -flurry.agileSecond, -flurry.agileThird] : [0, -flurry.second, -flurry.third]
  return agile ? [0, 4, 8] : [0, 5, 10]
}

/** Conditions active effects give (Enlarge: clumsy 1), by name with their value. */
export function effectConditions(s: Pf2eSheet) {
  const out = new Map<string, number>()
  for (const { effect } of allOf(s, 'condition'))
    out.set(effect.name, Math.max(out.get(effect.name) ?? 0, effect.value ?? 1))
  return out
}

/** Speed after effects (Fleet, Incredible Movement by level), stacked by type, as the sheet writes it. */
export function speedNow(s: Pf2eSheet, level = 1) {
  const base = Number.parseInt(s.speed, 10)
  const mods: Pf2eMod[] = allOf(s, 'modifier')
    .filter(({ effect }) => effect.selector.includes('speed'))
    .map(({ effect, active }) => ({
      value: effect.byLevel ? atLevel(effect.byLevel, level, effect.value) : effect.value,
      type: effect.type,
      source: active.def.name,
    }))
  const { total, applied } = stackSpeed(mods)
  if (!total || Number.isNaN(base)) return { text: s.speed, changed: false, note: '' }
  const note = applied
    .map((m) => `${m.value > 0 ? '+' : '−'}${Math.abs(m.value)} ${m.source}`)
    .join(', ')
  return { text: `${base + total} ft`, changed: true, note }
}

/** Only the highest bonus and worst penalty of a type count (Player Core p. 400). */
function stackSpeed(mods: Pf2eMod[]) {
  const applied: Pf2eMod[] = mods.filter((m) => m.type === 'untyped' && m.value !== 0)
  for (const type of ['status', 'circumstance', 'item'] as const) {
    const of = mods.filter((m) => m.type === type)
    const bonus = of.filter((m) => m.value > 0).sort((a, b) => b.value - a.value)[0]
    const penalty = of.filter((m) => m.value < 0).sort((a, b) => a.value - b.value)[0]
    if (bonus) applied.push(bonus)
    if (penalty) applied.push(penalty)
  }
  return { total: applied.reduce((n, m) => n + m.value, 0), applied }
}

const RANK_STEP: Record<Pf2eRank, number> = { U: 0, T: 2, E: 4, M: 6, L: 8 }
const RANKS: Pf2eRank[] = ['U', 'T', 'E', 'M', 'L']

type ProficiencyStat = Extract<Pf2eEffect, { kind: 'proficiency' }>['stat']

/**
 * The rank a statistic has once the hero's proficiency increases count (Juggernaut: master
 * Fortitude), never lower than the sheet's. Untrained stays untrained: an increase names
 * what the hero is already trained in.
 */
export function effectiveRank(s: Pf2eSheet, stat: ProficiencyStat, stored: Pf2eRank): Pf2eRank {
  if (stored === 'U') return stored
  return allOf(s, 'proficiency')
    .filter(({ effect }) => effect.stat === stat)
    .reduce<Pf2eRank>(
      (best, { effect }) => (RANKS.indexOf(effect.rank) > RANKS.indexOf(best) ? effect.rank : best),
      stored,
    )
}

/** The sheet's own rank for a number, to raise from. */
function storedRank(s: Pf2eSheet, ctx: Pf2eStatContext): [ProficiencyStat, Pf2eRank] | undefined {
  const row = (label: string) => s.saves.find((x) => x.label === label)?.rank
  if (ctx.kind === 'save' && ctx.save) return [ctx.save, row(ctx.save) ?? 'U']
  if (ctx.kind === 'perception') return ['Perception', row('Perception') ?? 'U']
  if (ctx.kind === 'classDc' && !ctx.spell) return ['Class DC', row('Class DC') ?? 'U']
  if (ctx.kind === 'ac') return ['AC', s.acRank]
  if (ctx.kind === 'attack' && ctx.rank) return ['attack', ctx.rank]
  return undefined
}

/** A proficiency increase as the bonus it adds over the sheet's rank (master over expert: +2). */
function proficiencyGain(s: Pf2eSheet, ctx: Pf2eStatContext): Pf2eMod | undefined {
  const at = storedRank(s, ctx)
  if (!at) return undefined
  const rank = effectiveRank(s, at[0], at[1])
  const gain = RANK_STEP[rank] - RANK_STEP[at[1]]
  if (gain <= 0) return undefined
  const by = allOf(s, 'proficiency').find(
    ({ effect }) => effect.stat === at[0] && effect.rank === rank,
  )
  const word = { U: 'untrained', T: 'trained', E: 'expert', M: 'master', L: 'legendary' }[rank]
  return {
    value: gain,
    type: 'untyped',
    source: `${by?.active.def.name ?? 'Proficiency'} (${word})`,
  }
}

const DEGREE_ORDER: Pf2eDegreeName[] = [
  'critical failure',
  'failure',
  'success',
  'critical success',
]

/**
 * A save's degree after the hero's upgrades (Juggernaut: a success is a critical success;
 * Greater Juggernaut: a critical failure is a failure). Ones limited to some effects ("against
 * fear") come back as notes for the player to apply.
 */
export function shiftedDegree(
  s: Pf2eSheet,
  save: 'Fortitude' | 'Reflex' | 'Will',
  degree: Pf2eDegreeName,
): { degree: Pf2eDegreeName; by?: string; notes: string[] } {
  const shifts = allOf(s, 'degree').filter(
    ({ effect }) => effect.save === save || effect.save === 'all',
  )
  const notes = shifts
    .filter(({ effect }) => effect.against && effect.from === degree)
    .map(
      ({ effect, active }) => `${active.def.name}: ${effect.to} instead against ${effect.against}`,
    )
  const hit = shifts.find(({ effect }) => !effect.against && effect.from === degree)
  if (!hit) return { degree, notes }
  const better = DEGREE_ORDER.indexOf(hit.effect.to) > DEGREE_ORDER.indexOf(degree)
  return better ? { degree: hit.effect.to, by: hit.active.def.name, notes } : { degree, notes }
}

/**
 * The hero's resistances from active effects, at their level (Guardian's Armor: physical 1 + ½
 * level); a toggle's own value when it was set on use (Selfish Shield with Relentless Reaction).
 */
export function resistancesNow(s: Pf2eSheet, level: number) {
  return allOf(s, 'resistance').map(({ effect, active }) => ({
    type: effect.type,
    value:
      active.value ??
      amountAt(effect.amount, level, s.attrs.CON, effect.min ?? 0) + (effect.add ?? 0),
    source: active.def.name,
  }))
}

/** The fist's damage die after effects (Powerful Fist: d6), or undefined. */
export const fistDie = (s: Pf2eSheet) =>
  allOf(s, 'fistDie').reduce<number | undefined>(
    (d, { effect }) => Math.max(d ?? 0, effect.die),
    undefined,
  )

/**
 * Ends the hero's toggles that end at this point (Shield at the start of your next turn,
 * Nimble Dodge's bonus once the triggering attack is done); returns what ended.
 */
export function endPf2eEffects(s: Pf2eSheet, when: Pf2eEnds[]): string[] {
  const ending = (s.effects?.on ?? []).filter((n) => {
    const ends = pf2eEffectDef(s, n)?.ends
    return ends && when.includes(ends)
  })
  const out = ending.map((n) => endToggle(s, n))
  const given = s.effects?.given ?? []
  const lapsed = given.filter((g) => {
    const ends = BY_NAME.get(g.name)?.ends
    return ends && when.includes(ends)
  })
  if (lapsed.length && s.effects) {
    s.effects.given = given.filter((g) => !lapsed.includes(g))
    out.push(...lapsed.map((g) => `${g.name.replace(' (ally)', '')} ends.`))
  }
  return out
}

export interface Pf2eDamageFlags {
  offGuard?: boolean
  huntedPrey?: boolean
  /** The Strike uses Devise a Stratagem (strategic strike). */
  stratagem?: boolean
}

/** Extra damage dice a Strike gets while its condition holds (sneak attack, precision). */
export function extraDice(
  s: Pf2eSheet,
  level: number,
  strike: { traits: string; ranged?: boolean },
  flags: Pf2eDamageFlags,
) {
  const traits = strike.traits.split(',').map((t) => t.trim().toLowerCase())
  return allOf(s, 'damageDice').flatMap(({ effect: e }) => {
    if (e.when === 'offGuard' && !flags.offGuard) return []
    if (e.when === 'huntedPrey' && !flags.huntedPrey) return []
    if (e.when === 'stratagem' && !flags.stratagem) return []
    const fits =
      e.weapons === 'unarmed'
        ? traits.includes('unarmed')
        : e.weapons !== 'agileFinesseRanged' ||
          strike.ranged ||
          traits.includes('agile') ||
          traits.includes('finesse')
    const dice = [...e.dice].reverse().find(([at]) => at <= level)?.[1]
    return fits && dice ? [{ dice, label: e.label }] : []
  })
}

/** The conditional damage the hero's abilities offer, for the Strikes panel's switches. */
export const damageConditions = (s: Pf2eSheet) => [
  ...new Set(allOf(s, 'damageDice').map(({ effect }) => effect.when)),
]

/**
 * Devise a Stratagem's attack (Player Core 2 p. 103): the Strike can add INT instead of STR or
 * DEX, so it does when INT is at least as good; a melee, unarmed or thrown weapon must be agile
 * or finesse. Strategic strike's dice come only with a Strike that adds INT (p. 100).
 */
export function stratagemUsesInt(
  s: Pf2eSheet,
  strike: { traits: string; ranged?: boolean; attr?: Pf2eAttr },
) {
  const traits = strike.traits.split(',').map((t) => t.trim().toLowerCase())
  const thrown = traits.some((t) => t.startsWith('thrown'))
  const fits =
    traits.includes('agile') || traits.includes('finesse') || (!!strike.ranged && !thrown)
  return fits && s.attrs.INT >= s.attrs[strike.attr ?? 'STR']
}

/**
 * Devise a Stratagem covers only the first Strike after it (p. 103). `ready`: the next attack
 * roll gets it; `struck`: the Strike (by index) whose attack used INT, until its damage is rolled.
 */
export interface Pf2eStratagem {
  ready: boolean
  struck?: number
}

/** After an attack roll: it spends a ready stratagem, and ends the last one's damage. */
export const stratagemAttacked = (st: Pf2eStratagem, strike: number, usedInt: boolean) => ({
  ready: false,
  struck: st.ready && usedInt ? strike : undefined,
})

/** After a damage roll: the struck Strike's strategic strike dice are spent. */
export const stratagemDamaged = (st: Pf2eStratagem, strike: number): Pf2eStratagem =>
  st.struck === strike ? { ready: st.ready } : st

/** Diehard: the dying value at which the hero dies before doomed (p. 254). */
export const baseDeathAt = (s: Pf2eSheet) =>
  allOf(s, 'deathAt').reduce((n, { effect }) => Math.max(n, effect.value), 4)

/** Toughness: change to recovery check DCs (p. 263). */
export const recoveryDcChange = (s: Pf2eSheet) =>
  allOf(s, 'recoveryDc').reduce((n, { effect }) => n + effect.value, 0)

/**
 * Ends a toggle. Temporary HP it gave go with it (Rage, Player Core 2 p. 72), unless the
 * hero has more now than it gave (they came from something else).
 */
function endToggle(s: Pf2eSheet, name: string) {
  const effects = (s.effects ??= { on: [], given: [] })
  effects.on = effects.on.filter((n) => n !== name)
  if (effects.values) delete effects.values[name]
  if (effects.items) effects.items = effects.items.filter((d) => d.name !== name)
  const temp = effects.tempHp
  if (temp?.from !== name) return `${name} ends.`
  delete effects.tempHp
  if (s.tempHp === 0 || s.tempHp > temp.amount) return `${name} ends.`
  const lost = s.tempHp
  s.tempHp = 0
  return `${name} ends: you lose its ${lost} remaining temporary Hit Points.`
}

/**
 * Turns one of the hero's toggles on or off; Rage's temp HP don't stack with others. `value`
 * is a spell's number at the rank it was cast (Competitive Edge +2 at 7th, False Vitality's
 * temp HP), kept while it's on.
 */
export function toggleEffect(s: Pf2eSheet, name: string, level: number, value?: number): string {
  const def = pf2eEffectDef(s, name)
  if (!def || def.mode !== 'toggle') return `${name} isn't something you turn on.`
  const effects = (s.effects ??= { on: [], given: [] })
  if (effects.on.includes(name)) return endToggle(s, name)
  effects.on = [...effects.on, name]
  // Turned on during your turn, it lasts through the end of your next one.
  if (def.ends === 'endOfNextTurn' && s.turn?.active) s.turn.carry = [...(s.turn.carry ?? []), name]
  if (value !== undefined) effects.values = { ...effects.values, [name]: value }
  const temp = def.effects.find((e) => e.kind === 'tempHp')
  if (temp) {
    const amount = value ?? amountAt(temp.formula, level, s.attrs.CON)
    if (amount > s.tempHp) {
      s.tempHp = amount
      effects.tempHp = { from: name, amount }
    }
    return `${name}: ${amount} temporary Hit Points (you keep the higher of these and any you had).`
  }
  return `${name} is on.`
}

/** Falling unconscious ends the toggles that say so (Rage); returns what ended, for the log. */
export function endOnUnconscious(s: Pf2eSheet): string {
  const ending = (s.effects?.on ?? []).filter((n) => pf2eEffectDef(s, n)?.endsWhenUnconscious)
  return ending.map((n) => endToggle(s, n)).join(' ')
}

/** Sets or clears an ally's effect on the hero; `value` for scaling ones like Heroism. */
export function setGiven(s: Pf2eSheet, name: string, on: boolean, value?: number) {
  const effects = (s.effects ??= { on: [], given: [] })
  effects.given = effects.given.filter((g) => g.name !== name)
  if (on) effects.given.push(value === undefined ? { name } : { name, value })
}
