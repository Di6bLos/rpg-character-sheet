// Library → Spells and Feats sections (utils/librarySections.ts): rows land in their sections in
// level or category order with empty ones left out, a section opens from the saved choice or on
// its own while searching, the saved list reads back safely, and every spell of every system
// lands in one of its system's named sections.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Dnd5eData } from '../data/dnd5e'
import { SPELLS } from '../data/nimble/spells'
import type { Pf2eData } from '../data/pf2e'
import {
  DND5E_SPELL_COLUMNS,
  DND5E_SPELL_SECTIONS,
  NIMBLE_SPELL_COLUMNS,
  NIMBLE_SPELL_SECTIONS,
  PF2E_SPELL_COLUMNS,
  PF2E_SPELL_SECTIONS,
  dnd5eSpellSection,
  nimbleTierKey,
  pf2eSpellRank,
  pf2eSpellSection,
} from '../utils/libraryCompendium'
import {
  groupSections,
  readSavedSections,
  sectionOpen,
  sectionStorageKey,
  type SectionDef,
} from '../utils/librarySections'

const root = join(import.meta.dirname, '..', 'data')
const load5e = <K extends keyof Dnd5eData>(set: K): Dnd5eData[K] =>
  JSON.parse(readFileSync(join(root, 'dnd5e', 'generated', `${set}.json`), 'utf8'))
const loadPf2e = <K extends keyof Pf2eData>(set: K): Pf2eData[K] =>
  JSON.parse(readFileSync(join(root, 'pf2e', 'generated', `${set}.json`), 'utf8'))

const DEFS: SectionDef[] = [
  { key: 'a', label: 'A' },
  { key: 'b', label: 'B' },
  { key: 'c', label: 'C' },
]

describe('grouping', () => {
  it("follows the defs' order, keeps the rows' order and drops empty sections", () => {
    const rows = [
      { id: 1, k: 'c' },
      { id: 2, k: 'a' },
      { id: 3, k: 'c' },
      { id: 4, k: 'a' },
    ]
    const out = groupSections(rows, DEFS, (r) => r.k)
    expect(out.map((s) => s.key)).toEqual(['a', 'c'])
    expect(out.map((s) => s.rows.map((r) => r.id))).toEqual([
      [2, 4],
      [1, 3],
    ])
    expect(out[0]?.label).toBe('A')
  })

  it('shows a row with several keys in each, once, and puts unknown keys last', () => {
    const out = groupSections(
      [
        { id: 1, k: ['b', 'a', 'b'] },
        { id: 2, k: ['zz'] },
      ],
      DEFS,
      (r) => r.k,
    )
    expect(out.map((s) => [s.key, s.rows.map((r) => r.id)])).toEqual([
      ['a', [1]],
      ['b', [1]],
      ['zz', [2]],
    ])
    expect(out[2]?.label).toBe('zz')
  })

  it('gives nothing for no rows', () => {
    expect(groupSections([], DEFS, () => 'a')).toEqual([])
  })
})

describe('open sections', () => {
  const saved = new Set(['a'])
  const none = new Map<string, boolean>()

  it('follow the saved choice when not searching', () => {
    expect(sectionOpen('a', { saved, auto: false, flips: none })).toBe(true)
    expect(sectionOpen('b', { saved, auto: false, flips: none })).toBe(false)
  })

  it('all open on their own while searching, unless folded since', () => {
    expect(sectionOpen('b', { saved, auto: true, flips: none })).toBe(true)
    expect(sectionOpen('a', { saved, auto: true, flips: new Map([['a', false]]) })).toBe(false)
  })

  it('read back from a saved JSON list, and anything else reads as none', () => {
    expect([...readSavedSections('["0","3"]')]).toEqual(['0', '3'])
    expect([...readSavedSections('["0",3,null]')]).toEqual(['0'])
    expect(readSavedSections(null).size).toBe(0)
    expect(readSavedSections('{oops').size).toBe(0)
    expect(readSavedSections('{"a":1}').size).toBe(0)
  })

  it('are saved per tab and system', () => {
    expect(sectionStorageKey('spells', 'pf2e')).not.toBe(sectionStorageKey('spells', 'dnd5e'))
    expect(sectionStorageKey('spells', 'pf2e')).not.toBe(sectionStorageKey('feats', 'pf2e'))
  })
})

describe('spell sections', () => {
  const named = (defs: SectionDef[]) => new Set(defs.map((d) => d.key))

  it('PF2e: cantrips, ranks 1–10, then focus spells; every spell lands in one', () => {
    expect(PF2E_SPELL_SECTIONS.map((s) => s.label)).toEqual([
      'Cantrips',
      ...Array.from({ length: 10 }, (_, i) => `Rank ${i + 1}`),
      'Focus spells',
    ])
    const spells = loadPf2e('spells')
    const keys = named(PF2E_SPELL_SECTIONS)
    expect(spells.every((s) => keys.has(pf2eSpellSection(s)))).toBe(true)
    const out = groupSections(spells, PF2E_SPELL_SECTIONS, pf2eSpellSection)
    expect(out.reduce((n, s) => n + s.rows.length, 0)).toBe(spells.length)
    expect(out.find((s) => s.key === 'focus')?.rows.every((s) => s.kind === 'focus')).toBe(true)
    expect(out.find((s) => s.key === '3')?.rows.every((s) => pf2eSpellRank(s) === 3)).toBe(true)
  })

  it('Nimble: cantrips, utility spells, then tiers; every spell lands in one', () => {
    const keys = named(NIMBLE_SPELL_SECTIONS)
    expect(SPELLS.every((s) => keys.has(nimbleTierKey(s)))).toBe(true)
    const out = groupSections(SPELLS, NIMBLE_SPELL_SECTIONS, nimbleTierKey)
    expect(out.slice(0, 3).map((s) => s.label)).toEqual(['Cantrips', 'Utility spells', 'Tier 1'])
  })

  it('5e: cantrips, then levels 1–9; every spell lands in one', () => {
    const spells = load5e('spells')
    const keys = named(DND5E_SPELL_SECTIONS)
    expect(spells.every((s) => keys.has(dnd5eSpellSection(s)))).toBe(true)
    expect(groupSections(spells, DND5E_SPELL_SECTIONS, dnd5eSpellSection)).toHaveLength(10)
  })

  it('no system keeps a level column, since each section is one level', () => {
    const keys = [...PF2E_SPELL_COLUMNS, ...NIMBLE_SPELL_COLUMNS, ...DND5E_SPELL_COLUMNS].map(
      (c) => c.key,
    )
    expect(keys).not.toContain('rank')
    expect(keys).not.toContain('tier')
    expect(keys).not.toContain('level')
  })
})
