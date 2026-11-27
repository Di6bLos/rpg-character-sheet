import { describe, expect, it } from 'vitest'
import { battleFeatures, conditionNames } from '~/utils/battleFeatures'
import { PF2E_CONDITION_DEFS } from '~/utils/pf2ePlay'

describe('battleFeatures', () => {
  it('gives Nimble its features, 5e the hero editor and PF2e its points', () => {
    const { gmPoints, ...nimble } = battleFeatures('nimble')
    expect(Object.values(nimble).every(Boolean)).toBe(true)
    expect(gmPoints).toBe(false)
    const { heroEditor, ...dnd5e } = battleFeatures('dnd5e')
    expect(heroEditor).toBe(true)
    expect(Object.values(dnd5e).some(Boolean)).toBe(false)
    const { gmPoints: pf2ePoints, ...pf2e } = battleFeatures('pf2e')
    expect(Object.values(pf2e).some(Boolean)).toBe(false)
    expect(pf2ePoints).toBe(true)
  })

  it('lists each system its own conditions', () => {
    expect(conditionNames('dnd5e')).toHaveLength(15)
    expect(conditionNames('dnd5e')).toContain('Exhaustion')
    expect(conditionNames('pf2e')).toContain('Off-guard')
    // The sheet's own condition list, so a GM's pick is one the sheet shows and applies.
    expect(conditionNames('pf2e')).toEqual(PF2E_CONDITION_DEFS.map((d) => d.name))
    // Dying, Wounded and Doomed are values on the sheet, not chips.
    for (const value of ['Dying', 'Wounded', 'Doomed'])
      expect(conditionNames('pf2e')).not.toContain(value)
    expect(conditionNames('nimble')).not.toContain('Helped')
    expect(conditionNames('nimble')).not.toContain('Bloodied')
  })
})
