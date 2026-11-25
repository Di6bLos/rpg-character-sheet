// Applies the structured ability effects in `data/pf2e/effects.ts` to a PF2e sheet: which
// ones the hero has (by the names of their feats, features, picks and spells), which are on
// (permanent ones always, toggles the hero turned on, effects from allies), the modifiers they
// add to a number (stacked with conditions by `adjusted` in utils/pf2ePlay.ts), extra Strike
// damage dice, Speed, and the dying rules Diehard and Toughness change.
import { PF2E_EFFECTS } from '~/data/pf2e/effects'
import type { Pf2eEffect, Pf2eEffectDef, Pf2eSelector } from '~/data/pf2e/types'
import type { Pf2eAttr, Pf2eSheet } from '~/types/sheets'
import type { Pf2eMod, Pf2eStatContext } from '~/utils/pf2ePlay'

const BY_NAME = new Map(PF2E_EFFECTS.map((e) => [e.name, e]))

/** Effects allies can give the hero, to pick from. */
export const GIVEN_EFFECTS = PF2E_EFFECTS.filter((e) => e.mode === 'given')

/** Names of everything the hero has that an effect could belong to. */
export function abilityNames(s: Pf2eSheet) {
  return new Set([
    ...s.feats.map((f) => f.name),
    ...(s.focusSpells ?? []).map((f) => f.name),
    ...(s.spellcasting?.cantrips ?? []).map((f) => f.name),
    ...(s.spellcasting?.spells ?? []).map((f) => f.name),
  ])
}

/** The hero's own effects: permanent ones and toggles they can turn on. */
export function ownEffects(s: Pf2eSheet): Pf2eEffectDef[] {
  const names = abilityNames(s)
  return PF2E_EFFECTS.filter((e) => e.mode !== 'given' && names.has(e.name))
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
    .map((def) => ({ def }))
  const given = (s.effects?.given ?? []).flatMap((g) => {
    const def = BY_NAME.get(g.name)
    return def ? [{ def, value: g.value }] : []
  })
  return [...own, ...given]
}

const allOf = <K extends Pf2eEffect['kind']>(s: Pf2eSheet, kind: K) =>
  activeEffects(s).flatMap((a) =>
    a.def.effects
      .filter((e): e is Extract<Pf2eEffect, { kind: K }> => e.kind === kind)
      .map((effect) => ({ effect, active: a })),
  )

/** The selectors a number answers to. */
function selectors(ctx: Pf2eStatContext): Pf2eSelector[] {
  const out: Pf2eSelector[] = []
  if (ctx.kind === 'ac') out.push('ac')
  if (ctx.kind === 'attack') out.push('attack')
  if (ctx.kind === 'damage') out.push('damage')
  if (ctx.kind === 'perception') out.push('perception')
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
    if (e.skills && (ctx.kind !== 'skill' || !e.skills.includes(ctx.skill ?? ''))) return []
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
    const spec = allOf(s, 'specialization')
      .map(({ effect, active }) => ({
        value: effect.damage[ctx.rank ?? 'U'] ?? 0,
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

/** Speed after effects (Fleet), as the sheet writes it. */
export function speedNow(s: Pf2eSheet) {
  const base = Number.parseInt(s.speed, 10)
  // Effects with a speed modifier (Fleet +5, Mountain Stance −5).
  const bonus = allOf(s, 'modifier')
    .filter(({ effect }) => effect.selector.includes('speed'))
    .reduce((n, { effect }) => n + effect.value, 0)
  if (!bonus || Number.isNaN(base)) return { text: s.speed, changed: false }
  return { text: `${base + bonus} ft`, changed: true }
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
      e.weapons !== 'agileFinesseRanged' ||
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
  const temp = effects.tempHp
  if (temp?.from !== name) return `${name} ends.`
  delete effects.tempHp
  if (s.tempHp === 0 || s.tempHp > temp.amount) return `${name} ends.`
  const lost = s.tempHp
  s.tempHp = 0
  return `${name} ends: you lose its ${lost} remaining temporary Hit Points.`
}

/** Turns one of the hero's toggles on or off; Rage's temp HP don't stack with others. */
export function toggleEffect(s: Pf2eSheet, name: string, level: number): string {
  const def = BY_NAME.get(name)
  if (!def || def.mode !== 'toggle') return `${name} isn't something you turn on.`
  const effects = (s.effects ??= { on: [], given: [] })
  if (effects.on.includes(name)) return endToggle(s, name)
  effects.on = [...effects.on, name]
  const temp = def.effects.find((e) => e.kind === 'tempHp')
  if (temp) {
    const amount = level + s.attrs.CON
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
  const ending = (s.effects?.on ?? []).filter((n) => BY_NAME.get(n)?.endsWhenUnconscious)
  return ending.map((n) => endToggle(s, n)).join(' ')
}

/** Sets or clears an ally's effect on the hero; `value` for scaling ones like Heroism. */
export function setGiven(s: Pf2eSheet, name: string, on: boolean, value?: number) {
  const effects = (s.effects ??= { on: [], given: [] })
  effects.given = effects.given.filter((g) => g.name !== name)
  if (on) effects.given.push(value === undefined ? { name } : { name, value })
}
