// The battle board's initiative strip as one row of slots, round after round: each round
// is a "Round N" cap, the turn order, then a "Round end" cap. Rounds already played stay
// on the left; nothing past the current round's end is shown, only empty ghost slots
// (and ghosts before round 1, so turn 1 can still sit in the middle).

export type StripSlot =
  | { kind: 'ghost' }
  | { kind: 'cap'; round: number }
  | { kind: 'end'; round: number }
  | { kind: 'token'; round: number; index: number; done: boolean }

/** Slots one round takes: its cap, every turn, its end cap. */
export function roundLength(n: number): number {
  return n + 2
}

/** The slot of turn `index` in round `round` (round 1 starts at key `roundLength(n)`). */
export function activeKey(round: number, index: number, n: number): number {
  return round * roundLength(n) + 1 + Math.max(0, index)
}

/**
 * What sits at `key` while `round` is being played and `activeIndex` acts (-1: no one
 * yet). A token is `done` when it acted already: any earlier round, or this round before
 * the acting one.
 */
export function slotAt(key: number, n: number, round: number, activeIndex: number): StripSlot {
  const L = roundLength(n)
  const r = Math.floor(key / L)
  if (n < 1 || r < 1 || r > round) return { kind: 'ghost' }
  const pos = key - r * L
  if (pos === 0) return { kind: 'cap', round: r }
  if (pos === L - 1) return { kind: 'end', round: r }
  const index = pos - 1
  return { kind: 'token', round: r, index, done: r < round || index < activeIndex }
}

/** How far browsing may move off `cursor`: back to round 1's cap, on to this round's end. */
export function browseBounds(
  n: number,
  round: number,
  cursor: number,
): { min: number; max: number } {
  const L = roundLength(n)
  return { min: L - cursor, max: round * L + L - 1 - cursor }
}
