import { describe, expect, it } from 'vitest'
import {
  armorDice,
  armorHit,
  armorRule,
  effectiveArmor,
  ignoresArmor,
  lighterArmor,
  throughArmor,
} from '../utils/nimbleTargetArmor'

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

  it('lets crits, vulnerability and attacks that ignore armor deal full damage', () => {
    expect(armorHit(12, 3, { armor: 'heavy' }, true)).toEqual({
      damage: 12,
      note: ' (crit: Heavy armor ignored)',
    })
    expect(armorHit(9, 4, { armor: 'medium', ignore: 'Vital Shot' }).damage).toBe(9)
    expect(armorHit(9, 4, { armor: 'heavy', vulnerable: true }).damage).toBe(9)
    expect(armorHit(10, 3, { armor: 'medium' })).toEqual({
      damage: 7,
      note: ' through Medium armor; 10 if unarmored',
    })
  })

  it('doubles damage against a vulnerable unarmored target', () => {
    expect(armorHit(6, 2, { armor: 'none', vulnerable: true }).damage).toBe(12)
  })

  it('reads "ignoring armor" in all its wordings', () => {
    expect(ignoresArmor('1d4+INT psychic ignoring armor')).toBe(true)
    expect(ignoresArmor('Attack your Hampered quarry, ignoring their armor')).toBe(true)
    expect(ignoresArmor('Reach 1')).toBe(false)
  })

  it('treats Heavy as Medium and Medium as none for the Manablade', () => {
    expect(lighterArmor('heavy')).toBe('medium')
    expect(effectiveArmor({ armor: 'medium', lighter: true }).armor).toBe('none')
  })

  it('shows a damage expression as it lands on the target', () => {
    expect(armorDice('1d6+2 +2d4', { armor: 'none' })).toBe('')
    expect(armorDice('1d6+2 +2d4', { armor: 'medium' })).toBe('1d6+2d4')
    expect(armorDice('1d6+2 +2d4', { armor: 'heavy' })).toBe('½(1d6+2d4)')
    expect(armorDice('2×(2d4+3)', { armor: 'heavy', lighter: true })).toBe('2×(2d4)')
    expect(armorDice('1d8+3', { armor: 'medium' }, 5)).toBe('1d8+5')
    expect(armorDice('1d8', { armor: 'heavy', ignore: 'ignores armor' })).toBe('')
  })

  it('tells players who roll their own dice what counts', () => {
    expect(armorRule({ armor: 'none' })).toBe('')
    expect(armorRule({ armor: 'medium' })).toMatch(/count only the dice/)
    expect(armorRule({ armor: 'heavy', ignore: 'Sunder Armor' })).toBe(
      ' Heavy armor ignored (Sunder Armor).',
    )
  })
})
