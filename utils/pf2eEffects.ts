// Applies the structured ability effects in `data/pf2e/effects.ts` to a PF2e sheet: which
// ones the hero has (by the names of their feats, features, picks and spells), which are on
// (permanent ones always, toggles the hero turned on, effects from allies), the modifiers they
// add to a number (stacked with conditions by `adjusted` in utils/pf2ePlay.ts), extra Strike
// damage dice, Speed, and the dying rules Diehard and Toughness change.
import { PF2E_EFFECTS } from '~/data/pf2e/effects'
import type { Pf2eEffect, Pf2eEffectDef, Pf2eSelector } from '~/data/pf2e/types'
import type { Pf2eSheet } from '~/types/sheets'
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

/** Effects on right now. */
export function activeEffects(s: Pf2eSheet): Pf2eActiveEffect[] {
  const on = new Set(s.effects?.on ?? [])
  const own = ownEffects(s)
    .filter((e) => e.mode === 'permanent' || on.has(e.name))
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

/** Modifiers active effects add to one number. */
export function effectMods(s: Pf2eSheet, ctx: Pf2eStatContext): Pf2eMod[] {
  const want = selectors(ctx)
  return allOf(s, 'modifier').flatMap(({ effect: e, active }) => {
    if (!e.selector.some((x) => want.includes(x))) return []
    if (e.melee && !ctx.melee) return []
    const base = active.value ?? e.value
    const value = e.agileHalf && ctx.agile ? Math.floor(base / 2) : base
    return value ? [{ value, type: e.type, source: active.def.name }] : []
  })
}

/** Speed after effects (Fleet), as the sheet writes it. */
export function speedNow(s: Pf2eSheet) {
  const base = Number.parseInt(s.speed, 10)
  const bonus = allOf(s, 'modifier')
    .filter(({ effect }) => effect.selector.includes('speed'))
    .reduce((n, { effect }) => n + effect.value, 0)
  if (!bonus || Number.isNaN(base)) return { text: s.speed, changed: false }
  return { text: `${base + bonus} ft`, changed: true }
}

export interface Pf2eDamageFlags {
  offGuard?: boolean
  huntedPrey?: boolean
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

/** Diehard: the dying value at which the hero dies before doomed (p. 254). */
export const baseDeathAt = (s: Pf2eSheet) =>
  allOf(s, 'deathAt').reduce((n, { effect }) => Math.max(n, effect.value), 4)

/** Toughness: change to recovery check DCs (p. 263). */
export const recoveryDcChange = (s: Pf2eSheet) =>
  allOf(s, 'recoveryDc').reduce((n, { effect }) => n + effect.value, 0)

/** Turns one of the hero's toggles on or off; Rage's temp HP don't stack with others. */
export function toggleEffect(s: Pf2eSheet, name: string, level: number): string {
  const def = BY_NAME.get(name)
  if (!def || def.mode !== 'toggle') return `${name} isn't something you turn on.`
  const effects = (s.effects ??= { on: [], given: [] })
  if (effects.on.includes(name)) {
    effects.on = effects.on.filter((n) => n !== name)
    return `${name} ends.`
  }
  effects.on = [...effects.on, name]
  const temp = def.effects.find((e) => e.kind === 'tempHp')
  if (temp) {
    const amount = level + s.attrs.CON
    s.tempHp = Math.max(s.tempHp, amount)
    return `${name}: ${amount} temporary Hit Points (you keep the higher of these and any you had).`
  }
  return `${name} is on.`
}

/** Sets or clears an ally's effect on the hero; `value` for scaling ones like Heroism. */
export function setGiven(s: Pf2eSheet, name: string, on: boolean, value?: number) {
  const effects = (s.effects ??= { on: [], given: [] })
  effects.given = effects.given.filter((g) => g.name !== name)
  if (on) effects.given.push(value === undefined ? { name } : { name, value })
}
