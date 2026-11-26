import { describe, expect, it } from 'vitest'
import { hpPreview } from '../utils/hpPreview'

describe('hpPreview', () => {
  it('previews healing up to the dragged value', () => {
    const p = hpPreview({ hp: 10, shown: 14 })
    expect(p).toMatchObject({ delta: 4, damage: 0, result: 14 })
    expect(p.label).toBe('+4 healing → 14 HP')
  })

  it('takes damage from temp HP first', () => {
    const p = hpPreview({ hp: 20, shown: 12, temp: 5 })
    expect(p).toMatchObject({ damage: 8, taken: 8, absorbed: 5, result: 17 })
    expect(p.label).toBe('−8 damage → 17 HP (5 temp absorbed)')
  })

  it("applies Nimble's Warded half and says so", () => {
    const warded = (d: number) => ({
      taken: Math.floor(d / 2),
      note: `Warded: you take ${Math.floor(d / 2)}`,
    })
    const p = hpPreview({ hp: 20, shown: 11, takes: warded })
    expect(p).toMatchObject({ damage: 9, taken: 4, result: 16 })
    expect(p.label).toBe('−9 damage (Warded: you take 4) → 16 HP')
  })

  it("applies PF2e's Shield Block before temp HP", () => {
    const block = (d: number) => {
      const taken = Math.max(0, d - 5)
      return { taken, note: `Shield Block: you take ${taken}` }
    }
    const p = hpPreview({ hp: 30, shown: 21, temp: 2, takes: block })
    expect(p).toMatchObject({ damage: 9, taken: 4, absorbed: 2, result: 28 })
    expect(p.label).toBe('−9 damage (Shield Block: you take 4) → 28 HP (2 temp absorbed)')
  })

  it('never lets a rule take more than the damage', () => {
    const p = hpPreview({ hp: 10, shown: 7, takes: () => ({ taken: 99, note: '' }) })
    expect(p).toMatchObject({ taken: 3, result: 7 })
  })
})
