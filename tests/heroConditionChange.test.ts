import { describe, expect, it } from 'vitest'
import type { NimbleSheet } from '../types/sheets'
import {
  applyConditionChange,
  freshConditionChanges,
  lastPerCondition,
} from '../utils/heroConditionChange'
import { CONDITION_ENDS } from '../utils/nimbleConditions'
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
