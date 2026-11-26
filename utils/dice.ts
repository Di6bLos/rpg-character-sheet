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

/**
 * The first dice expression in free text ("Stab. 1d6+2 (or Shoot, Range 8)." → 1d6+2),
 * for a stat block's Roll button. `text` is the expression as written, tidied.
 */
export function findDice(text: string): { text: string; dice: DiceExpr } | null {
  const m = /(\d+)\s*d\s*(\d+)(?:\s*([+\-\u2212])\s*(\d+)(?!\d|\s*d\s*\d))?/i.exec(text)
  if (!m) return null
  const op = m[3] === '\u2212' ? '-' : m[3]
  const expr = `${m[1]}d${m[2]}${op ? `${op}${m[4]}` : ''}`
  const dice = parseDice(expr)
  return dice ? { text: expr, dice } : null
}

let detailed = 0

/** One die. The dice tray is told about it unless a whole roll reports itself (`quietly`). */
export function rollDie(sides: number, rng: Rng = Math.random): number {
  const value = 1 + Math.floor(rng() * sides)
  if (!detailed)
    showDice({
      sides,
      dice: [value],
      dropped: [],
      primary: -1,
      explosions: [],
      extra: null,
      mod: 0,
      total: value,
      miss: false,
      crit: false,
      odds: 0,
      bare: true,
    })
  return value
}

/**
 * Rolls without reporting each die, for a roll that reports itself whole to the
 * dice tray (the Primary, dropped dice, explosions).
 */
export function quietly<T>(roll: () => T): T {
  detailed += 1
  try {
    return roll()
  } finally {
    detailed -= 1
  }
}

export function sign(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`
}

export interface RollResult {
  total: number
  rolls: number[]
}

/** Rolls a plain expression; the dice tray shows it as one roll with its total. */
export function rollDice(expr: DiceExpr, rng: Rng = Math.random): RollResult {
  const rolls = quietly(() => Array.from({ length: expr.count }, () => rollDie(expr.sides, rng)))
  const total = rolls.reduce((a, b) => a + b, 0) + expr.mod
  if (!detailed && rolls.length)
    showDice({
      sides: expr.sides,
      dice: rolls,
      dropped: [],
      primary: -1,
      explosions: [],
      extra: null,
      mod: expr.mod,
      total,
      miss: false,
      crit: false,
      odds: 0,
    })
  return { total, rolls }
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

/** One roll as the dice tray throws it: every die in order, the Primary, what was dropped. */
export interface ShownRoll {
  sides: number
  /** Every die thrown, in order, extra dice for advantage or disadvantage included. */
  dice: number[]
  /** Indexes into `dice` dropped by advantage or disadvantage. */
  dropped: number[]
  /** Index of the Primary Die (the first die kept); -1 when the roll has none (area spells). */
  primary: number
  /** Dice a crit rolled again, exploding. */
  explosions: number[]
  /** Dice added on a hit (Fury), with their own size. */
  extra: { sides: number; dice: number[] } | null
  mod: number
  total: number
  miss: boolean
  crit: boolean
  /** Disadvantage steps; negative is advantage. */
  odds: number
  /** A lone die with no rule around it; the app's result line has what it came to. */
  bare?: boolean
}

const diceWatchers = new Set<(roll: ShownRoll) => void>()

/** The dice tray watches rolls the app makes; returns the function that stops watching. */
export function onDiceShown(watch: (roll: ShownRoll) => void): () => void {
  diceWatchers.add(watch)
  return () => diceWatchers.delete(watch)
}

export function showDice(roll: ShownRoll): void {
  for (const watch of diceWatchers) watch(roll)
}

/**
 * What a roll came to once the app added everything up (bonuses, armor, crit
 * damage), shown under the dice: the final number and the app's result line.
 */
export interface RollOutcome {
  /** What was rolled: "Staff", "Ice Lance", "Initiative"; empty for a plain result line. */
  label: string
  /** The final number; null when the line says it (minions, a heal) or there is none. */
  total: number | null
  /** The app's result line. */
  detail: string
}

const outcomeWatchers = new Set<(outcome: RollOutcome) => void>()

/** The dice tray watches what rolls came to; returns the function that stops watching. */
export function onRollOutcome(watch: (outcome: RollOutcome) => void): () => void {
  outcomeWatchers.add(watch)
  return () => outcomeWatchers.delete(watch)
}

export function showOutcome(outcome: RollOutcome): void {
  for (const watch of outcomeWatchers) watch(outcome)
}

/** One click's dice as shared with the rest of the table: who threw them and what it came to. */
export interface SharedRoll {
  /** "Iriel", "GM". */
  from: string
  rolls: ShownRoll[]
  outcome: RollOutcome | null
}

const remoteWatchers = new Set<(roll: SharedRoll) => void>()

/**
 * The dice tray watches rolls made on other players' screens (`useBattleDiceShare`). They
 * never reach `onDiceShown`, so they aren't shared again.
 */
export function onRemoteDice(watch: (roll: SharedRoll) => void): () => void {
  remoteWatchers.add(watch)
  return () => remoteWatchers.delete(watch)
}

export function showRemoteDice(roll: SharedRoll): void {
  for (const watch of remoteWatchers) watch(roll)
}

export interface NimbleRoll {
  miss: boolean
  crit: boolean
  total: number
  bonus: number
  dice: number[]
}

/**
 * Nimble attacks have no to-hit roll: roll damage. A 1 on the first die misses;
 * the first die's maximum rolls again (and keeps exploding) as a crit.
 * `bonusDice` are extra dice (e.g. Fury) added on a hit. Each `disadvantage`
 * (Rushed Attacks) rolls one more die and drops the highest; the first die
 * left is the one that can miss or crit.
 */
export function rollNimble(
  expr: DiceExpr,
  bonusDice: { count: number; sides: number } | null = null,
  rng: Rng = Math.random,
  disadvantage = 0,
  rules: NimbleRollRules = {},
): NimbleRoll {
  return quietly(() => nimbleRoll(expr, bonusDice, rng, disadvantage, rules))
}

/** A spell's own crit rules (Shatter against a Hampered target). */
export interface NimbleRollRules {
  /** Any kept die at its max counts as a crit, so the Primary Die rolls again and explodes. */
  critOnAnyMax?: boolean
  /**
   * Points to raise dice by ("Increase the result of ANY die by 1" per upcast tier): with
   * `critOnAnyMax` they first lift one die to its max for the crit; the rest add damage.
   */
  bump?: number
  /** Minions and flunkies never crit (GM's Guide p. 24): the max is just its value. */
  noCrit?: boolean
}

function nimbleRoll(
  expr: DiceExpr,
  bonusDice: { count: number; sides: number } | null,
  rng: Rng,
  disadvantage: number,
  rules: NimbleRollRules,
): NimbleRoll {
  const extra = Math.abs(Math.floor(disadvantage))
  const rolled = Array.from({ length: Math.max(1, expr.count) + extra }, () =>
    rollDie(expr.sides, rng),
  )
  const dropped = new Set(
    rolled
      .map((value, index) => ({ value, index }))
      .sort((a, b) => (disadvantage > 0 ? b.value - a.value : a.value - b.value))
      .slice(0, extra)
      .map((d) => d.index),
  )
  const keptAt = rolled.map((_, i) => i).filter((i) => !dropped.has(i))
  let bump = Math.max(0, Math.floor(rules.bump ?? 0))
  // A bump can lift the die nearest its max to it, if that's in reach and not a miss already.
  if (rules.critOnAnyMax && bump && rolled[keptAt[0]!] !== 1) {
    const reach = keptAt
      .filter((i) => rolled[i]! < expr.sides && expr.sides - rolled[i]! <= bump)
      .sort((a, b) => rolled[b]! - rolled[a]!)[0]
    if (reach !== undefined && !keptAt.some((i) => rolled[i] === expr.sides)) {
      bump -= expr.sides - rolled[reach]!
      rolled[reach] = expr.sides
    }
  }
  const kept = keptAt.map((i) => rolled[i]!)
  const first = kept[0] ?? 1
  const shown = {
    sides: expr.sides,
    dice: rolled,
    dropped: [...dropped],
    primary: rolled.findIndex((_, i) => !dropped.has(i)),
    mod: expr.mod,
    odds: disadvantage,
  }
  if (first === 1) {
    showDice({ ...shown, explosions: [], extra: null, total: 0, miss: true, crit: false })
    return { miss: true, crit: false, total: 0, bonus: 0, dice: kept }
  }
  let total = kept.reduce((sum, v) => sum + v, 0) + bump
  const explosions: number[] = []
  // "When you crit, roll the Primary Die again" (Core p. 13), however the crit came.
  const anyMax = !!rules.critOnAnyMax && kept.some((v) => v === expr.sides)
  let last = anyMax ? expr.sides : first
  while (last === expr.sides && !rules.noCrit) {
    last = rollDie(expr.sides, rng)
    explosions.push(last)
    total += last
  }
  const crit = explosions.length > 0
  const bonusRolls = bonusDice
    ? Array.from({ length: bonusDice.count }, () => rollDie(bonusDice.sides, rng))
    : []
  const bonus = bonusRolls.reduce((sum, v) => sum + v, 0)
  const sum = total + expr.mod + bonus
  showDice({
    ...shown,
    explosions,
    extra: bonusDice ? { sides: bonusDice.sides, dice: bonusRolls } : null,
    total: sum,
    miss: false,
    crit,
  })
  return { miss: false, crit, total: sum, bonus, dice: kept }
}
