// Library → Feats, Backgrounds and Species (utils/libraryEntries.ts, utils/libraryOrigins.ts,
// utils/libraryDnd5e.ts): the URL round-trips, filters combine, the search ranks names first,
// every system's list builds from the committed data, and 5e entries show SRD text with its
// page or, for non-SRD entries, only their summary and fields with a source tag.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Dnd5eData } from '../data/dnd5e'
import { ANCESTRIES } from '../data/nimble/ancestries'
import { BACKGROUNDS } from '../data/nimble/backgrounds'
import type { Pf2eData } from '../data/pf2e'
import {
  choiceLine,
  entryItem,
  grantLines,
  mechanicsFacts,
  saveLabel,
  slugName,
  usesLabel,
} from '../utils/libraryDnd5e'
import {
  ENTRY_RESERVED,
  ENTRY_SYSTEMS,
  entryIndex,
  entryKeep,
  entryRows,
  entryTabLabel,
  readEntryQuery,
  writeEntryQuery,
  type EntryList,
  type EntryQuery,
} from '../utils/libraryEntries'
import {
  dnd5eBackgroundList,
  dnd5eFeatList,
  dnd5eSpeciesList,
  nimbleAncestryList,
  nimbleBackgroundList,
  pf2eAncestryList,
  pf2eBackgroundList,
  pf2eFeatCategories,
  pf2eFeatList,
} from '../utils/libraryOrigins'

const root = join(import.meta.dirname, '..', 'data')
const load5e = <K extends keyof Dnd5eData>(set: K): Dnd5eData[K] =>
  JSON.parse(readFileSync(join(root, 'dnd5e', 'generated', `${set}.json`), 'utf8'))
const loadPf2e = <K extends keyof Pf2eData>(set: K): Pf2eData[K] =>
  JSON.parse(readFileSync(join(root, 'pf2e', 'generated', `${set}.json`), 'utf8'))

const feats5e = load5e('feats')
const lists: Record<string, EntryList> = {
  'feats:dnd5e': dnd5eFeatList(feats5e),
  'feats:pf2e': pf2eFeatList(loadPf2e('feats')),
  'backgrounds:dnd5e': dnd5eBackgroundList(load5e('backgrounds'), feats5e),
  'backgrounds:pf2e': pf2eBackgroundList(loadPf2e('backgrounds')),
  'backgrounds:nimble': nimbleBackgroundList(BACKGROUNDS),
  'species:dnd5e': dnd5eSpeciesList(load5e('species')),
  'species:pf2e': pf2eAncestryList(loadPf2e('ancestries'), loadPf2e('heritages')),
  'species:nimble': nimbleAncestryList(ANCESTRIES),
}
const list = (key: string) => {
  const l = lists[key]
  if (!l) throw new Error(`No list ${key}`)
  return l
}
const query = (changes: Partial<EntryQuery> = {}): EntryQuery => ({
  ...readEntryQuery({}, []),
  ...changes,
})
const rows = (key: string, changes: Partial<EntryQuery> = {}, sort = list(key).defaultSort) =>
  entryRows(entryIndex(list(key).entries), query(changes), sort)

describe('every list', () => {
  it('builds for each system the tab names', () => {
    for (const [tab, systems] of Object.entries(ENTRY_SYSTEMS))
      for (const system of systems)
        expect(list(`${tab}:${system}`).entries.length).toBeGreaterThan(0)
    expect(ENTRY_SYSTEMS.feats).not.toContain('nimble')
  })

  it('has unique ids, a name column, real sort and filter keys', () => {
    for (const [key, l] of Object.entries(lists)) {
      const ids = l.entries.map((e) => e.id)
      expect(new Set(ids).size, key).toBe(ids.length)
      expect(l.columns[0]?.key, key).toBe('name')
      expect(
        l.columns.map((c) => c.key),
        key,
      ).toContain(l.defaultSort)
      for (const f of l.filters) {
        expect(ENTRY_RESERVED as readonly string[], key).not.toContain(f.key)
        expect(f.options.length, `${key} ${f.key}`).toBeGreaterThan(0)
        // Every option keeps at least one entry.
        for (const o of f.options)
          expect(
            rows(key, { picked: { [f.key]: [o.value] } }).length,
            `${key} ${f.key}=${o.value}`,
          ).toBeGreaterThan(0)
      }
    }
  })

  it('names the species tab per system', () => {
    expect(entryTabLabel('species', 'dnd5e')).toBe('Species')
    expect(entryTabLabel('species', 'pf2e')).toBe('Ancestries')
    expect(entryTabLabel('species', 'nimble')).toBe('Ancestries')
  })
})

describe('the URL', () => {
  const filters = list('feats:dnd5e').filters

  it('round-trips the search, sort and filters', () => {
    const q = query({
      q: 'alert',
      full: false,
      sort: 'category',
      dir: 'desc',
      picked: { category: ['origin', 'general'], level: ['4'] },
    })
    expect(readEntryQuery(writeEntryQuery(q, filters), filters)).toEqual(q)
  })

  it('leaves defaults out, keeps one value for a select and ignores unknown keys', () => {
    expect(Object.values(writeEntryQuery(query(), filters)).filter(Boolean)).toEqual([])
    const q = readEntryQuery({ level: '4,19', category: 'Origin, General', colour: 'red' }, filters)
    expect(q.picked).toEqual({ level: ['4'], category: ['origin', 'general'] })
  })
})

describe('filters and search', () => {
  it('keeps entries any chip matches, and every filter has to match', () => {
    const origin = rows('feats:dnd5e', { picked: { category: ['origin'] } })
    const both = rows('feats:dnd5e', { picked: { category: ['origin', 'epic-boon'] } })
    expect(origin.every((e) => e.facets.category?.includes('origin'))).toBe(true)
    expect(both.length).toBeGreaterThan(origin.length)
    const srdGeneral = rows('feats:dnd5e', { picked: { category: ['general'], source: ['srd'] } })
    expect(srdGeneral.length).toBeGreaterThan(0)
    expect(srdGeneral.every((e) => !e.tag && e.facets.category?.includes('general'))).toBe(true)
  })

  it('filters 5e feats by prerequisite and level', () => {
    const none = rows('feats:dnd5e', { picked: { prereq: ['none'] } })
    expect(none.every((e) => e.cells.prereq === '—')).toBe(true)
    const epic = rows('feats:dnd5e', { picked: { level: ['19'] } })
    expect(epic.length).toBeGreaterThan(0)
    expect(epic.every((e) => e.cells.prereq.startsWith('Level 19+'))).toBe(true)
    const ability = rows('feats:dnd5e', { picked: { prereq: ['ability'] } })
    expect(ability.every((e) => /\d+\+/.test(e.cells.prereq ?? ''))).toBe(true)
  })

  it('filters PF2e feats by category, level and class', () => {
    const rogue1 = rows('feats:pf2e', { picked: { class: ['rogue'], level: ['1'] } })
    expect(rogue1.length).toBeGreaterThan(0)
    expect(rogue1.every((e) => e.cells.level === '1' && e.cells.for?.includes('Rogue'))).toBe(true)
    const skill = rows('feats:pf2e', { picked: { category: ['skill'] } })
    expect(skill.every((e) => e.facets.category?.includes('skill'))).toBe(true)
    const feats = loadPf2e('feats')
    expect(feats.every((f) => pf2eFeatCategories(f).length > 0)).toBe(true)
  })

  it('ranks name matches above text matches, and only searches text with full on', () => {
    const named = rows('feats:dnd5e', { q: 'alert' })
    expect(named[0]?.name).toBe('Alert')
    const text = rows('feats:dnd5e', { q: 'initiative' })
    expect(text.length).toBeGreaterThan(1)
    expect(rows('feats:dnd5e', { q: 'initiative', full: false })).toHaveLength(0)
  })

  it('sorts by a column, missing values last either way', () => {
    const byLevel = rows('feats:pf2e', { dir: 'desc' }, 'level').map((e) => e.sort.level)
    expect(byLevel[0]).toBe(20)
    const bySpeed = rows('species:pf2e', {}, 'speed').map((e) => Number(e.sort.speed))
    expect(bySpeed).toEqual([...bySpeed].sort((a, b) => a - b))
  })

  it('reads a filter by the entry’s facets in any case', () => {
    const keep = entryKeep(query({ picked: { size: ['small'] } }))
    expect(
      list('species:dnd5e')
        .entries.filter(keep)
        .map((e) => e.name),
    ).toContain('Gnome')
  })
})

describe('5e entries', () => {
  const all = [
    ...list('feats:dnd5e').entries,
    ...list('backgrounds:dnd5e').entries,
    ...list('species:dnd5e').entries,
  ]

  it('shows SRD text with its page, untagged', () => {
    const srd = all.filter((e) => e.source.startsWith('SRD'))
    expect(srd.length).toBeGreaterThan(20)
    for (const e of srd) {
      expect(e.text, e.name).toBeTruthy()
      expect(e.source, e.name).toMatch(/^SRD 5\.2\.1 p\. \d+$/)
      expect(e.tag, e.name).toBeUndefined()
      expect(e.summary, e.name).toBeUndefined()
    }
  })

  it('shows non-SRD entries only as their summary and fields, tagged with their book', () => {
    const other = all.filter((e) => !e.source.startsWith('SRD'))
    expect(other.length).toBeGreaterThan(40)
    for (const e of other) {
      expect(e.text, e.name).toBeUndefined()
      expect(e.summary, e.name).toBeTruthy()
      expect(['PHB 2024', 'Forge of the Artificer'], e.name).toContain(e.tag)
      for (const item of e.parts.flatMap((p) => p.items)) expect(item.text, item.name).toBeFalsy()
    }
    const actor = list('feats:dnd5e').entries.find((e) => e.id === 'actor')
    expect(actor?.parts[0]?.items.map((i) => i.name)).toEqual([
      'Ability Score Increase',
      'Impersonation',
      'Mimicry',
    ])
  })

  it('names a background’s origin feat and the option it fixes', () => {
    const acolyte = list('backgrounds:dnd5e').entries.find((e) => e.id === 'acolyte')
    expect(acolyte?.cells.feat).toBe('Magic Initiate (Cleric)')
  })
})

describe('5e mechanics as fact lines', () => {
  it('words uses, saves, grants and choices from their fields', () => {
    expect(usesLabel({ count: 'PB', recharge: 'long' })).toBe('Proficiency Bonus per Long Rest')
    expect(usesLabel({ count: 'column:Rages', recharge: 'long', short: 1 })).toBe(
      'Rages column per Long Rest (1 back on a Short Rest)',
    )
    expect(usesLabel({ count: 'CHA', recharge: 'short', restore: 'a spell slot' })).toBe(
      'Charisma modifier (min 1) per Short or Long Rest (or spend a spell slot)',
    )
    expect(saveLabel({ ability: 'WIS', dc: '8+PB+STR/DEX' })).toBe(
      'Wisdom, DC 8 + PB + Strength or Dexterity',
    )
    expect(saveLabel({ ability: 'CON', dc: 'spell' })).toBe('Constitution, your spell save DC')
    expect(
      grantLines([
        { kind: 'tool', value: 'Alchemist’s Supplies' },
        { kind: 'tool', value: 'Herbalism Kit' },
        { kind: 'sense', value: 'Darkvision', range: 60 },
        { kind: 'speed', value: 'fly', amount: 'walk' },
        { kind: 'spell', spell: 'mage-armor', atWill: true },
      ]),
    ).toEqual([
      'Tool proficiency: Alchemist’s Supplies, Herbalism Kit',
      'Senses: Darkvision 60 ft',
      'Speed: Fly Speed equal to your Speed',
      'Spells: Mage Armor (at will)',
    ])
    expect(choiceLine({ kind: 'skill', count: 2, from: ['Arcana', 'History', 'Insight'] })).toBe(
      'Choose 2 skills from Arcana, History or Insight',
    )
    expect(
      choiceLine({ kind: 'feat', count: 1, category: ['fighting-style'], label: 'Style' }),
    ).toBe('Style: choose 1 feat (Fighting Style)')
    expect(
      mechanicsFacts({ activation: 'bonus', uses: { count: 1, recharge: 'long' }, range: 30 }),
    ).toEqual(['Bonus Action', 'Uses: 1 per Long Rest', 'Range: 30 ft'])
  })

  it('leaves the fields out where SRD text says it all', () => {
    const item = entryItem({ name: 'Rage', text: 'You can imbue yourself…', activation: 'bonus' })
    expect(item.facts).toEqual([])
    const summary = entryItem({ name: 'Rage', summary: 'Get angry.', activation: 'bonus' })
    expect(summary).toMatchObject({ summary: 'Get angry.', facts: ['Bonus Action'] })
    expect(slugName('pass-without-trace')).toBe('Pass without Trace')
  })
})
