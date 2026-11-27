// How a 5e (2024) hero meets harm. `DND5E_GUARDS`: the reactions and features that cut a hit's
// damage as it lands (Uncanny Dodge halves it, SRD 5.2.1 p. 62; Deflect Attacks, p. 50; Parry;
// Protective Field; Song of Defense; Sentinel at Death's Door; Shade Form…), chosen beside the
// HP bar and applied by `guardHit`. `DND5E_AC_REACTIONS`: what raises AC against one attack
// before it's known to hit (Defensive Duelist, Combat Inspiration, Glorious Defense, Warding
// Maneuver) or makes it roll with Disadvantage (a Luck Point). `saveDamage`: damage from an
// effect with a saving throw, half on a success, with Evasion (pp. 51, 62), Leading Evasion
// and Spell Avoidance taking none on a success and half on a failure. Pure;
// tests/dnd5eDefense.test.ts.
import type { Dnd5eSheet } from '~/types/sheets'
import { addEffect, hasEffect, removeEffect } from '~/utils/dnd5eEffects'
import { heldInspiration } from '~/utils/dnd5eRiders'
import {
  type D20Mode,
  type Dnd5eHit,
  DND5E_DAMAGE_TYPES,
  costWhy,
  dnd5eHero,
  hitDiceLeft,
  payCost,
  rollTest,
  saveRow,
  spendUses,
  usesLeft,
} from '~/utils/dnd5ePlay'
import { activeConditions } from '~/utils/dnd5eConditions'
import { slotsLeft } from '~/utils/dnd5eSpells'
import { type Rng, parseDice, rollDice, sign } from '~/utils/dice'

const BPS = ['Bludgeoning', 'Piercing', 'Slashing']

/** A reaction or feature that changes a hit's damage as it lands. */
export interface Dnd5eGuard {
  key: string
  name: string
  /** The sheet feature (or option) that gives it. */
  feature: string
  /** A feat by slug instead. */
  feat?: string
  cost: 'reaction' | 'free'
  /** A resource it spends, by its sheet name. */
  spend?: string
  /** An effect that must be on (Song of Defense needs Bladesong). */
  needs?: string
  kind: 'halve' | 'reduce' | 'zero' | 'resist'
  /** What it takes off: dice (a pool's die by its resource name), plus ability or level amounts. */
  dice?: string | { pool: string }
  plus?: ('DEX' | 'STR/DEX' | 'INT' | 'level' | 'level5')[]
  /** Only against these damage types (Deflect Attacks: B, P, S until Deflect Energy). */
  types?: string[]
  /** It spends a spell slot, cutting 5 × its level (Song of Defense). */
  slot?: boolean
  /** It spends Hit Point Dice, up to CHA of them (Burning Life Force). */
  hitDice?: boolean
  /** Ends a Critical Hit's extra damage (Sentinel at Death's Door). */
  noCrit?: boolean
  /** An effect it starts (Dispersion's Resistance). */
  effect?: string
  note: string
}

export const DND5E_GUARDS: Dnd5eGuard[] = [
  {
    key: 'uncanny-dodge',
    name: 'Uncanny Dodge',
    feature: 'Uncanny Dodge',
    cost: 'reaction',
    kind: 'halve',
    note: 'An attacker you can see hits you: halve the attack’s damage.',
  },
  {
    key: 'deflect-attacks',
    name: 'Deflect Attacks',
    feature: 'Deflect Attacks',
    cost: 'reaction',
    kind: 'reduce',
    dice: '1d10',
    plus: ['DEX', 'level'],
    types: BPS,
    note: 'Cut the attack’s damage by 1d10 + DEX + Monk level; brought to 0, you can spend 1 Focus Point to redirect it.',
  },
  {
    key: 'parry',
    name: 'Parry',
    feature: 'Parry',
    cost: 'reaction',
    spend: 'Combat Superiority',
    kind: 'reduce',
    dice: { pool: 'Combat Superiority' },
    plus: ['STR/DEX'],
    note: 'A melee attack damages you: cut it by a Superiority Die + STR or DEX.',
  },
  {
    key: 'protective-field',
    name: 'Protective Field',
    feature: 'Psionic Power',
    cost: 'reaction',
    spend: 'Psionic Power',
    kind: 'reduce',
    dice: { pool: 'Psionic Power' },
    plus: ['INT'],
    note: 'Spend a Psionic Energy Die: cut the damage by its roll + INT.',
  },
  {
    key: 'slow-fall',
    name: 'Slow Fall',
    feature: 'Slow Fall',
    cost: 'reaction',
    kind: 'reduce',
    plus: ['level5'],
    types: ['Bludgeoning'],
    note: 'Falling damage only: cut it by 5 × your Monk level.',
  },
  {
    key: 'sentinel-at-deaths-door',
    name: 'Sentinel at Death’s Door',
    feature: 'Sentinel at Death’s Door',
    cost: 'reaction',
    spend: 'Sentinel at Death’s Door',
    kind: 'halve',
    noCrit: true,
    note: 'Halve the damage and cancel a Critical Hit’s extra dice.',
  },
  {
    key: 'elemental-rebuke',
    name: 'Elemental Rebuke',
    feature: 'Elemental Rebuke',
    cost: 'reaction',
    spend: 'Elemental Rebuke',
    kind: 'halve',
    note: 'Halve the damage; the attacker makes a DEX save against 2d10 + CHA of an element, half on a success.',
  },
  {
    key: 'beguiling-defenses',
    name: 'Beguiling Defenses',
    feature: 'Beguiling Defenses',
    cost: 'reaction',
    spend: 'Beguiling Defenses',
    kind: 'halve',
    note: 'Halve the damage; on a failed WIS save the attacker takes Psychic damage equal to what you took.',
  },
  {
    key: 'song-of-defense',
    name: 'Song of Defense',
    feature: 'Song of Defense',
    cost: 'reaction',
    needs: 'bladesong',
    kind: 'reduce',
    slot: true,
    note: 'During Bladesong, spend a spell slot: cut the damage by 5 × its level.',
  },
  {
    key: 'shade-form',
    name: 'Shade Form',
    feature: 'Grieving Mantle',
    cost: 'reaction',
    needs: 'grieving-mantle',
    kind: 'zero',
    note: 'While the Grieving Mantle lasts, an attack that hits you deals you no damage.',
  },
  {
    key: 'illusory-self',
    name: 'Illusory Self',
    feature: 'Illusory Self',
    cost: 'reaction',
    spend: 'Illusory Self',
    kind: 'zero',
    note: 'A decoy steps in: the attack misses.',
  },
  {
    key: 'dispersion',
    name: 'Dispersion',
    feature: 'Dispersion',
    cost: 'reaction',
    spend: 'Dispersion',
    kind: 'resist',
    effect: 'dispersion',
    note: 'Resistance to all damage, this hit too, until your next turn ends.',
  },
  {
    key: 'superior-hunters-defense',
    name: 'Superior Hunter’s Defense',
    feature: 'Superior Hunter’s Defense',
    cost: 'reaction',
    kind: 'resist',
    note: 'Resistance to this damage type until the end of the turn.',
  },
  {
    key: 'warding-maneuver',
    name: 'Warding Maneuver',
    feature: 'Warding Maneuver',
    cost: 'reaction',
    spend: 'Combat Superiority',
    kind: 'resist',
    note: 'The die went on your AC and the attack still hit: you resist its damage.',
  },
  {
    key: 'burning-life-force',
    name: 'Burning Life Force',
    feature: 'Crown of Spellfire',
    cost: 'free',
    needs: 'crown-of-spellfire',
    kind: 'reduce',
    hitDice: true,
    note: 'Once a turn, spend up to CHA Hit Point Dice and take their roll off the damage.',
  },
]

const pool = (s: Dnd5eSheet, name: string) => {
  const m = /(\d*)d(\d+)/.exec(s.resources?.find((r) => r.name === name)?.dice ?? '')
  return m ? `${m[1] || 1}d${m[2]}` : ''
}

/** The guards the hero has, and why each can't be used now (''). */
export function damageGuards(
  s: Dnd5eSheet,
  level: number,
  type = '',
): { guard: Dnd5eGuard; why: string }[] {
  const hero = dnd5eHero(s, level)
  return DND5E_GUARDS.filter((g) => (g.feat ? hero.feat(g.feat) : hero.has(g.feature))).map((g) => {
    const energy = g.key === 'deflect-attacks' && hero.has('Deflect Energy')
    const t = type.trim()
    let why = g.cost === 'reaction' ? costWhy(s, 'reaction') : ''
    if (!why && g.needs && !hasEffect(s, g.needs)) why = 'Not active'
    if (!why && g.spend && usesLeft(s, g.spend) < 1) why = `No ${g.spend} left`
    if (!why && g.slot && !slotsLeft(s).some((n) => n > 0)) why = 'No spell slot left'
    if (!why && g.hitDice && hitDiceLeft(s, level) < 1) why = 'No Hit Point Dice left'
    if (
      !why &&
      t &&
      g.types &&
      !energy &&
      !g.types.some((x) => x.toLowerCase() === t.toLowerCase())
    )
      why = `Not against ${t}`
    return { guard: g, why }
  })
}

/**
 * Applies the chosen guards to a hit: pays their Reaction (one a round, so only the first
 * reaction guard), spends their uses, rolls what they take off, and changes the hit (reduce,
 * halve, zero, resist, no crit). Returns what each did.
 */
export function guardHit(
  s: Dnd5eSheet,
  level: number,
  hit: Dnd5eHit,
  keys: string[],
  rng?: Rng,
): string[] {
  const hero = dnd5eHero(s, level)
  const ok = damageGuards(s, level, hit.type).filter((g) => keys.includes(g.guard.key) && !g.why)
  const notes: string[] = []
  let reacted = false
  for (const { guard: g } of ok) {
    if (g.cost === 'reaction') {
      if (reacted) continue
      reacted = true
      payCost(s, level, 'reaction')
    }
    if (g.spend) spendUses(s, g.spend)
    if (g.noCrit) hit.crit = false
    if (g.kind === 'halve') hit.halve = g.name
    else if (g.kind === 'zero')
      hit.reduce = [...(hit.reduce ?? []), { label: g.name, amount: hit.amount }]
    else if (g.kind === 'resist') {
      hit.resisted = g.name
      if (g.effect) addEffect(s, g.effect, { held: !!s.turn?.active })
    } else {
      let cut = 0
      const parts: string[] = []
      const dice = typeof g.dice === 'object' ? pool(s, g.dice.pool) : g.dice
      if (dice) {
        const d = parseDice(dice)
        if (d) {
          const r = rollDice(d, rng)
          cut += r.total
          parts.push(`${dice} ${r.rolls.join('+')}`)
        }
      }
      for (const p of g.plus ?? []) {
        const n =
          p === 'level'
            ? level
            : p === 'level5'
              ? 5 * level
              : p === 'STR/DEX'
                ? Math.max(hero.mod('STR'), hero.mod('DEX'))
                : hero.mod(p)
        cut += n
        parts.push(`${sign(n)} ${p === 'level5' ? '5 × level' : p}`)
      }
      if (g.slot) {
        const left = slotsLeft(s)
        const need = Math.ceil(hit.amount / 5)
        const at =
          left.findIndex((n, i) => n > 0 && i + 1 >= need) + 1 ||
          left.reduce((best, n, i) => (n > 0 ? i + 1 : best), 0)
        if (at) {
          const used = [...(s.slotsUsed ?? [])]
          while (used.length < 9) used.push(0)
          used[at - 1] = (used[at - 1] ?? 0) + 1
          s.slotsUsed = used
          cut += 5 * at
          parts.push(`a level ${at} slot: ${5 * at}`)
        }
      }
      if (g.hitDice) {
        const n = Math.min(Math.max(1, hero.mod('CHA')), hitDiceLeft(s, level))
        const r = rollDice({ count: n, sides: s.hitDie || 8, mod: 0 }, rng)
        s.hitDiceUsed = (s.hitDiceUsed ?? 0) + n
        cut += r.total
        parts.push(`${n} Hit Point Dice ${r.rolls.join('+')}`)
      }
      hit.reduce = [...(hit.reduce ?? []), { label: `${g.name} (${parts.join(' ')})`, amount: cut }]
    }
    notes.push(g.name)
  }
  return notes
}

/** What a guard does to a damage amount, for the HP bar's preview (dice count as nothing). */
export function guardPreview(keys: string[], amount: number): number {
  const g = DND5E_GUARDS.filter((x) => keys.includes(x.key))
  if (g.some((x) => x.kind === 'zero')) return 0
  return g.some((x) => x.kind === 'halve' || x.kind === 'resist') ? Math.floor(amount / 2) : amount
}

/** Something used when an attack is coming at the hero, before it's known to hit. */
export interface Dnd5eAcReaction {
  key: string
  name: string
  cost: 'reaction' | 'free'
  /** What it adds to AC against that attack, or that it imposes Disadvantage. */
  ac?: string
  disadvantage?: boolean
  why: string
  note: string
}

/** The hero's ways to meet one attack: AC against it, or Disadvantage on it. */
export function acReactions(s: Dnd5eSheet, level: number): Dnd5eAcReaction[] {
  const hero = dnd5eHero(s, level)
  const react = costWhy(s, 'reaction')
  const out: Dnd5eAcReaction[] = []
  const held = heldInspiration(s)
  if (hero.feat('defensive-duelist'))
    out.push({
      key: 'defensive-duelist',
      name: 'Defensive Duelist',
      cost: 'reaction',
      ac: String(hero.pb),
      why: react,
      note: 'Holding a Finesse weapon, add your PB to AC against a melee attack.',
    })
  if (held?.valor)
    out.push({
      key: 'combat-inspiration',
      name: 'Combat Inspiration',
      cost: 'reaction',
      ac: held.dice,
      why: react,
      note: 'Roll your Bardic Inspiration die and add it to your AC against that attack.',
    })
  if (hero.has('Glorious Defense'))
    out.push({
      key: 'glorious-defense',
      name: 'Glorious Defense',
      cost: 'reaction',
      ac: String(Math.max(1, hero.mod('CHA'))),
      why: react || (usesLeft(s, 'Glorious Defense') < 1 ? 'None left' : ''),
      note: 'Add your CHA modifier to AC against it; if it misses, make one weapon attack at the attacker.',
    })
  if (hero.has('Warding Maneuver'))
    out.push({
      key: 'warding-maneuver',
      name: 'Warding Maneuver',
      cost: 'reaction',
      ac: pool(s, 'Combat Superiority'),
      why: react || (usesLeft(s, 'Combat Superiority') < 1 ? 'No Superiority Dice left' : ''),
      note: 'Add a Superiority Die to AC against it; if it still hits, you resist its damage.',
    })
  if (hero.feat('lucky'))
    out.push({
      key: 'lucky',
      name: 'Luck Point',
      cost: 'free',
      disadvantage: true,
      why: usesLeft(s, LUCK) < 1 ? 'No Luck Points left' : '',
      note: 'Spend a Luck Point: the attack roll against you has Disadvantage.',
    })
  return out
}

/** The Lucky feat's Luck Points, by their resource name on the sheet. */
export const LUCK = 'Lucky: Luck Points'

/** Uses one of `acReactions`: pays it, rolls its die, and says what it does. */
export function useAcReaction(s: Dnd5eSheet, level: number, key: string, rng?: Rng): string {
  const r = acReactions(s, level).find((x) => x.key === key)
  if (!r) return ''
  if (r.why) return `${r.name}: ${r.why}.`
  if (r.cost === 'reaction') payCost(s, level, 'reaction')
  if (key === 'combat-inspiration') removeEffect(s, 'bardic-inspiration')
  if (key === 'glorious-defense') spendUses(s, 'Glorious Defense')
  if (key === 'warding-maneuver') spendUses(s, 'Combat Superiority')
  if (key === 'lucky') {
    spendUses(s, LUCK)
    return `${r.name}: the attack roll against you has Disadvantage.`
  }
  const d = r.ac ? parseDice(r.ac) : null
  const n = d ? rollDice(d, rng).total : Number(r.ac)
  return `${r.name}: +${n} AC against that attack. ${r.note}`
}

/** Evasion and the like: a Dexterity save (or any, for Spell Avoidance) for half takes none or half. */
export function evasionOf(s: Dnd5eSheet, level: number, ability: string): string {
  if (activeConditions(s).has('Incapacitated')) return ''
  const hero = dnd5eHero(s, level)
  if (hasEffect(s, 'crown-of-spellfire') && hero.has('Crown of Spellfire')) return 'Spell Avoidance'
  if (ability !== 'DEX') return ''
  if (hero.has('Evasion')) return 'Evasion'
  if (hero.has('Leading Evasion')) return 'Leading Evasion'
  return ''
}

export interface Dnd5eSaveDamage {
  /** The damage the effect deals on a failed save. */
  amount: number
  type?: string
  ability: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA'
  /** A success halves it (else a success takes none, and only a failure counts). */
  half: boolean
  /** The save's DC, when the sheet rolls it; or `saved`, what the table decided. */
  dc?: number
  saved?: boolean
  mode?: D20Mode
  d20?: number[]
  rng?: Rng
}

/**
 * Damage from an effect with a save (SRD 5.2.1 p. 9): rolls the save against `dc` (or takes
 * `saved`), then a success halves it (or, with Evasion on a DEX save, none and a failure
 * half). Returns the damage the hero takes and the line before it.
 */
export function saveDamage(
  s: Dnd5eSheet,
  level: number,
  o: Dnd5eSaveDamage,
): { taken: number; line: string } {
  let saved = o.saved ?? false
  let roll = ''
  if (o.dc !== undefined && o.saved === undefined) {
    const r = rollTest(s, saveRow(s, level, o.ability).test, {
      ...(o.mode ? { mode: o.mode } : {}),
      ...(o.d20 ? { d20: o.d20 } : {}),
      ...(o.rng ? { rng: o.rng } : {}),
    })
    saved = !r.failed && r.total >= o.dc
    roll = `${r.line.replace(/\.$/, '')} vs DC ${o.dc}: ${saved ? 'success' : 'failure'}. `
  }
  const ev = o.half ? evasionOf(s, level, o.ability) : ''
  const full = Math.max(0, Math.floor(o.amount))
  const taken = ev
    ? saved
      ? 0
      : Math.floor(full / 2)
    : saved
      ? o.half
        ? Math.floor(full / 2)
        : 0
      : full
  const why = ev
    ? `${ev}: ${saved ? 'none on a success' : 'half on a failure'}`
    : saved
      ? o.half
        ? 'half on a success'
        : 'none on a success'
      : 'the full damage'
  return {
    taken,
    line: `${roll}${o.ability} save for ${full}${o.type ? ` ${o.type.toLowerCase()}` : ''}: ${why}.`,
  }
}

/** The damage types, for the save-damage picker. */
export const SAVE_DAMAGE_TYPES = DND5E_DAMAGE_TYPES
