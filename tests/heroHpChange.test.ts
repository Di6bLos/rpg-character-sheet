import { describe, expect, it } from 'vitest'
import type { NimbleSheet } from '../types/sheets'
import { applyHpChange, freshChanges } from '../utils/heroHpChange'
import { defaultSheet } from '../utils/sheetDefaults'

function hero(patch: Partial<NimbleSheet> = {}): NimbleSheet {
  return { ...defaultSheet('nimble'), hp: 20, hpMax: 20, ...patch }
}

describe('GM hero HP changes', () => {
  it('applies damage through takeDamage (temp HP first)', () => {
    const sheet = hero({ tempHp: 3 })
    const message = applyHpChange(sheet, 3, { id: 'a', amount: -5, crit: false })
    expect(sheet.tempHp).toBe(0)
    expect(sheet.hp).toBe(18)
    expect(message).toBe('GM: took 5 damage: 18/20 HP.')
  })

  it('drops to 0 HP and marks the crit', () => {
    const sheet = hero({ hp: 4 })
    const message = applyHpChange(sheet, 3, { id: 'a', amount: -9, crit: true })
    expect(sheet.hp).toBe(0)
    expect(message).toMatch(/^GM: took 9 damage \(crit\): 0\/20 HP\./)
  })

  it('heals up to max', () => {
    const sheet = hero({ hp: 15 })
    expect(applyHpChange(sheet, 3, { id: 'a', amount: 8, crit: false })).toBe(
      'GM: healed 8: 20/20 HP.',
    )
    expect(sheet.hp).toBe(20)
  })

  it('applies each row once, oldest first', () => {
    const taken = new Set<string>()
    const rows = [
      { id: 'b', amount: -1, crit: false, created_at: '2026-01-02' },
      { id: 'a', amount: -2, crit: false, created_at: '2026-01-01' },
    ]
    expect(freshChanges(rows, taken).map((r) => r.id)).toEqual(['a', 'b'])
    expect(
      freshChanges([...rows, { id: 'c', amount: 1, crit: false }], taken).map((r) => r.id),
    ).toEqual(['c'])
  })
})
