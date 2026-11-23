import { describe, expect, it } from 'vitest'
import type { NimbleSheet } from '../types/sheets'
import { parseDice, rollNimble } from '../utils/dice'
import {
  addCondition,
  conditionMods,
  oddsReasons,
  removeCondition,
  spendHelp,
  heroArmor,
  statusFromSpell,
  statusStats,
  wardedDamage,
} from '../utils/nimbleConditions'
import {
  actionsLeft,
  armorNow,
  turnActions,
  endEncounter,
  endTurn,
  isDead,
  newRound,
  resurrect,
  startTurn,
} from '../utils/nimblePlay'
import { defaultSheet } from '../utils/sheetDefaults'

function hero(patch: Partial<NimbleSheet> = {}): NimbleSheet {
  return { ...defaultSheet('nimble'), hp: 20, hpMax: 20, speed: '6', ...patch }
}

describe('conditions', () => {
  it('credits attack disadvantage, speed and incapacitation to the condition', () => {
    const sheet = hero()
    addCondition(sheet, 'Blinded')
    addCondition(sheet, 'Prone')
    addCondition(sheet, 'Slowed')
    expect(conditionMods(sheet)).toMatchObject({
      disadvantage: 2,
      speed: 3,
      incapacitated: '',
    })
    expect(conditionMods(sheet).notes).toEqual(['+2 disadvantage: Blinded, Prone'])
    expect(conditionMods(sheet).speedNote).toMatch(/Slowed: halved · Prone/)
    addCondition(sheet, 'Invisible')
    addCondition(sheet, 'Grappled')
    addCondition(sheet, 'Stunned')
    expect(conditionMods(sheet)).toMatchObject({
      disadvantage: 1,
      speed: 0,
      incapacitated: 'Stunned',
    })
  })

  it('adds Taunted and Frightened disadvantage only when the player says they apply', () => {
    const sheet = hero()
    addCondition(sheet, 'Taunted')
    addCondition(sheet, 'Blinded')
    expect(conditionMods(sheet)).toMatchObject({
      disadvantage: 1,
      hints: ['Taunted: disadvantage except vs. your taunter'],
    })
    expect(conditionMods(sheet, ['Taunted', 'Frightened'])).toMatchObject({
      disadvantage: 2,
      notes: ['+2 disadvantage: Blinded, Taunted'],
      hints: [],
    })
    expect(oddsReasons(2, conditionMods(sheet))).toBe('Rushed (2), Blinded')
    expect(oddsReasons(1, conditionMods(sheet, ['Taunted']))).toBe('Rushed, Blinded, Taunted')
  })

  it('gives advantage while Helped, spent by the next attack, ending after your next turn', () => {
    const sheet = hero()
    addCondition(sheet, 'Helped')
    expect(conditionMods(sheet)).toMatchObject({
      disadvantage: -1,
      reasons: ['Helped (advantage)'],
    })
    expect(sheet.conditionEnds.Helped).toBe('turnEnd')
    expect(spendHelp(sheet)).toBe(' Help used.')
    expect(sheet.conditions).not.toContain('Helped')
    expect(spendHelp(sheet)).toBe('')
  })

  it('takes an action for Dazed and clears conditions when they end', () => {
    const sheet = hero()
    addCondition(sheet, 'Dazed')
    addCondition(sheet, 'Slowed')
    addCondition(sheet, 'Smoldering')
    addCondition(sheet, 'Prone')
    expect(startTurn(sheet, 1)).toMatch(/Dazed: you lose 1 action\..*No longer Dazed/)
    expect(actionsLeft(sheet)).toBe(2)
    expect(endTurn(sheet, 1)).toMatch(/No longer Slowed/)
    expect(sheet.conditions).toEqual(['Smoldering', 'Prone'])
    sheet.conditionEnds.Prone = 'round'
    expect(newRound(sheet, 1)).toMatch(/No longer Prone/)
    endEncounter(sheet, 1)
    expect(sheet.conditions).toEqual([])
    removeCondition(sheet, 'Smoldering')
    expect(sheet.conditionEnds).toEqual({})
  })

  it('keeps a turn-end condition set during your turn until the end of your next turn', () => {
    const sheet = hero()
    startTurn(sheet, 1)
    addCondition(sheet, 'Slowed')
    expect(endTurn(sheet, 1)).not.toMatch(/No longer Slowed/)
    expect(sheet.conditions).toContain('Slowed')
    startTurn(sheet, 1)
    expect(endTurn(sheet, 1)).toMatch(/No longer Slowed/)
  })

  it('rolls advantage by dropping the lowest die', () => {
    const faces = [1, 5]
    let i = 0
    const roll = rollNimble(parseDice('1d6')!, null, () => ((faces[i++] ?? 1) - 1) / 6 + 0.001, -1)
    expect(roll).toMatchObject({ miss: false, total: 5 })
  })

  it('resurrects a dead hero one Wound short of death', () => {
    const sheet = hero({ woundsMax: 6, wounds: 6, hp: 0, dying: true })
    expect(isDead(sheet)).toBe(true)
    expect(resurrect(sheet)).toMatch(/Resurrected: back at 1 HP with 5 Wounds/)
    expect(sheet).toMatchObject({ hp: 1, wounds: 5, dying: false })
    expect(resurrect(sheet)).toBe('')
  })
})

describe('spell statuses that change the hero’s numbers', () => {
  it('Electrocharge: +5 armor, +1 max action, double speed, advantage on DEX saves', () => {
    const sheet = hero({ ac: 3, conditions: ['Electrocharge'] })
    expect(armorNow(sheet, 5)).toEqual({ value: 8, notes: ['Electrocharge +5'] })
    expect(turnActions(sheet)).toBe(4)
    expect(conditionMods(sheet)).toMatchObject({ speed: 12, speedNote: '2× (Electrocharge)' })
    expect(statusStats(sheet).saveAdvantage).toEqual(['DEX'])
    addCondition(sheet, 'Slowed')
    expect(conditionMods(sheet).speed).toBe(6)
  })

  it('Dragonform adds LVL Armor and fly 12; Flying by hand flies 12 (Fly), from boots at your speed', () => {
    const dragon = hero({
      ac: 2,
      conditions: ['Dragonform'],
      effects: [{ condition: 'Dragonform', source: 'Dragonform', ends: ['rest'] }],
    })
    expect(armorNow(dragon, 17).value).toBe(19)
    expect(conditionMods(dragon).speedNote).toBe('Fly 12')
    expect(conditionMods(hero({ conditions: ['Flying'] })).speedNote).toBe('Fly 12')
    const boots = hero({
      conditions: ['Flying'],
      effects: [{ condition: 'Flying', source: 'Propulsive Boots', ends: ['turnEnd'] }],
    })
    expect(conditionMods(boots).speedNote).toBe('Fly at your speed')
    expect(armorNow(hero({ ac: 2 }), 5)).toEqual({ value: 2, notes: [] })
  })

  it('names the status a touch spell gives, for the caster to turn on', () => {
    expect(statusFromSpell('Electrocharge')).toBe('Electrocharge')
    expect(statusFromSpell('Fly')).toBe('Flying')
    expect(statusFromSpell('Ignite')).toBe('')
  })
})

describe('True Strike, Condemn, Warding Bond and armor others see', () => {
  it('True Strike and a Condemned target give advantage; an attack spends True Strike', () => {
    const sheet = hero({ conditions: ['True Strike'] })
    expect(conditionMods(sheet, [], { condemned: 2 })).toMatchObject({
      disadvantage: -3,
      reasons: ['True Strike (advantage)', 'Condemned (2× advantage)'],
    })
    expect(
      conditionMods(hero(), [], { covered: true, disadvantage: 2, advantage: 1 }),
    ).toMatchObject({
      disadvantage: 2,
      reasons: ['Covered', 'Disadvantage (2)', 'Advantage'],
    })
    expect(spendHelp(sheet)).toBe(' True Strike used.')
    expect(sheet.conditions).toEqual([])
  })

  it('halves damage while Warded, and shows status armor to the party', () => {
    expect(wardedDamage(hero({ conditions: ['Warded'] }), 9)).toEqual({
      taken: 4,
      note: ' Warded: you take 4, your warder 5.',
    })
    expect(wardedDamage(hero(), 9)).toEqual({ taken: 9, note: '' })
    expect(heroArmor(2, ['Electrocharge'], 5)).toBe(7)
    expect(heroArmor(2, ['Dragonform'], 12)).toBe(14)
    expect(heroArmor(undefined, ['Electrocharge'], 5)).toBeUndefined()
  })
})
