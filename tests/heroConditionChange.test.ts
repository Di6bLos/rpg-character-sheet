import { describe, expect, it } from 'vitest'
import type { Dnd5eSheet, NimbleSheet } from '../types/sheets'
import {
  applyConditionChange,
  applyConditionChangeFor,
  freshConditionChanges,
  lastPerCondition,
} from '../utils/heroConditionChange'
import { CONDITION_ENDS } from '../utils/nimbleConditions'
import { conditionValue } from '../utils/pf2ePlay'
import { defaultSheet } from '../utils/sheetDefaults'

function hero(patch: Partial<NimbleSheet> = {}): NimbleSheet {
  return { ...defaultSheet('nimble'), conditions: [], ...patch }
}

describe('GM hero condition changes', () => {
  it('adds a condition with its usual end', () => {
    const sheet = hero()
    const timed = Object.keys(CONDITION_ENDS)[0]!
    expect(applyConditionChange(sheet, { id: 'a', condition: timed, add: true })).toBe(
      `GM: you are ${timed}.`,
    )
    expect(sheet.conditions).toEqual([timed])
    expect(sheet.conditionEnds?.[timed]).toBe(CONDITION_ENDS[timed])
  })

  it('removes a condition and its end', () => {
    const sheet = hero()
    applyConditionChange(sheet, { id: 'a', condition: 'Prone', add: true })
    expect(applyConditionChange(sheet, { id: 'b', condition: 'Prone', add: false })).toBe(
      'GM: no longer Prone.',
    )
    expect(sheet.conditions).toEqual([])
    expect(sheet.conditionEnds?.Prone).toBeUndefined()
  })

  it('removing a condition ends the status behind it, as the sheet toggle does', () => {
    const sheet = hero({
      conditions: ['Invisible'],
      effects: [{ condition: 'Invisible', source: 'Shadow Step', ends: ['attack'] }],
    })
    applyConditionChange(sheet, { id: 'a', condition: 'Invisible', add: false })
    expect(sheet.conditions).toEqual([])
    expect(sheet.effects).toEqual([])
  })

  it('says nothing when the sheet already matches', () => {
    const sheet = hero({ conditions: ['Prone'] })
    expect(applyConditionChange(sheet, { id: 'a', condition: 'Prone', add: true })).toBe('')
    expect(applyConditionChange(sheet, { id: 'b', condition: 'Slowed', add: false })).toBe('')
    expect(sheet.conditions).toEqual(['Prone'])
  })

  it('takes each row once, oldest first', () => {
    const taken = new Set<string>()
    const rows = [
      { id: 'b', condition: 'Prone', add: false, created_at: '2026-11-20T10:00:02Z' },
      { id: 'a', condition: 'Prone', add: true, created_at: '2026-11-20T10:00:01Z' },
    ]
    expect(freshConditionChanges(rows, taken).map((r) => r.id)).toEqual(['a', 'b'])
    expect(freshConditionChanges(rows, taken)).toEqual([])
  })
  it('keeps only the last change per condition, in order', () => {
    const rows = [
      { id: 'a', condition: 'Prone', add: true },
      { id: 'b', condition: 'Dazed', add: true },
      { id: 'c', condition: 'Prone', add: false },
    ]
    expect(lastPerCondition(rows).map((r) => r.id)).toEqual(['b', 'c'])
  })
})

describe('GM hero condition changes, D&D 5e and PF2e', () => {
  it('adds and removes a 5e condition plainly, with no end', () => {
    const sheet = defaultSheet('dnd5e')
    expect(
      applyConditionChangeFor('dnd5e', sheet, { id: 'a', condition: 'Prone', add: true }),
    ).toBe('GM: you are Prone.')
    expect(sheet.conditions).toEqual(['Prone'])
    expect('conditionEnds' in sheet).toBe(false)
    expect(
      applyConditionChangeFor('dnd5e', sheet, { id: 'b', condition: 'Prone', add: false }),
    ).toBe('GM: no longer Prone.')
    expect(sheet.conditions).toEqual([])
  })

  it('says nothing for a PF2e sheet that already matches', () => {
    const sheet = { ...defaultSheet('pf2e'), conditions: ['Off-guard'] }
    expect(
      applyConditionChangeFor('pf2e', sheet, { id: 'a', condition: 'Off-guard', add: true }),
    ).toBe('')
    expect(
      applyConditionChangeFor('pf2e', sheet, { id: 'b', condition: 'Prone', add: false }),
    ).toBe('')
    expect(sheet.conditions).toEqual(['Off-guard'])
  })

  it('removing a PF2e valued condition drops its value, and a new add starts at 1', () => {
    const sheet = {
      ...defaultSheet('pf2e'),
      conditions: ['Frightened', 'Sickened'],
      conditionValues: { Frightened: 2, Sickened: 1 },
    }
    expect(
      applyConditionChangeFor('pf2e', sheet, { id: 'a', condition: 'Frightened', add: false }),
    ).toBe('GM: no longer Frightened.')
    expect(sheet.conditionValues).toEqual({ Sickened: 1 })
    applyConditionChangeFor('pf2e', sheet, { id: 'b', condition: 'Frightened', add: true })
    expect(conditionValue(sheet, 'Frightened')).toBe(1)
  })

  it('copes with an old 5e sheet that has no conditions list', () => {
    const sheet = { ...defaultSheet('dnd5e') } as Partial<Dnd5eSheet> as Dnd5eSheet
    delete (sheet as Partial<Dnd5eSheet>).conditions
    applyConditionChangeFor('dnd5e', sheet, { id: 'a', condition: 'Prone', add: true })
    expect(sheet.conditions).toEqual(['Prone'])
  })

  it('dispatches 5e and PF2e to the plain add, with no end', () => {
    const dnd = defaultSheet('dnd5e')
    applyConditionChangeFor('dnd5e', dnd, { id: 'a', condition: 'Prone', add: true })
    expect(dnd.conditions).toEqual(['Prone'])
    const pf2e = defaultSheet('pf2e')
    applyConditionChangeFor('pf2e', pf2e, { id: 'a', condition: 'Prone', add: true })
    expect(pf2e.conditions).toEqual(['Prone'])
    expect('conditionEnds' in pf2e).toBe(false)
  })

  it('keeps Nimble on its own rules (the usual end)', () => {
    const sheet = hero()
    const timed = Object.keys(CONDITION_ENDS)[0]!
    applyConditionChangeFor('nimble', sheet, { id: 'a', condition: timed, add: true })
    expect(sheet.conditionEnds?.[timed]).toBe(CONDITION_ENDS[timed])
  })
})
