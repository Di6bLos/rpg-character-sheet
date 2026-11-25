import { describe, expect, it } from 'vitest'
import type { Pf2eSheet, Pf2eSpellRef } from '../types/sheets'
import {
  buildPf2eSheet,
  creationFocusSpells,
  spellProblems,
  spellcastingPlan,
} from '../utils/pf2eBuild'
import {
  castCantrip,
  castFocus,
  castFont,
  castPrepared,
  castSpontaneous,
  dailyPreparations,
  focusPoolMax,
  fontSlots,
  heightenedRank,
  refocus,
  setSlotMax,
  slotsFor,
  spellNumbers,
  spontaneousRank,
} from '../utils/pf2eSpells'
import { defaultSheet } from '../utils/sheetDefaults'
import { autoCreation, buildData as data, named } from './helpers/pf2e'

const cls = (name: string) => named(data.classes, name)
const ref = (name: string): Pf2eSpellRef => {
  const s = named(data.spells, name)
  return { id: s.id, name: s.name, rank: s.rank }
}

describe('pf2e spellcasting at creation', () => {
  it('reads tradition, kind and counts from the class (Player Core pp. 297–298)', () => {
    const bard = spellcastingPlan(autoCreation(cls('Bard')), data)
    expect(bard).toMatchObject({ tradition: 'Occult', kind: 'spontaneous', cantrips: 5, rank1: 2 })
    const wizard = spellcastingPlan(autoCreation(cls('Wizard')), data)
    expect(wizard).toMatchObject({ tradition: 'Arcane', kind: 'prepared', cantrips: 5, rank1: 2 })
    expect(spellcastingPlan(autoCreation(cls('Fighter')), data)).toBeNull()
  })

  it('takes a sorcerer’s tradition from the bloodline', () => {
    const c = autoCreation(cls('Sorcerer'))
    const angelic = named(cls('Sorcerer').subclasses, 'Angelic')
    c.subclasses = { 'Sorcerer Bloodline': [angelic.id] }
    expect(spellcastingPlan(c, data)?.tradition).toBe('Divine')
    c.subclasses = {}
    expect(spellProblems(c, data)).toEqual([
      'Choose the option that sets your tradition first (class step)',
    ])
  })

  it('gives a bard the composition cantrip and spell the class grants', () => {
    const names = creationFocusSpells(autoCreation(cls('Bard')), data).map((s) => s.name)
    expect(names).toEqual(expect.arrayContaining(['Courageous Anthem', 'Counter Performance']))
  })

  it('builds a bard: repertoire, slots, a focus pool of 1 (compositions cantrips are free)', () => {
    const s = buildPf2eSheet(autoCreation(cls('Bard')), data)
    expect(s.spellcasting).toMatchObject({ tradition: 'Occult', kind: 'spontaneous', rank: 'T' })
    expect(s.spellcasting?.cantrips).toHaveLength(5)
    expect(s.spellcasting?.spells).toHaveLength(2)
    expect(s.spellcasting?.slots[0]).toMatchObject({ max: 2, used: 0 })
    expect(s.focus).toMatchObject({ max: 1, current: 1 })
  })

  it('builds a cleric: prepared slots filled with the picks, and a divine font', () => {
    const c = autoCreation(cls('Cleric'))
    c.deity = named(data.deities, 'Sarenrae').id
    const s = buildPf2eSheet(c, data)
    expect(s.spellcasting?.font).toEqual({ spell: 'Heal', max: 4, used: 0 })
    const prepared = s.spellcasting?.slots[0]?.prepared
    expect(prepared?.map((p) => p.id)).toEqual(c.spells?.rank1)
  })

  it('lets the player override the focus spells the text suggests', () => {
    const c = autoCreation(cls('Champion'))
    const lay = named(data.spells, 'Lay on Hands')
    c.focus = [lay.id]
    const s = buildPf2eSheet(c, data)
    expect(s.focusSpells?.map((f) => f.name)).toEqual(['Lay on Hands'])
    expect(s.focus.max).toBe(1)
  })

  it('asks for the cantrips, spells and divine font the table lists', () => {
    const c = autoCreation(cls('Cleric'))
    c.spells = { cantrips: [], rank1: [] }
    c.font = undefined
    c.deity = data.deities.find((d) => d.divineFont.length === 2)!.id
    expect(spellProblems(c, data)).toEqual([
      'Choose 5 cantrips',
      'Choose 2 1st-rank spells',
      expect.stringMatching(/^Choose your divine font/),
    ])
  })
})

function caster(kind: 'prepared' | 'spontaneous'): Pf2eSheet {
  const s = defaultSheet('pf2e')
  s.attrs.CHA = 4
  s.spellcasting = {
    tradition: 'Occult',
    kind,
    attr: 'CHA',
    rank: 'T',
    cantrips: [],
    spells: [ref('Fear'), ref('Fireball')],
    slots: slotsFor([2, 0, 1], kind),
    font: { spell: 'Heal', max: 4, used: 0 },
  }
  s.focus = { max: 1, current: 1, note: '' }
  return s
}

describe('pf2e casting (pp. 297–298)', () => {
  it('heightens cantrips to half the level, rounded up', () => {
    expect([1, 2, 3, 9, 20].map(heightenedRank)).toEqual([1, 1, 2, 5, 10])
  })

  it('counts focus points per non-cantrip focus spell, up to 3', () => {
    const many = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id, rank: 1 }))
    expect(focusPoolMax(many, new Set())).toBe(3)
    expect(focusPoolMax(many.slice(0, 2), new Set(['a']))).toBe(1)
  })

  it('has 4, 5 and 6 divine font slots by level (p. 108)', () => {
    expect([1, 5, 15].map(fontSlots)).toEqual([4, 5, 6])
  })

  it('works out spell attack and DC, after stupefied', () => {
    const s = caster('spontaneous')
    expect(spellNumbers(s, s.spellcasting!, 1)).toMatchObject({
      attack: { value: 7 },
      dc: { value: 17 },
    })
    s.conditions = ['Stupefied']
    s.conditionValues = { Stupefied: 2 }
    expect(spellNumbers(s, s.spellcasting!, 1)).toMatchObject({
      attack: { value: 5 },
      dc: { value: 15 },
    })
  })

  it('casts spontaneously from a slot of the rank or higher; only a signature spell heightens', () => {
    const s = caster('spontaneous')
    const fear = { ...ref('Fear'), signature: true }
    expect(castSpontaneous(s, fear, 3)).toContain('at rank 3 (heightened from 1)')
    expect(castSpontaneous(s, fear, 3)).toBe('No rank 3 slots left today.')
    expect(castSpontaneous(s, ref('Fireball'), 1)).toBe('Fireball is a rank 3 spell.')
    expect(s.spellcasting?.slots[2]?.used).toBe(1)
  })

  it('casts a non-signature spell from a higher slot at the rank it is known (p. 297)', () => {
    const s = caster('spontaneous')
    expect(spontaneousRank(ref('Fear'), 3)).toBe(1)
    expect(spontaneousRank({ ...ref('Fear'), signature: true }, 3)).toBe(3)
    const msg = castSpontaneous(s, ref('Fear'), 3)
    expect(msg).toContain('Cast Fear at rank 1 from a rank 3 slot (not heightened)')
    expect(msg).not.toContain('heightened from')
    expect(s.spellcasting?.slots[2]?.used).toBe(1)
  })

  it('casts a prepared slot once', () => {
    const s = caster('prepared')
    s.spellcasting!.slots[0]!.prepared![0]!.id = ref('Fear').id
    expect(castPrepared(s, 1, 0)).toContain('Cast Fear at rank 1')
    expect(castPrepared(s, 1, 0)).toBe('That slot was already cast today.')
    expect(castPrepared(s, 1, 1)).toBe('Nothing prepared in that slot.')
  })

  it('spends a divine font slot at the highest rank', () => {
    const s = caster('prepared')
    expect(castFont(s)).toContain('Heal at rank 3')
    expect(s.spellcasting?.font?.used).toBe(1)
  })

  it('has no divine font to cast before there are spell slots', () => {
    const s = caster('prepared')
    for (const r of s.spellcasting!.slots) r.max = 0
    expect(castFont(s)).toContain('No spell slots yet')
    expect(castFont(s)).not.toContain('rank 0')
    expect(s.spellcasting?.font?.used).toBe(0)
  })

  it('spends Focus Points on focus spells, not on focus cantrips; Refocus gets one back', () => {
    const s = caster('spontaneous')
    expect(castFocus(s, ref('Counter Performance'), 3, false)).toContain('(focus spell, rank 2)')
    expect(s.focus.current).toBe(0)
    expect(castFocus(s, ref('Counter Performance'), 3, false)).toContain('No Focus Points')
    castFocus(s, ref('Courageous Anthem'), 3, true)
    expect(refocus(s)).toBe('Refocused: 1/1 Focus Points.')
    expect(castCantrip(s, ref('Daze'), 5)).toBe('Cast Daze (cantrip, rank 3).')
  })

  it('restores slots, font and focus at daily preparations', () => {
    const s = caster('prepared')
    s.spellcasting!.slots[0]!.prepared![0] = { id: ref('Fear').id, cast: true }
    s.spellcasting!.font!.used = 3
    s.focus.current = 0
    dailyPreparations(s)
    expect(s.spellcasting?.slots[0]?.prepared?.[0]?.cast).toBe(false)
    expect(s.spellcasting?.font?.used).toBe(0)
    expect(s.focus.current).toBe(1)
  })

  it('restores a focus-only hero’s pool at daily preparations', () => {
    const s: Pf2eSheet = {
      ...defaultSheet('pf2e'),
      focusSpells: [ref('Counter Performance')],
      focus: { max: 1, current: 0, note: '' },
    }
    expect(dailyPreparations(s)).toBe('Daily preparations: Focus Points restored.')
    expect(s.focus.current).toBe(1)
  })

  it('grows prepared slots and keeps what was prepared', () => {
    const s = caster('prepared')
    s.spellcasting!.slots[0]!.prepared![0]!.id = 'x'
    setSlotMax(s.spellcasting!, 1, 3)
    expect(s.spellcasting?.slots[0]?.prepared?.map((p) => p.id)).toEqual(['x', null, null])
  })
})
