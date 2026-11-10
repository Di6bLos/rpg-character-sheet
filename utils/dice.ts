/** Dice rules shared by the character sheets. `rng` is injectable for tests. */
export type Rng = () => number

export interface DiceExpr {
  count: number
  sides: number
  mod: number
}

const EXPR = /^\s*(\d+)\s*d\s*(\d+)\s*([+-]\s*\d+)?\s*$/i

export function parseDice(expr: string): DiceExpr | null {
  const m = EXPR.exec(expr)
  if (!m) return null
  const count = Number(m[1])
  const sides = Number(m[2])
  if (count < 1 || count > 100 || sides < 2 || sides > 1000) return null
  return { count, sides, mod: m[3] ? Number(m[3].replace(/\s+/g, '')) : 0 }
}

export function rollDie(sides: number, rng: Rng = Math.random): number {
  return 1 + Math.floor(rng() * sides)
}

export function sign(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`
}

export interface RollResult {
  total: number
  rolls: number[]
}

export function rollDice(expr: DiceExpr, rng: Rng = Math.random): RollResult {
  const rolls = Array.from({ length: expr.count }, () => rollDie(expr.sides, rng))
  return { total: rolls.reduce((a, b) => a + b, 0) + expr.mod, rolls }
}

/** D&D 5e critical hit: roll the damage dice twice; the flat modifier is added once. */
export function critDice(expr: DiceExpr): DiceExpr {
  return { ...expr, count: expr.count * 2 }
}

/** D&D 5e ability modifier from a score. */
export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2)
}

export interface AttackRoll {
  d20: number
  total: number
  natural: 20 | 1 | null
}

export function rollAttack(bonus: number, rng: Rng = Math.random): AttackRoll {
  const d20 = rollDie(20, rng)
  return { d20, total: d20 + bonus, natural: d20 === 20 ? 20 : d20 === 1 ? 1 : null }
}

/** Pathfinder 2e multiple attack penalty for the 1st, 2nd and 3rd attack. */
export function mapPenalties(agile: boolean): [number, number, number] {
  return agile ? [0, 4, 8] : [0, 5, 10]
}

export interface NimbleRoll {
  miss: boolean
  crit: boolean
  total: number
  bonus: number
}

/**
 * Nimble attacks have no to-hit roll: roll damage. A 1 on the first die misses;
 * the first die's maximum rolls again (and keeps exploding) as a crit.
 * `bonusDice` are extra dice (e.g. Fury) added on a hit.
 */
export function rollNimble(
  expr: DiceExpr,
  bonusDice: { count: number; sides: number } | null = null,
  rng: Rng = Math.random,
): NimbleRoll {
  const first = rollDie(expr.sides, rng)
  if (first === 1) return { miss: true, crit: false, total: 0, bonus: 0 }
  let total = first
  let crit = false
  let last = first
  while (last === expr.sides) {
    crit = true
    last = rollDie(expr.sides, rng)
    total += last
  }
  for (let i = 1; i < expr.count; i++) total += rollDie(expr.sides, rng)
  let bonus = 0
  if (bonusDice) for (let i = 0; i < bonusDice.count; i++) bonus += rollDie(bonusDice.sides, rng)
  return { miss: false, crit, total: total + expr.mod + bonus, bonus }
}
