import { describe, expect, it } from 'vitest'
import type { RosterEntry } from '../types'
import { authorLabel, deathSavesLine, downStatus, dyingLine, heroDown } from '../utils/roster'

const entry = (patch: Partial<RosterEntry>): RosterEntry => ({
  user_id: 'u1',
  display_name: 'Carlos',
  handle: 'carlos',
  role: 'player',
  character_id: null,
  character_name: null,
  character_level: null,
  character_system: null,
  portrait_path: null,
  summary: null,
  ...patch,
})

describe('authorLabel', () => {
  it('puts the character first and the player beneath', () => {
    const roster = [entry({ character_id: 'c1', character_name: 'Brakka' })]
    expect(authorLabel(roster, 'u1')).toEqual({ primary: 'Brakka', secondary: 'Carlos' })
  })

  it('uses the player name alone when they have no character', () => {
    expect(authorLabel([entry({})], 'u1')).toEqual({ primary: 'Carlos', secondary: null })
  })

  it('does not repeat a name that matches the character', () => {
    const roster = [entry({ character_name: 'Carlos' })]
    expect(authorLabel(roster, 'u1')).toEqual({ primary: 'Carlos', secondary: null })
  })

  it('falls back to the row profile name, then to "Former member"', () => {
    expect(authorLabel([], 'gone', 'Ana')).toEqual({ primary: 'Ana', secondary: null })
    expect(authorLabel([], 'gone')).toEqual({ primary: 'Former member', secondary: null })
  })
})

describe('heroDown', () => {
  it('is down at 0 HP or less only with a max HP', () => {
    expect(heroDown(0, 12)).toBe(true)
    expect(heroDown(-3, 12)).toBe(true)
    expect(heroDown(1, 12)).toBe(false)
    expect(heroDown(0, 0)).toBe(false)
    expect(heroDown(0, undefined)).toBe(false)
    expect(heroDown(undefined, 12)).toBe(false)
  })
})

describe('downStatus / deathSavesLine / dyingLine', () => {
  it('gives 5e Down with the death saves', () => {
    const s = { deathSaves: { successes: 1, failures: 2 } }
    expect(downStatus(s)).toBe('Down')
    expect(deathSavesLine(s)).toBe('Death saves 1✓ 2✗')
    expect(deathSavesLine(s, true)).toBe('Death saves 1 success, 2 failures')
    expect(dyingLine(s)).toBe('Death saves 1✓ 2✗')
  })

  it('gives PF2e its Dying value and no death saves', () => {
    const s = { dying: 2, deathSaves: { successes: 0, failures: 0 } }
    expect(downStatus(s)).toBe('Dying 2')
    expect(deathSavesLine(s)).toBe('')
    expect(dyingLine(s)).toBe('Dying 2')
    expect(downStatus({ dying: 0 })).toBe('Down')
  })

  it('is just Down without either', () => {
    expect(dyingLine({})).toBe('')
    expect(downStatus(null)).toBe('Down')
    expect(downStatus({ dying: true })).toBe('Down')
  })
})
