import { describe, expect, it } from 'vitest'
import { battleFeatures, conditionNames } from '~/utils/battleFeatures'

describe('battleFeatures', () => {
  it('gives Nimble everything and other systems none of it', () => {
    expect(Object.values(battleFeatures('nimble')).every(Boolean)).toBe(true)
    expect(Object.values(battleFeatures('dnd5e')).some(Boolean)).toBe(false)
    expect(Object.values(battleFeatures('pf2e')).some(Boolean)).toBe(false)
  })

  it('lists each system its own conditions', () => {
    expect(conditionNames('dnd5e')).toHaveLength(15)
    expect(conditionNames('dnd5e')).toContain('Exhaustion')
    expect(conditionNames('pf2e')).toContain('Off-guard')
    expect(conditionNames('nimble')).not.toContain('Helped')
    expect(conditionNames('nimble')).not.toContain('Bloodied')
  })
})
