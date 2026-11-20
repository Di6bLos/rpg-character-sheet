import { describe, expect, it } from 'vitest'
import { activeKey, browseBounds, roundLength, slotAt } from '../utils/initiativeStrip'

// Four combatants: each round is [cap, t0, t1, t2, t3, end], 6 slots; round 1 starts at 6.
const n = 4

describe('initiative strip', () => {
  it('puts turn 1 of round 1 after its cap, with ghosts before', () => {
    const key = activeKey(1, 0, n)
    expect(key).toBe(7)
    expect(slotAt(key, n, 1, 0)).toEqual({ kind: 'token', round: 1, index: 0, done: false })
    expect(slotAt(key - 1, n, 1, 0)).toEqual({ kind: 'cap', round: 1 })
    expect(slotAt(key - 2, n, 1, 0)).toEqual({ kind: 'ghost' })
    expect(slotAt(-3, n, 1, 0)).toEqual({ kind: 'ghost' })
  })

  it('ends the current round with its end cap, then only ghosts', () => {
    const key = activeKey(1, 3, n)
    expect(slotAt(key + 1, n, 1, 3)).toEqual({ kind: 'end', round: 1 })
    expect(slotAt(key + 2, n, 1, 3)).toEqual({ kind: 'ghost' })
    expect(slotAt(key + 3, n, 1, 3)).toEqual({ kind: 'ghost' })
  })

  it('keeps earlier rounds on the left, done', () => {
    const key = activeKey(2, 0, n)
    expect(key - activeKey(1, 3, n)).toBe(3)
    expect(slotAt(key - 1, n, 2, 0)).toEqual({ kind: 'cap', round: 2 })
    expect(slotAt(key - 2, n, 2, 0)).toEqual({ kind: 'end', round: 1 })
    expect(slotAt(key - 3, n, 2, 0)).toEqual({ kind: 'token', round: 1, index: 3, done: true })
  })

  it('marks tokens before the acting one this round as done', () => {
    const at = (index: number, active: number) => slotAt(activeKey(3, index, n), n, 3, active)
    expect(at(0, 2)).toMatchObject({ done: true })
    expect(at(1, 2)).toMatchObject({ done: true })
    expect(at(2, 2)).toMatchObject({ done: false })
    expect(at(3, 2)).toMatchObject({ done: false })
    // No one acting yet: nothing this round is done.
    expect(at(0, -1)).toMatchObject({ done: false })
  })

  it('limits browsing to round 1 cap and the current round end', () => {
    const cursor = activeKey(2, 1, n)
    const { min, max } = browseBounds(n, 2, cursor)
    expect(slotAt(cursor + min, n, 2, 1)).toEqual({ kind: 'cap', round: 1 })
    expect(slotAt(cursor + max, n, 2, 1)).toEqual({ kind: 'end', round: 2 })
  })

  it('handles a single combatant', () => {
    expect(roundLength(1)).toBe(3)
    const key = activeKey(2, 0, 1)
    expect(slotAt(key, 1, 2, 0)).toEqual({ kind: 'token', round: 2, index: 0, done: false })
    expect(slotAt(key - 2, 1, 2, 0)).toEqual({ kind: 'end', round: 1 })
    expect(slotAt(key - 3, 1, 2, 0)).toEqual({ kind: 'token', round: 1, index: 0, done: true })
  })
})
