import { describe, expect, it } from 'vitest'
import { battleFeatures, conditionNames } from '~/utils/battleFeatures'

describe('battleFeatures', () => {
  it('gives Nimble its features and other systems none of them but the GM hero controls', () => {
    const { gmPoints, ...nimble } = battleFeatures('nimble')
    expect(Object.values(nimble).every(Boolean)).toBe(true)
    expect(gmPoints).toBe(false)
    const { gmHeroControls: dndControls, ...dnd } = battleFeatures('dnd5e')
    expect(Object.values(dnd).some(Boolean)).toBe(false)
    expect(dndControls).toBe(true)
    const { gmPoints: pf2ePoints, gmHeroControls: pf2eControls, ...pf2e } = battleFeatures('pf2e')
    expect(Object.values(pf2e).some(Boolean)).toBe(false)
    expect(pf2ePoints).toBe(true)
    expect(pf2eControls).toBe(true)
  })

  it('lists each system its own conditions', () => {
    expect(conditionNames('dnd5e')).toHaveLength(15)
    expect(conditionNames('dnd5e')).toContain('Exhaustion')
    expect(conditionNames('pf2e')).toContain('Off-guard')
    // The hero's Dying and Wounded numbers are the truth, so the GM's picker leaves them out.
    expect(conditionNames('pf2e')).not.toContain('Dying')
    expect(conditionNames('pf2e')).not.toContain('Wounded')
    expect(conditionNames('nimble')).not.toContain('Helped')
    expect(conditionNames('nimble')).not.toContain('Bloodied')
  })
})
