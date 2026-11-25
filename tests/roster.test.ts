import { describe, expect, it } from 'vitest'
import type { RosterEntry } from '../types'
import {
  authorLabel,
  conditionLabels,
  heroDead,
  pf2eDeathAt,
  heroStable,
  deathSavesLine,
  downStatus,
  dyingLine,
  heroDown,
  hpClass,
  hpTone,
} from '../utils/roster'

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
    expect(deathSavesLine(s)).toBe('1 saved · 2 failed')
    expect(deathSavesLine(s, true)).toBe('Death saves 1 success, 2 failures')
    expect(dyingLine(s)).toBe('1 saved · 2 failed')
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

describe('heroDead', () => {
  it('reads a 5e hero with three failed death saves as Dead', () => {
    const s = { deathSaves: { successes: 1, failures: 3 } }
    expect(heroDead(s)).toBe(true)
    expect(downStatus(s)).toBe('Dead')
    expect(deathSavesLine(s)).toBe('')
    expect(dyingLine(s, true)).toBe('')
  })

  it('reads a PF2e hero at Dying 4 as Dead', () => {
    const s = { dying: 4 }
    expect(heroDead(s)).toBe(true)
    expect(downStatus(s)).toBe('Dead')
    expect(dyingLine(s)).toBe('')
  })

  it('reads a doomed PF2e hero as Dead at the lower Dying value, as the sheet engine does', () => {
    expect(pf2eDeathAt({ doomed: 1 })).toBe(3)
    expect(heroDead({ dying: 3, doomed: 1 })).toBe(true)
    expect(downStatus({ dying: 3, doomed: 1 })).toBe('Dead')
    expect(heroDead({ dying: 2, doomed: 1 })).toBe(false)
    expect(pf2eDeathAt({})).toBe(4)
  })

  it('gives a PF2e hero with Diehard one more Dying step, from the summary or a live sheet', () => {
    expect(pf2eDeathAt({ featNames: ['Diehard'] })).toBe(5)
    expect(heroDead({ dying: 4, featNames: ['Diehard'] })).toBe(false)
    expect(heroDead({ dying: 4, featNames: ['Diehard'], doomed: 1 })).toBe(true)
    const live = { dying: 4, feats: [{ name: 'Diehard' }] } as Parameters<typeof heroDead>[0]
    expect(heroDead(live)).toBe(false)
  })

  it('not below Dying 4 or three failures', () => {
    expect(heroDead({ deathSaves: { successes: 0, failures: 2 } })).toBe(false)
    expect(heroDead({ dying: 3 })).toBe(false)
    expect(heroDead({ dying: 1, deathSaves: { successes: 0, failures: 3 } })).toBe(false)
    expect(heroDead(null)).toBe(false)
  })
})

describe('heroStable', () => {
  it('reads a 5e hero with three successes as Stable', () => {
    const s = { deathSaves: { successes: 3, failures: 1 } }
    expect(heroStable(s)).toBe(true)
    expect(downStatus(s)).toBe('Down')
    expect(deathSavesLine(s)).toBe('Stable')
    expect(dyingLine(s, true)).toBe('Stable')
  })

  it('not while rolling, dead or PF2e dying', () => {
    expect(heroStable({ deathSaves: { successes: 2, failures: 0 } })).toBe(false)
    expect(heroStable({ deathSaves: { successes: 3, failures: 3 } })).toBe(false)
    expect(heroStable({ dying: 2, deathSaves: { successes: 3, failures: 0 } })).toBe(false)
  })
})

describe('hpTone / hpClass', () => {
  it('is teal above half, amber at half or less, red at 0', () => {
    expect(hpTone(30, 30)).toBe('')
    expect(hpTone(16, 30)).toBe('')
    expect(hpTone(15, 30)).toBe('accent')
    expect(hpTone(12, 30)).toBe('accent')
    expect(hpTone(1, 30)).toBe('accent')
    expect(hpTone(0, 30)).toBe('danger')
    expect(hpTone(-3, 30)).toBe('danger')
  })

  it('has no band without a max, and takes a fraction of 1', () => {
    expect(hpTone(0, 0)).toBe('')
    expect(hpTone(0.4, 1)).toBe('accent')
    expect(hpTone(0.6, 1)).toBe('')
  })

  it('names the band classes', () => {
    expect(hpClass(30, 30)).toBe('')
    expect(hpClass(10, 30)).toBe('hp--accent')
    expect(hpClass(0, 30)).toBe('hp--danger')
  })
})

describe('conditionLabels', () => {
  it('gives PF2e valued conditions their value, 1 when the sheet has none', () => {
    expect(conditionLabels(['Frightened', 'Prone', 'Sickened'], 'pf2e', { Frightened: 2 })).toEqual(
      ['Frightened 2', 'Prone', 'Sickened 1'],
    )
  })

  it('leaves other systems by name', () => {
    expect(conditionLabels(['Frightened'], 'nimble', { Frightened: 2 })).toEqual(['Frightened'])
    expect(conditionLabels(['Frightened'], 'dnd5e')).toEqual(['Frightened'])
  })
})
