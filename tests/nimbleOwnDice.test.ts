import { describe, expect, it } from 'vitest'
import type { NimbleSheet } from '../types/sheets'
import { syncCompanions } from '../utils/nimbleBuild'
import { abilityRoll } from '../utils/nimbleEffects'
import {
  actionsLeft,
  newEncounter,
  operateInvention,
  rage,
  rollJudgment,
  spendPower,
  spendResourceMove,
} from '../utils/nimblePlay'
import { addSummon, commandMinions, companionAttack, spiritAct } from '../utils/nimbleSummons'
import { defaultSheet } from '../utils/sheetDefaults'

const never = () => {
  throw new Error('rolled a die in own-dice mode')
}

function own(patch: Partial<NimbleSheet>, ...abilities: [string, string?][]): NimbleSheet {
  return {
    ...defaultSheet('nimble'),
    hp: 20,
    hpMax: 20,
    ownDice: true,
    stats: { STR: 2, DEX: 1, INT: 3, WIL: 2 },
    abilities: abilities.map(([name, desc = '']) => ({ name, src: 'Class', desc })),
    ...patch,
  }
}

describe('own dice: the app checks things off and never rolls', () => {
  it('waits for the Fury Dice you rolled, then keeps them (Boundless Rage still applies)', () => {
    const sheet = own({ classSlug: 'berserker' }, ['Rage'], ['Boundless Rage'])
    expect(rage(sheet, 1, false, never)).toBe('Rage: roll 1d4 and enter what you rolled.')
    expect(sheet.resource.active).toBe(false)
    expect(rage(sheet, 1, false, never, [2])).toMatch(/rolled 6 \(d4\)/)
    expect(sheet.resource.rolls).toEqual([6])
  })

  it('holds the Judgment Dice you enter', () => {
    const sheet = own({ classSlug: 'oathsworn' }, ['Radiant Judgment'])
    expect(rollJudgment(sheet, 1, never)).toMatch(/roll 2d6 and enter what you rolled/)
    rollJudgment(sheet, 1, never, [5, 3])
    expect(sheet.resource.rolls).toEqual([5, 3])
  })

  it('takes your Initiative total for starting actions and leaves the Surge d4s to you', () => {
    const sheet = own({}, [
      'Elemental Surge',
      'Regain WIL mana.\nLevel 10: Your Elemental Surge now regains WIL+1d4 mana.',
    ])
    expect(newEncounter(sheet, 10, never, 14)).toMatch(
      /Initiative 14 \(as you rolled it\): you start with 2 actions.*Add your Elemental Surge d4s/,
    )
    expect(actionsLeft(sheet)).toBe(2)
    expect(sheet.mana.temp).toBe(2)
  })

  it('spends Combat Dice, Mana Dice and gadget uses without rolling', () => {
    const commander = own(
      { classSlug: 'commander' },
      ['Fit for Any Battlefield'],
      ['Heavy Strike', 'Deal extra damage equal to a roll of your Combat Die.'],
    )
    commander.resource.count = 2
    expect(spendResourceMove(commander, 4, 'Heavy Strike', never)).toBe(
      'Heavy Strike: spent 1 Combat Die; roll your d6. 1 left.',
    )
    const artificer = own({ classSlug: 'artificer' }, ['Mana Accumulator'], ['Manabolt Cannon'])
    artificer.resource.count = 3
    expect(operateInvention(artificer, 5, 'Manabolt Cannon', 2, never)).toMatch(
      /spent 2 Mana Dice; roll 2d6 and the d12 yourself\. Mishap if any die rolls 2 or less/,
    )
    expect(spendPower(artificer, 5, 1, never)).toMatch(/roll 1d6 yourself/)
    expect(artificer.resource.count).toBe(0)
    expect(abilityRoll(own({}, ['Stim Pack']), 'Stim Pack', never)).toMatch(
      /Stim Pack: roll 3d8 yourself\. The target gains 1 action; at the end of their turn, DC 16 STR save or Dazed\./,
    )
  })

  it('marks minion commands, spirit heals and Go for the Throat! as used', () => {
    const sheet = own({
      classSlug: 'shadowmancer',
      spells: { ...defaultSheet('nimble').spells, learned: ['Summon Shadows'] },
    })
    addSummon(sheet, 3, 'shadow-minion')
    expect(commandMinions(sheet, 3, never)).toMatch(/roll 1d12 for each of 1 minion yourself/)
    expect(commandMinions(sheet, 3, never)).toBe('You already commanded your minions this turn.')

    const shepherd = own({}, ['Lifebinding Spirit'])
    addSummon(shepherd, 3, 'lifebinding-spirit', { tier: 2 })
    expect(spiritAct(shepherd, 3, 'heal', never)).toBe(
      'Lifebinding Spirit heals: roll 1d8+WIL yourself. 1 heals left.',
    )

    const hunter = own({}, ['Medium Companion'])
    syncCompanions(hunter)
    hunter.resource.count = 1
    expect(companionAttack(hunter, 5, never)).toMatch(/roll 1d8 \+ 15 yourself.*0 charges left\./)
  })
})
