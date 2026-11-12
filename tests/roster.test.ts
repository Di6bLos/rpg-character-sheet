import { describe, expect, it } from 'vitest'
import type { RosterEntry } from '../types'
import { authorLabel } from '../utils/roster'

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
