import { describe, expect, it } from 'vitest'
import { armorHit, armorRule, lighterArmor, throughArmor } from '../utils/nimbleTargetArmor'

describe('target armor (Core p. 14)', () => {
  it('takes full damage unarmored, the dice through Medium and half the dice through Heavy', () => {
    expect(throughArmor(7, 3, 'none')).toBe(10)
    expect(throughArmor(7, 3, 'medium')).toBe(7)
    expect(throughArmor(7, 3, 'heavy')).toBe(3)
  })

  it('still applies negative modifiers through armor', () => {
    expect(throughArmor(7, -1, 'medium')).toBe(6)
    expect(throughArmor(1, -2, 'heavy')).toBe(0)
  })

  it('lets crits and attacks that ignore armor deal full damage', () => {
    expect(armorHit(12, 3, 'heavy', { crit: true })).toEqual({
      damage: 12,
      note: ' (crit: Heavy armor ignored)',
    })
    expect(armorHit(9, 4, 'medium', { text: '1d4+INT psychic ignoring armor' }).damage).toBe(9)
    expect(armorHit(10, 3, 'medium')).toEqual({
      damage: 7,
      note: ' through Medium armor (10 if unarmored)',
    })
  })

  it('treats Heavy as Medium and Medium as none for the Manablade', () => {
    expect(lighterArmor('heavy')).toBe('medium')
    expect(lighterArmor('medium')).toBe('none')
  })

  it('tells players who roll their own dice what counts', () => {
    expect(armorRule('none')).toBe('')
    expect(armorRule('medium')).toMatch(/count only the dice/)
    expect(armorRule('heavy', 'ignoring armor')).toBe('')
  })
})
