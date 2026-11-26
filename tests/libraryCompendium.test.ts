// Library → Spells and Classes (utils/libraryCompendium.ts): the list's sort is stable and keeps
// missing values last, filters combine, the URL round-trips, name matches rank above text
// matches, and every PF2e, Nimble and 5e class builds its tables without throwing.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Pf2eData } from '../data/pf2e'
import type { Pf2eActionCost } from '../data/pf2e/types'
import { NIMBLE_CLASSES } from '../data/nimble/classes'
import { SPELLS } from '../data/nimble/spells'
import type { Dnd5eData } from '../data/dnd5e'
import {
  DND5E_SPELL_COLUMNS,
  NIMBLE_CLASS_SOURCES,
  NIMBLE_SPELL_COLUMNS,
  PF2E_SPELL_COLUMNS,
  actionSortValue,
  byKind,
  byLevel,
  classSummary,
  compendiumList,
  dnd5eAdvancement,
  dnd5eClassMatch,
  dnd5eRangeValue,
  dnd5eSpellKeep,
  dnd5eTimeLabel,
  feet,
  nimbleAdvancement,
  nimbleCast,
  nimbleClassMatch,
  nimbleLevelGroups,
  nimbleSpellKeep,
  pf2eAdvancement,
  pf2eClassMatch,
  pf2eSpellKeep,
  pf2eSpellRank,
  readSpellQuery,
  searchRank,
  searchTerms,
  searchable,
  sortRows,
  spellSlotTable,
  writeSpellQuery,
  type SpellQuery,
} from '../utils/libraryCompendium'
import { loreHtml } from '../utils/loreText'

const dir = join(import.meta.dirname, '..', 'data', 'pf2e', 'generated')
const load = <K extends keyof Pf2eData>(set: K): Pf2eData[K] =>
  JSON.parse(readFileSync(join(dir, `${set}.json`), 'utf8'))
const pf2eSpells = load('spells')
const pf2eClasses = load('classes')
const dnd5eDir = join(import.meta.dirname, '..', 'data', 'dnd5e', 'generated')
const load5e = <K extends keyof Dnd5eData>(set: K): Dnd5eData[K] =>
  JSON.parse(readFileSync(join(dnd5eDir, `${set}.json`), 'utf8'))
const dnd5eSpells = load5e('spells')
const dnd5eClasses = load5e('classes')
const dnd5eSubclasses = load5e('subclasses')
const dnd5eOptions = load5e('options')

const query = (changes: Partial<SpellQuery> = {}): SpellQuery => ({
  ...readSpellQuery({}),
  ...changes,
})
const column = (key: string) => {
  const c = PF2E_SPELL_COLUMNS.find((x) => x.key === key)
  if (!c) throw new Error(`No column ${key}`)
  return c
}

describe('sorting', () => {
  it('is stable: equal rows keep their order', () => {
    const rows = [
      { id: 1, v: 2 },
      { id: 2, v: 1 },
      { id: 3, v: 2 },
      { id: 4, v: 1 },
    ]
    expect(sortRows(rows, (r) => r.v, 'asc').map((r) => r.id)).toEqual([2, 4, 1, 3])
    expect(sortRows(rows, (r) => r.v, 'desc').map((r) => r.id)).toEqual([1, 3, 2, 4])
  })

  it('puts missing values last in both directions and breaks ties by name', () => {
    const rows = [
      { n: 'b', v: undefined },
      { n: 'c', v: 1 },
      { n: 'a', v: 1 },
      { n: 'd', v: 3 },
    ]
    const asc = sortRows(
      rows,
      (r) => r.v,
      'asc',
      (r) => r.n,
    ).map((r) => r.n)
    const desc = sortRows(
      rows,
      (r) => r.v,
      'desc',
      (r) => r.n,
    ).map((r) => r.n)
    expect(asc).toEqual(['a', 'c', 'd', 'b'])
    expect(desc).toEqual(['d', 'a', 'c', 'b'])
  })

  it('does not change the input', () => {
    const rows = [3, 1, 2]
    sortRows(rows, (r) => r, 'asc')
    expect(rows).toEqual([3, 1, 2])
  })

  it('orders PF2e action costs cheapest first, activities after', () => {
    const costs: Pf2eActionCost[] = [
      '1 minute',
      3,
      'reaction',
      1,
      '1 to 3',
      'free',
      2,
      '10 minutes',
      '1 hour',
    ]
    const sorted = sortRows(costs, actionSortValue, 'asc')
    expect(sorted).toEqual([
      'free',
      'reaction',
      1,
      '1 to 3',
      2,
      3,
      '1 minute',
      '10 minutes',
      '1 hour',
    ])
  })

  it('reads ranges as feet', () => {
    expect(feet('touch')).toBe(0)
    expect(feet('30 feet')).toBe(30)
    expect(feet('1,000 feet')).toBe(1000)
    expect(feet('1 mile')).toBe(5280)
    expect(feet('15-foot burst')).toBe(15)
    expect(feet('varies')).toBeUndefined()
  })

  it('every column sorts the whole PF2e list without throwing', () => {
    const rows = pf2eSpells.map((s) => searchable(s, s.name, s.text))
    for (const c of PF2E_SPELL_COLUMNS)
      for (const d of ['asc', 'desc'] as const) {
        const list = compendiumList(rows, {
          q: '',
          full: true,
          keep: () => true,
          value: c.value,
          dir: d,
        })
        expect(list).toHaveLength(pf2eSpells.length)
      }
    const byRank = compendiumList(rows, {
      q: '',
      full: true,
      keep: () => true,
      value: column('rank').value,
      dir: 'asc',
    })
    expect(byRank.map(pf2eSpellRank)).toEqual(byRank.map(pf2eSpellRank).sort((a, b) => a - b))
  })
})

describe('filters', () => {
  const keep = (q: Partial<SpellQuery>) => pf2eSpells.filter(pf2eSpellKeep(query(q)))

  it('hide uncommon and rare spells until asked', () => {
    expect(keep({}).every((s) => s.rarity === 'common')).toBe(true)
    expect(keep({ rare: true })).toHaveLength(pf2eSpells.length)
  })

  it('combine: every filter has to pass', () => {
    const fire3 = keep({ rank: '3', trait: 'fire', trad: ['arcane'] })
    expect(fire3.map((s) => s.name)).toContain('Fireball')
    for (const s of fire3) {
      expect(pf2eSpellRank(s)).toBe(3)
      expect(s.traits).toContain('Fire')
      expect(s.traditions).toContain('Arcane')
    }
    expect(fire3.length).toBeLessThan(keep({ rank: '3' }).length)
    expect(fire3.length).toBeLessThan(keep({ trait: 'fire' }).length)
  })

  it('choices within one filter are either-or', () => {
    const both = keep({ trad: ['divine', 'occult'], rare: true })
    const divine = keep({ trad: ['divine'], rare: true })
    const occult = keep({ trad: ['occult'], rare: true })
    expect(both.length).toBeGreaterThanOrEqual(Math.max(divine.length, occult.length))
    expect(both.every((s) => s.traditions.some((t) => t === 'Divine' || t === 'Occult'))).toBe(true)
  })

  it('finds focus spells by class and cantrips at rank 0', () => {
    const cleric = keep({ kind: ['focus'], cls: 'cleric', rare: true })
    expect(cleric.length).toBeGreaterThan(0)
    expect(cleric.every((s) => s.kind === 'focus' && s.classes.includes('Cleric'))).toBe(true)
    expect(keep({ rank: '0' }).every((s) => s.kind === 'cantrip')).toBe(true)
  })

  it('Nimble: tier and school combine', () => {
    const keepN = (q: Partial<SpellQuery>) => SPELLS.filter(nimbleSpellKeep(query(q)))
    const fireCantrips = keepN({ tier: 'cantrip', school: ['fire'] })
    expect(fireCantrips.map((s) => s.name)).toContain('Flame Dart')
    expect(fireCantrips.every((s) => s.school === 'fire' && s.tier === 0 && !s.utility)).toBe(true)
    expect(keepN({ tier: 'utility' }).every((s) => s.utility)).toBe(true)
    expect(
      keepN({ school: ['ice', 'wind'] }).every((s) => ['ice', 'wind'].includes(s.school)),
    ).toBe(true)
  })

  it('Nimble: every column sorts and every spell reads its cast line', () => {
    for (const c of NIMBLE_SPELL_COLUMNS)
      expect(() => sortRows(SPELLS, c.value, 'asc')).not.toThrow()
    expect(nimbleCast(SPELLS.find((s) => s.name === 'Ignite')!)).toEqual({
      actions: '2',
      value: 2,
      target: 'Single Target',
    })
    for (const s of SPELLS) expect(typeof nimbleCast(s).target).toBe('string')
  })
})

describe('the URL', () => {
  it('round-trips every field', () => {
    const q = query({
      q: 'fire ball',
      full: false,
      sort: 'actions',
      dir: 'desc',
      rank: '3',
      kind: ['spell', 'focus'],
      trad: ['arcane', 'primal'],
      cls: 'wizard',
      trait: 'fire',
      rare: true,
      tier: 'utility',
      school: ['ice'],
    })
    expect(readSpellQuery(writeSpellQuery(q))).toEqual(q)
  })

  it('leaves defaults out of the link', () => {
    const written = Object.entries(writeSpellQuery(query())).filter(([, v]) => v !== undefined)
    expect(written).toEqual([])
    expect(readSpellQuery({})).toEqual(query())
  })

  it('reads what a person might type', () => {
    const q = readSpellQuery({
      kind: 'Focus, spell',
      trait: 'FIRE',
      dir: 'sideways',
      q: ['a', 'b'],
    })
    expect(q.kind).toEqual(['focus', 'spell'])
    expect(q.trait).toBe('fire')
    expect(q.dir).toBe('asc')
    expect(q.q).toBe('a')
  })
})

describe('search', () => {
  const rows = pf2eSpells.map((s) => searchable(s, s.name, s.text))
  const list = (q: string, full = true) =>
    compendiumList(rows, {
      q,
      full,
      keep: () => true,
      value: column('name').value,
      dir: 'asc',
    })

  it('ranks names that start with the search, then names that contain it, then text', () => {
    const row = (name: string, text = '') => searchable({}, name, text)
    expect(searchRank(row('Fireball'), 'fire', true)).toBe(0)
    expect(searchRank(row('Wall of Fire'), 'fire', true)).toBe(1)
    expect(searchRank(row('Burning Hands', 'gouts of fire'), 'fire', true)).toBe(2)
    expect(searchRank(row('Burning Hands', 'gouts of fire'), 'fire', false)).toBe(-1)
    expect(searchRank(row('Anything'), '  ', false)).toBe(0)
  })

  it('lists every name match before any text-only match', () => {
    const found = list('fire')
    const firstText = found.findIndex((s) => !s.name.toLowerCase().includes('fire'))
    expect(firstText).toBeGreaterThan(0)
    expect(found.slice(firstText).every((s) => !s.name.toLowerCase().includes('fire'))).toBe(true)
    expect(found[0]?.name.toLowerCase().startsWith('fire')).toBe(true)
  })

  it('without full text, only names match', () => {
    expect(list('fire', false).every((s) => s.name.toLowerCase().includes('fire'))).toBe(true)
  })

  it('needs every word', () => {
    expect(searchTerms('  Fire   BALL ')).toEqual(['fire', 'ball'])
    expect(list('fire ball', false).map((s) => s.name)).toContain('Fireball')
  })

  it('is fast enough to run on every keystroke', () => {
    const start = performance.now()
    for (const q of ['f', 'fi', 'fir', 'fire', 'fire d', 'fire da', 'fire dam'])
      list(q).slice(0, 100)
    expect((performance.now() - start) / 7).toBeLessThan(50)
  })
})

describe('PF2e classes', () => {
  it.each(pf2eClasses.map((c) => [c.name, c] as const))('%s builds its tables', (_, cls) => {
    const table = pf2eAdvancement(cls)
    expect(table.length).toBe(20)
    expect(table.map((r) => r.level)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1))
    expect(table.every((r) => r.features.length > 0)).toBe(true)
    const levels = byLevel(cls.features)
    expect(levels.reduce((n, g) => n + g.items.length, 0)).toBe(cls.features.length)
    expect(byKind(cls.subclasses).reduce((n, g) => n + g.items.length, 0)).toBe(
      cls.subclasses.length,
    )
    const slots = spellSlotTable(cls)
    if (cls.spellSlots?.length) {
      expect(slots?.rows.length).toBe(cls.spellSlots.length)
      expect(slots?.rows.every((r) => r.slots.length === slots.ranks.length)).toBe(true)
    } else expect(slots).toBeNull()
    expect(classSummary(cls.text)).not.toBe('')
    for (const f of cls.features) expect(() => loreHtml(f.text, { headingBase: 5 })).not.toThrow()
    for (const o of cls.subclasses) expect(() => loreHtml(o.text, { headingBase: 5 })).not.toThrow()
    expect(pf2eClassMatch(cls, [])?.whole).toBe(true)
  })

  it('searches features and options, not just names', () => {
    const bard = pf2eClasses.find((c) => c.slug === 'bard')!
    expect(pf2eClassMatch(bard, ['bard'])?.whole).toBe(true)
    const muse = pf2eClassMatch(bard, ['muse'])
    expect(muse?.whole).toBe(false)
    expect(muse?.subclasses.length).toBeGreaterThan(0)
    expect(muse?.hits.some((h) => h.startsWith('Bard Muse: '))).toBe(true)
    expect(pf2eClassMatch(bard, ['zzzqqq'])).toBeNull()
  })
})

describe('Nimble classes', () => {
  it.each(NIMBLE_CLASSES.map((c) => [c.name, c] as const))('%s builds its tables', (_, cls) => {
    const table = nimbleAdvancement(cls)
    expect(table).toHaveLength(20)
    expect(table[0]?.features.length).toBeGreaterThan(0)
    expect(nimbleLevelGroups(cls.levels).length).toBeGreaterThan(0)
    for (const s of cls.subclasses) expect(() => nimbleLevelGroups(s.levels)).not.toThrow()
    expect(NIMBLE_CLASS_SOURCES[cls.slug]).toMatch(/pp\. \d+/)
    expect(nimbleClassMatch(cls, [])?.whole).toBe(true)
  })

  it('names stat increases and choices in the table', () => {
    const berserker = NIMBLE_CLASSES.find((c) => c.slug === 'berserker')!
    const rows = nimbleAdvancement(berserker)
    expect(rows.some((r) => r.features.includes('Subclass'))).toBe(true)
    expect(rows[19]?.features).toContain('+1 to any 2 stats')
    expect(rows.flatMap((r) => r.features).some((f) => f.startsWith('Savage Arsenal'))).toBe(true)
  })

  it('a search finds pool options and subclasses', () => {
    const berserker = NIMBLE_CLASSES.find((c) => c.slug === 'berserker')!
    const hit = nimbleClassMatch(berserker, searchTerms('death blow'))
    expect(hit?.whole).toBe(false)
    expect(hit?.hits).toContain('Savage Arsenal: Death Blow')
    expect(nimbleClassMatch(berserker, ['zzzqqq'])).toBeNull()
  })
})

describe('5e spells', () => {
  const keep = (changes: Partial<SpellQuery>) => dnd5eSpells.filter(dnd5eSpellKeep(query(changes)))

  it('filters by level, school, class, concentration, ritual, casting time and source', () => {
    expect(keep({ level: '0' }).every((s) => s.level === 0)).toBe(true)
    expect(keep({ school: ['evocation'] }).every((s) => s.school === 'Evocation')).toBe(true)
    expect(keep({ cls: 'warlock' }).every((s) => s.classes.includes('warlock'))).toBe(true)
    expect(keep({ conc: 'yes' }).every((s) => s.concentration)).toBe(true)
    expect(keep({ conc: 'no' }).some((s) => s.concentration)).toBe(false)
    expect(keep({ ritual: 'yes' }).every((s) => s.ritual)).toBe(true)
    expect(keep({ time: ['reaction'] }).map((s) => s.name)).toContain('Shield')
    expect(keep({ src: ['phb'] }).every((s) => s.source === 'PHB 2024' && !s.srd)).toBe(true)
    expect(keep({ src: ['srd'] }).every((s) => s.srd)).toBe(true)
  })

  it('combines filters', () => {
    const rows = keep({ level: '3', school: ['evocation'], cls: 'wizard' })
    expect(rows.map((s) => s.name)).toContain('Fireball')
    expect(rows.every((s) => s.level === 3 && s.classes.includes('wizard'))).toBe(true)
  })

  it('round-trips its filters through the URL', () => {
    const q = query({
      level: '2',
      conc: 'no',
      ritual: 'yes',
      time: ['action', 'bonus'],
      src: ['srd'],
    })
    expect(readSpellQuery(writeSpellQuery(q))).toEqual(q)
    expect(readSpellQuery({ conc: 'maybe' }).conc).toBe('')
  })

  it('sorts casting times from Reaction to hours, and ranges from Self outward', () => {
    const time = DND5E_SPELL_COLUMNS.find((c) => c.key === 'time')
    const byTime = sortRows(dnd5eSpells, (s) => time?.value(s), 'asc')
    expect(byTime[0]?.activation).toBe('reaction')
    expect(byTime.at(-1)?.activation).toBe('time')
    expect(dnd5eRangeValue('Self')).toBe(0)
    expect(dnd5eRangeValue('Touch')).toBe(0)
    expect(dnd5eRangeValue('150 feet')).toBe(150)
    expect(dnd5eRangeValue('Self (15-foot Cone)')).toBe(15)
  })

  it('names casting times without their trigger or Ritual', () => {
    const shield = dnd5eSpells.find((s) => s.slug === 'shield')
    const alarm = dnd5eSpells.find((s) => s.slug === 'alarm')
    expect(shield && dnd5eTimeLabel(shield)).toBe('Reaction')
    expect(alarm && dnd5eTimeLabel(alarm)).toBe('1 minute')
  })
})

describe('5e classes', () => {
  it('builds a 20-level table with every column for each class, the Artificer included', () => {
    expect(dnd5eClasses.map((c) => c.slug)).toContain('artificer')
    for (const cls of dnd5eClasses) {
      const t = dnd5eAdvancement(cls)
      expect(t.rows).toHaveLength(20)
      expect(t.rows.every((r) => r.values.length === cls.columns.length)).toBe(true)
      expect(t.rows[0]?.pb).toBe('+2')
      expect(t.rows[19]?.pb).toBe('+6')
    }
  })

  it('finds features, subclasses and options a search names', () => {
    const subs = (slug: string) => dnd5eSubclasses.filter((s) => s.class === slug)
    const groups = (slug: string) => dnd5eOptions.filter((g) => g.class === slug)
    const rogue = dnd5eClasses.find((c) => c.slug === 'rogue')
    const warlock = dnd5eClasses.find((c) => c.slug === 'warlock')
    if (!rogue || !warlock) throw new Error('5e classes missing')
    const sneak = dnd5eClassMatch(rogue, subs('rogue'), groups('rogue'), ['sneak', 'attack'])
    expect(sneak?.whole).toBe(false)
    expect(sneak?.hits).toContain('Feature: Sneak Attack')
    expect(dnd5eClassMatch(rogue, subs('rogue'), groups('rogue'), ['rogue'])?.whole).toBe(true)
    const thief = dnd5eClassMatch(rogue, subs('rogue'), groups('rogue'), ['thief'])
    expect(thief?.subclasses.has('thief')).toBe(true)
    const shadows = dnd5eClassMatch(warlock, subs('warlock'), groups('warlock'), [
      'armor',
      'shadows',
    ])
    expect(shadows?.options.has('armor-of-shadows')).toBe(true)
    expect(dnd5eClassMatch(rogue, subs('rogue'), groups('rogue'), ['zzzz'])).toBeNull()
  })
})
