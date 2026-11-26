import { describe, expect, it } from 'vitest'
import { PF2E_EFFECTS } from '../data/pf2e/effects'
import type { Dnd5eSheet, NimbleSheet } from '../types/sheets'
import {
  applyConditionChange,
  applyConditionChangeFor,
  freshConditionChanges,
  lastPerCondition,
} from '../utils/heroConditionChange'
import { CONDITION_ENDS } from '../utils/nimbleConditions'
import { toggleEffect } from '../utils/pf2eEffects'
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

  it('a GM setting a PF2e hero Unconscious ends Rage, as the sheet does', () => {
    const sheet = {
      ...defaultSheet('pf2e'),
      feats: [{ type: 'Class', level: '1', action: '', name: 'Rage', desc: '' }],
    }
    toggleEffect(sheet, 'Rage', 1)
    expect(sheet.effects?.on).toEqual(['Rage'])
    const line = applyConditionChangeFor('pf2e', sheet, {
      id: 'a',
      condition: 'Unconscious',
      add: true,
    })
    expect(line).toMatch(/^GM: you are Unconscious\. Rage ends/)
    expect(sheet.effects?.on).toEqual([])
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

describe('GM persistent damage on a PF2e hero (Player Core p. 445)', () => {
  const mira = () => ({ ...defaultSheet('pf2e'), hp: 20, hpMax: 20 })
  const row = (id: string, type: string, dice: string | null) => ({
    id,
    condition: 'Persistent Damage',
    add: dice !== null,
    persistent_type: type,
    persistent_dice: dice,
  })

  it('adds persistent damage of a type, the GM’s amount replacing the old one', () => {
    const sheet = mira()
    expect(applyConditionChangeFor('pf2e', sheet, row('a', 'fire', '1d6'))).toMatch(
      /^GM: 1d6 persistent fire damage/,
    )
    expect(applyConditionChangeFor('pf2e', sheet, row('b', 'fire', '2'))).toMatch(
      /^GM: 2 persistent/,
    )
    expect(sheet.persistent).toEqual([{ dice: '2', type: 'fire' }])
    expect(sheet.conditions).toEqual([])
    // Already as the GM set it (the saved sheet had it): nothing to say.
    expect(applyConditionChangeFor('pf2e', sheet, row('c', 'fire', '2'))).toBe('')
  })

  it('ends it with no dice, and keeps one change per type', () => {
    const sheet = mira()
    applyConditionChangeFor('pf2e', sheet, row('a', 'fire', '1d6'))
    applyConditionChangeFor('pf2e', sheet, row('b', 'bleed', '1d4'))
    expect(applyConditionChangeFor('pf2e', sheet, row('c', 'fire', null))).toBe(
      'GM: Persistent fire damage ends.',
    )
    expect(sheet.persistent).toEqual([{ dice: '1d4', type: 'bleed' }])
    const rows = [row('d', 'fire', '1d6'), row('e', 'bleed', null), row('f', 'fire', '2')]
    expect(lastPerCondition(rows).map((r) => r.id)).toEqual(['e', 'f'])
  })
})

describe('GM unconscious ends Rage on a closed PF2e sheet (gm_set_hero_condition)', () => {
  it('Rage is the one effect that ends when unconscious, as the SQL names it', () => {
    expect(PF2E_EFFECTS.filter((e) => e.endsWhenUnconscious).map((e) => e.name)).toEqual(['Rage'])
  })
})
