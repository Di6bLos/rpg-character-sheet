// The 5e data (data/dnd5e): every record is whole and its references resolve, the class tables
// follow the 2024 rules' shape, every SRD entry is one the SRD prints, and no non-SRD entry's
// prose copies the book text the wiki carries (the user's licensing call of 2026-11-25, see
// .claude/skills/rpg-rules/references/licensing.md).
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Dnd5eData } from '../data/dnd5e'
import { DND5E_SOURCES } from '../data/dnd5e/sources'
import type { Dnd5eFeature, Dnd5eMechanics, Dnd5eRecord } from '../data/dnd5e/types'
import { copiedRuns, prose, runs } from '../scripts/lib/dnd5eOverlap'
import { LEAD_IN } from '../scripts/lib/dnd5eRules'
import { cachedPage, pageContent, plainText } from '../scripts/lib/wikidot'

const root = join(import.meta.dirname, '..')
const dir = join(root, 'data', 'dnd5e', 'generated')
const load = <K extends keyof Dnd5eData>(set: K): Dnd5eData[K] =>
  JSON.parse(readFileSync(join(dir, `${set}.json`), 'utf8'))

const data: Dnd5eData = {
  armor: load('armor'),
  backgrounds: load('backgrounds'),
  classes: load('classes'),
  conditions: load('conditions'),
  feats: load('feats'),
  gear: load('gear'),
  magicItems: load('magicItems'),
  masteries: load('masteries'),
  options: load('options'),
  species: load('species'),
  spells: load('spells'),
  subclasses: load('subclasses'),
  weapons: load('weapons'),
}
const allow: Record<string, string[]> = JSON.parse(
  readFileSync(join(root, 'data', 'dnd5e', 'srd-allowlist.json'), 'utf8'),
)
const records = (): [string, Dnd5eRecord[]][] => [
  ...Object.entries(data).filter(([k]) => k !== 'options'),
  ...data.options.map((g) => [`options/${g.slug}`, g.entries] as [string, Dnd5eRecord[]]),
]
const classSlugs = new Set(data.classes.map((c) => c.slug))
const spellSlugs = new Set(data.spells.map((s) => s.slug))
const featSlugs = new Set(data.feats.map((f) => f.slug))
const groupSlugs = new Set(data.options.map((g) => g.slug))
const ABILITIES = new Set(['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'])
const dupes = (keys: string[]) => keys.filter((k, i) => keys.indexOf(k) !== i)
/** The official books a non-SRD entry may come from: every source but the SRD. */
const BOOKS: string[] = DND5E_SOURCES.map((s) => s.name).filter((n) => n !== 'SRD 5.2.1')
const released = new Map<string, string>(DND5E_SOURCES.map((s) => [s.name, s.released]))

/** Every mechanics block in the data, with where it sits. */
function mechanics(): [string, Dnd5eMechanics][] {
  const out: [string, Dnd5eMechanics][] = []
  const feats = (owner: string, list: Dnd5eFeature[]) =>
    list.forEach((f) =>
      out.push(
        [`${owner}: ${f.name}`, f],
        ...(f.options ?? []).map(
          (o) => [`${owner}: ${f.name}: ${o.name}`, o] as [string, Dnd5eMechanics],
        ),
      ),
    )
  for (const c of data.classes) feats(c.slug, c.features)
  for (const s of data.subclasses) feats(s.slug, s.features)
  for (const f of data.feats)
    out.push(
      [f.slug, f],
      ...f.benefits.map((b) => [`${f.slug}: ${b.name}`, b] as [string, Dnd5eMechanics]),
    )
  for (const s of data.species) {
    out.push(...s.traits.map((t) => [`${s.slug}: ${t.name}`, t] as [string, Dnd5eMechanics]))
    out.push(
      ...(s.lineages?.options ?? []).map(
        (l) => [`${s.slug}: ${l.name}`, l] as [string, Dnd5eMechanics],
      ),
    )
  }
  for (const g of data.options)
    out.push(...g.entries.map((e) => [`${g.slug}: ${e.slug}`, e] as [string, Dnd5eMechanics]))
  return out
}

describe('5e data', () => {
  it.each(records())('%s: unique slugs, a source, SRD text or a summary', (_, rows) => {
    expect(rows.length).toBeGreaterThan(0)
    expect(dupes(rows.map((r) => r.slug))).toEqual([])
    for (const r of rows) {
      expect(r.name, r.slug).not.toBe('')
      if (r.srd) {
        expect(r.source, r.slug).toBe('SRD 5.2.1')
        expect(r.page, r.slug).toBeGreaterThan(0)
      } else {
        expect(BOOKS, r.slug).toContain(r.source)
        expect(r.text, r.slug).toBeUndefined()
        expect(r.page, r.slug).toBeUndefined()
        expect(r.summary?.trim(), `${r.slug}: summary`).toBeTruthy()
        expect(r.wiki, r.slug).toBeTruthy()
      }
    }
  })

  it('gives every entry a one-line summary that says something', () => {
    // Weapons and armor show their stat lines instead.
    for (const [set, rows] of records().filter(([k]) => k !== 'weapons' && k !== 'armor'))
      for (const r of rows) {
        expect(r.summary?.trim(), `${set}/${r.slug}`).toBeTruthy()
        expect(r.summary!.trim(), `${set}/${r.slug}`).not.toMatch(LEAD_IN)
      }
    const leadIns: string[] = []
    const walk = (v: unknown, where: string): void => {
      if (Array.isArray(v)) v.forEach((x) => walk(x, where))
      else if (v && typeof v === 'object')
        for (const [k, x] of Object.entries(v))
          if (k === 'summary' && typeof x === 'string' && LEAD_IN.test(x.trim()))
            leadIns.push(`${where}: ${x}`)
          else walk(x, where)
    }
    for (const [set, rows] of records()) for (const r of rows) walk(r, `${set}/${r.slug}`)
    expect(leadIns).toEqual([])
    // The SRD feats the user saw with "You gain the following benefits." as their line.
    const feat = (slug: string) => data.feats.find((f) => f.slug === slug)!
    expect(feat('alert').summary).toMatch(/Initiative/)
    expect(feat('magic-initiate').summary).toMatch(/cantrip|spell/i)
    expect(LEAD_IN.test('You gain the following benefits.')).toBe(true)
    expect(LEAD_IN.test('As a Dwarf, you have these special traits.')).toBe(true)
  })

  it('names every source from the sources list, a reprint by its latest book', () => {
    const names = DND5E_SOURCES.map((s) => s.name)
    expect(dupes(names)).toEqual([])
    expect(dupes(DND5E_SOURCES.map((s) => s.short))).toEqual([])
    for (const s of DND5E_SOURCES)
      expect(['core', 'supplement', 'setting', 'drop']).toContain(s.kind)
    for (const [set, rows] of records())
      for (const r of rows) {
        expect(names, `${set}/${r.slug}`).toContain(r.source)
        if (!r.sources) continue
        expect(r.sources.length, `${set}/${r.slug}`).toBeGreaterThan(1)
        expect(r.sources.at(-1), `${set}/${r.slug}`).toBe(r.source)
        const dates = r.sources.map((x) => released.get(x)!)
        expect(dates, `${set}/${r.slug}`).toEqual([...dates].sort())
      }
    const species = (slug: string) => data.species.find((x) => x.slug === slug)
    expect(species('dhampir')).toMatchObject({
      source: 'Ravenloft: The Horrors Within',
      sources: ['Astarion’s Book of Hungers', 'Ravenloft: The Horrors Within'],
    })
    // Two books' different species of one name keep apart.
    expect(species('changeling')?.source).toBe('Eberron: Forge of the Artificer')
    expect(species('lorwyn-changeling')?.source).toBe('Lorwyn: First Light')
    expect(species('elf')?.srd).toBe(true)
    expect(species('elf-warcraft')?.source).toBe('World of Warcraft')
  })

  it('keeps book text only on SRD parts, and a summary on every other feature and benefit', () => {
    const parts: [string, { srd?: boolean; text?: string; summary?: string }][] = [
      ...data.classes.flatMap((c) =>
        c.features.map((f) => [`${c.slug}: ${f.name}`, f] as [string, Dnd5eFeature]),
      ),
      ...data.subclasses.flatMap((s) =>
        s.features.map((f) => [`${s.slug}: ${f.name}`, f] as [string, Dnd5eFeature]),
      ),
    ]
    for (const [where, f] of parts) {
      if (f.srd) expect(f.text, where).toBeTruthy()
      else {
        expect(f.text, where).toBeUndefined()
        expect(f.summary?.trim(), `${where}: summary`).toBeTruthy()
      }
    }
    for (const f of data.feats.filter((x) => !x.srd))
      for (const b of f.benefits) {
        expect(b.text, `${f.slug}: ${b.name}`).toBeUndefined()
        expect(b.summary?.trim(), `${f.slug}: ${b.name}`).toBeTruthy()
      }
    for (const s of data.species.filter((x) => !x.srd))
      for (const t of s.traits) {
        expect(t.text, `${s.slug}: ${t.name}`).toBeUndefined()
        expect(t.summary?.trim(), `${s.slug}: ${t.name}`).toBeTruthy()
      }
  })

  it('has the 2024 classes, each with 20 levels of the standard proficiency bonus', () => {
    expect(data.classes.map((c) => c.slug).sort()).toEqual([
      'artificer',
      'barbarian',
      'bard',
      'cleric',
      'druid',
      'fighter',
      'monk',
      'paladin',
      'ranger',
      'rogue',
      'sorcerer',
      'warlock',
      'wizard',
    ])
    for (const c of data.classes) {
      expect(
        c.levels.map((l) => l.level),
        c.slug,
      ).toEqual(Array.from({ length: 20 }, (_, i) => i + 1))
      for (const l of c.levels)
        expect(l.proficiencyBonus, `${c.slug} ${l.level}`).toBe(2 + Math.floor((l.level - 1) / 4))
      expect([6, 8, 10, 12]).toContain(c.hitDie)
      expect(c.saves, c.slug).toHaveLength(2)
      expect(c.subclassLevel, c.slug).toBe(3)
      expect(c.epicBoonLevel, c.slug).toBe(19)
      for (const lv of [4, 8, 12, 16]) expect(c.asiLevels, c.slug).toContain(lv)
      expect(c.skills.count, c.slug).toBeGreaterThan(0)
      expect(c.equipment.length, c.slug).toBeGreaterThan(1)
      for (const a of [...c.saves, ...c.primaryAbility.abilities]) expect(ABILITIES).toContain(a)
    }
    const asi = (slug: string) => data.classes.find((c) => c.slug === slug)?.asiLevels
    expect(asi('fighter')).toEqual([4, 6, 8, 12, 14, 16])
    expect(asi('rogue')).toEqual([4, 8, 10, 12, 16])
  })

  it('names every table feature among the class features at or below that level', () => {
    const base = (n: string) =>
      n.replace(/\s*\((?:(?:One|Two|Three|Four) Uses?|Level \d Spell)\)$/, '').toLowerCase()
    for (const c of data.classes)
      for (const l of c.levels)
        for (const n of l.features.filter((x) => x !== 'Subclass feature'))
          expect(
            c.features.some((f) => f.level <= l.level && f.name.toLowerCase() === base(n)),
            `${c.slug} ${l.level}: ${n}`,
          ).toBe(true)
  })

  it('has the standard spell slot tables', () => {
    // Full casters (SRD p. 25's Multiclass Spellcaster table, levels 1–20).
    const full = [
      [2],
      [3],
      [4, 2],
      [4, 3],
      [4, 3, 2],
      [4, 3, 3],
      [4, 3, 3, 1],
      [4, 3, 3, 2],
      [4, 3, 3, 3, 1],
      [4, 3, 3, 3, 2],
      [4, 3, 3, 3, 2, 1],
      [4, 3, 3, 3, 2, 1],
      [4, 3, 3, 3, 2, 1, 1],
      [4, 3, 3, 3, 2, 1, 1],
      [4, 3, 3, 3, 2, 1, 1, 1],
      [4, 3, 3, 3, 2, 1, 1, 1],
      [4, 3, 3, 3, 2, 1, 1, 1, 1],
      [4, 3, 3, 3, 3, 1, 1, 1, 1],
      [4, 3, 3, 3, 3, 2, 1, 1, 1],
      [4, 3, 3, 3, 3, 2, 2, 1, 1],
    ].map((r) => [...r, ...Array(9 - r.length).fill(0)])
    const sc = (slug: string) => data.classes.find((c) => c.slug === slug)?.spellcasting
    for (const slug of ['bard', 'cleric', 'druid', 'sorcerer', 'wizard']) {
      expect(sc(slug)?.kind, slug).toBe('full')
      expect(sc(slug)?.slots, slug).toEqual(full)
    }
    // Paladin and Ranger: a full caster's slots at half their level, rounded up.
    for (const slug of ['paladin', 'ranger']) {
      expect(sc(slug)?.kind, slug).toBe('half')
      sc(slug)!.slots!.forEach((row, i) =>
        expect(row, `${slug} ${i + 1}`).toEqual(full[Math.ceil((i + 1) / 2) - 1]),
      )
    }
    expect(sc('artificer')?.kind).toBe('half')
    const pact = sc('warlock')!.pact!
    expect(pact.map((p) => p.slots)).toEqual([
      1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4,
    ])
    expect(pact.map((p) => p.slotLevel)).toEqual([
      1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
    ])
    for (const c of data.classes.filter((x) => x.spellcasting)) {
      const s = c.spellcasting!
      expect(ABILITIES, c.slug).toContain(s.ability)
      for (let i = 1; i < 20; i++)
        expect(s.prepared[i]!, `${c.slug} ${i + 1}`).toBeGreaterThanOrEqual(s.prepared[i - 1]!)
    }
  })

  it('has the PHB’s four subclasses per class, the Artificer’s five, and the later books’', () => {
    for (const c of data.classes) {
      const subs = data.subclasses.filter((s) => s.class === c.slug)
      const core = subs.filter((s) => s.srd || s.source === c.source || s.source === 'PHB 2024')
      expect(core.length, c.slug).toBe(c.slug === 'artificer' ? 5 : 4)
      expect(subs.filter((s) => s.srd).length, c.slug).toBe(c.srd ? 1 : 0)
      for (const s of subs) {
        expect(s.features.length, s.slug).toBeGreaterThan(2)
        // A few World of Warcraft subclasses also replace level 1–2 features (Death Coil).
        for (const f of s.features) {
          expect(f.level, `${s.slug}: ${f.name}`).toBeGreaterThanOrEqual(1)
          expect(f.level, `${s.slug}: ${f.name}`).toBeLessThanOrEqual(20)
        }
        expect(
          s.features.some((f) => f.level === c.subclassLevel),
          s.slug,
        ).toBe(true)
      }
    }
    const books = new Set(data.subclasses.map((s) => s.source))
    for (const b of ['Arcana Unleashed', 'World of Warcraft', 'Ravenloft: The Horrors Within'])
      expect(books, b).toContain(b)
    expect(data.subclasses.find((s) => s.slug === 'arcane-archer')?.optionGroups).toEqual([
      'arcane-shot',
    ])
  })

  it('asks for the pick behind every grouped subclass spell list', () => {
    for (const s of data.subclasses) {
      const groups = new Set((s.spells ?? []).flatMap((r) => (r.group ? [r.group] : [])))
      if (!groups.size) continue
      const picks = s.features.filter((f) =>
        f.choices?.some((c) => c.kind === 'option' && !c.group),
      )
      const names = new Set(picks.flatMap((f) => (f.options ?? []).map((o) => o.name)))
      for (const g of groups) expect(names, `${s.slug}: ${g}`).toContain(g)
    }
  })

  it('resolves every spell, feat and option group a record names', () => {
    for (const s of data.spells) {
      expect(s.level, s.slug).toBeGreaterThanOrEqual(0)
      expect(s.level, s.slug).toBeLessThanOrEqual(9)
      expect(s.classes.length + (s.extraLists?.length ?? 0), s.slug).toBeGreaterThan(0)
      for (const c of s.classes) expect(classSlugs, s.slug).toContain(c)
    }
    for (const s of data.subclasses) {
      for (const row of s.spells ?? [])
        for (const sp of row.spells) expect(spellSlugs, `${s.slug}: ${sp}`).toContain(sp)
      for (const g of s.optionGroups) expect(groupSlugs, s.slug).toContain(g)
    }
    for (const c of data.classes)
      for (const g of c.optionGroups) expect(groupSlugs, c.slug).toContain(g)
    for (const b of data.backgrounds) {
      expect(featSlugs, b.slug).toContain(b.feat.slug)
      for (const cat of b.featChoice?.category ?? [])
        expect(
          data.feats.some((f) => f.category === cat),
          `${b.slug}: ${cat}`,
        ).toBe(true)
      expect(b.abilities, b.slug).toHaveLength(3)
      expect(b.skills, b.slug).toHaveLength(2)
    }
    for (const sp of data.species)
      for (const l of sp.lineages?.options ?? [])
        for (const x of l.spells ?? [])
          expect(spellSlugs, `${sp.slug}: ${x.spell}`).toContain(x.spell)
    for (const [where, m] of mechanics()) {
      for (const g of m.grants ?? []) {
        if (g.kind === 'spell') expect(spellSlugs, where).toContain(g.spell)
        if (g.kind === 'feat') expect(featSlugs, where).toContain(g.feat)
      }
      for (const ch of m.choices ?? []) {
        expect(ch.count, where).toBeGreaterThan(0)
        if (ch.group) expect(groupSlugs, where).toContain(ch.group)
        if (ch.list) expect(classSlugs, where).toContain(ch.list)
        if (ch.kind === 'feat' && ch.from)
          for (const f of ch.from) expect(featSlugs, where).toContain(f)
        if (ch.kind === 'ability')
          for (const a of ch.from ?? []) expect(ABILITIES, where).toContain(a)
      }
      if (m.save) expect(ABILITIES, where).toContain(m.save.ability)
    }
  })

  it('gives every feat the fields the Feats tab filters and sorts on', () => {
    expect(data.feats.length).toBeGreaterThanOrEqual(200)
    for (const f of data.feats) {
      expect(
        [
          'origin',
          'general',
          'fighting-style',
          'epic-boon',
          'dragonmark',
          'planar-pact',
          'dark-gift',
        ],
        f.slug,
      ).toContain(f.category)
      expect(typeof f.repeatable, f.slug).toBe('boolean')
      if (f.prerequisite) {
        expect(f.prerequisite.text, f.slug).toBeTruthy()
        for (const c of f.prerequisite.classes ?? []) expect(classSlugs, f.slug).toContain(c)
        for (const a of f.prerequisite.abilities?.abilities ?? [])
          expect(ABILITIES, f.slug).toContain(a)
      }
      for (const a of f.asi?.abilities ?? []) expect(ABILITIES, f.slug).toContain(a)
    }
    const feat = (slug: string) => data.feats.find((f) => f.slug === slug)
    expect(feat('grappler')?.prerequisite).toMatchObject({
      level: 4,
      abilities: { abilities: ['STR', 'DEX'], min: 13, any: true },
    })
    expect(feat('ability-score-improvement')?.repeatable).toBe(true)
    expect(feat('boon-of-fate')?.category).toBe('epic-boon')
    expect(feat('boon-of-fate')?.asi?.max).toBe(30)
    for (const f of data.feats.filter((x) => x.category === 'general'))
      expect(f.prerequisite?.level, f.slug).toBeGreaterThanOrEqual(4)
    // The user's report: Arcana Unleashed's feats (Portal Jumper and the rest).
    expect(feat('portal-jumper')).toMatchObject({
      category: 'origin',
      source: 'Arcana Unleashed',
      srd: false,
    })
    expect(data.feats.filter((f) => f.source === 'Arcana Unleashed').length).toBe(29)
  })

  it('reads the spell facts the play engine needs', () => {
    const spell = (slug: string) => data.spells.find((s) => s.slug === slug)!
    expect(spell('fireball')).toMatchObject({
      level: 3,
      school: 'Evocation',
      save: 'DEX',
      damage: [{ dice: '8d6', type: 'Fire' }],
      scaling: { kind: 'slot', dice: '1d6' },
      concentration: false,
    })
    expect(spell('fire-bolt')).toMatchObject({
      level: 0,
      attack: 'ranged',
      scaling: { kind: 'cantrip' },
    })
    expect(spell('cure-wounds').healing).toBe('2d8')
    expect(spell('shield')).toMatchObject({ activation: 'reaction' })
    expect(spell('detect-magic')).toMatchObject({ ritual: true, concentration: true })
    expect(spell('revivify').components).toMatchObject({
      m: expect.stringContaining('300'),
      cost: 300,
      consumed: true,
    })
    expect(spell('acid-arrow').srd).toBe(true)
  })

  it('has the SRD equipment with its numbers', () => {
    const weapon = (slug: string) => data.weapons.find((w) => w.slug === slug)!
    expect(weapon('longsword')).toMatchObject({
      category: 'Martial',
      type: 'Melee',
      damage: '1d8',
      damageType: 'Slashing',
      versatile: '1d10',
      mastery: 'Sap',
      cost: 1500,
    })
    expect(weapon('longbow')).toMatchObject({
      range: { normal: 150, long: 600 },
      ammunition: 'Arrow',
      properties: ['Ammunition', 'Heavy', 'Two-Handed'],
    })
    const armor = (slug: string) => data.armor.find((a) => a.slug === slug)!
    expect(armor('plate-armor')).toMatchObject({
      category: 'Heavy',
      ac: 18,
      dex: 'none',
      strength: 15,
      stealthDisadvantage: true,
    })
    expect(armor('half-plate-armor')).toMatchObject({ ac: 15, dex: 'max2' })
    expect(armor('shield')).toMatchObject({ category: 'Shield', ac: 2 })
    expect(data.masteries.map((m) => m.name)).toEqual([
      'Cleave',
      'Graze',
      'Nick',
      'Push',
      'Sap',
      'Slow',
      'Topple',
      'Vex',
    ])
    expect(data.conditions.map((c) => c.name)).toContain('Exhaustion')
  })
})

// The user's licensing call (2026-11-25): SRD entries keep their SRD text; everything else is
// mechanics plus Lantern's own summaries.
describe('5e licensing', () => {
  const KINDS: Record<string, string> = {
    classes: 'classes',
    subclasses: 'subclasses',
    species: 'species',
    backgrounds: 'backgrounds',
    feats: 'feats',
    spells: 'spells',
    magicItems: 'magicItems',
    conditions: 'conditions',
    masteries: 'masteries',
    weapons: 'weapons',
    armor: 'armor',
    gear: 'gear',
    'options/eldritch-invocations': 'invocations',
    'options/metamagic': 'metamagic',
  }

  it('lists only entries the SRD prints as SRD entries', () => {
    for (const [set, rows] of records()) {
      const srdRows = rows.filter((r) => r.srd)
      if (!srdRows.length) continue
      const list = allow[KINDS[set] ?? '']
      expect(list, `allowlist for ${set}`).toBeDefined()
      for (const r of srdRows) expect(list, `${set}: ${r.name}`).toContain(r.name)
    }
    const feature = new Set(allow['features'])
    for (const c of data.classes.filter((x) => x.srd))
      for (const f of c.features.filter((x) => x.srd))
        expect(feature, `${c.name}: ${f.name}`).toContain(`${c.name}: ${f.level}: ${f.name}`)
    for (const s of data.subclasses.filter((x) => x.srd))
      for (const f of s.features.filter((x) => x.srd))
        expect(feature, `${s.name}: ${f.name}`).toContain(`${s.name}: ${f.level}: ${f.name}`)
  })

  const WIKI = join(root, '.local', 'dnd5e', 'wikidot')
  it.skipIf(!existsSync(WIKI) || !readdirSync(WIKI).length)(
    'never shares 8 words in a row with the wiki page a non-SRD entry came from',
    () => {
      // Runs the SRD itself prints are open rules wording, not copying.
      const open = new Set<string>()
      for (const [, rows] of records())
        for (const r of rows) if (r.text) for (const x of runs(r.text)) open.add(x)
      for (const c of [...data.classes, ...data.subclasses])
        for (const f of c.features) if (f.text) for (const x of runs(f.text)) open.add(x)
      const rulesDir = join(root, 'data', 'rules', 'dnd5e')
      for (const f of readdirSync(rulesDir))
        for (const x of runs(readFileSync(join(rulesDir, f), 'utf8'))) open.add(x)

      const pages = new Map<string, Set<string>>()
      const source = (page: string) => {
        if (!pages.has(page)) {
          const html = cachedPage(WIKI, page)
          pages.set(page, html ? runs(plainText(pageContent(html))) : new Set())
        }
        return pages.get(page)!
      }
      const checked: string[] = []
      const check = (where: string, page: string | undefined, entry: unknown) => {
        if (!page) return
        for (const t of prose(entry)) {
          checked.push(where)
          expect(copiedRuns(t, source(page), open), `${where}: ${t}`).toEqual([])
        }
      }
      for (const [set, rows] of records())
        for (const r of rows) if (!r.srd) check(`${set}/${r.slug}`, r.wiki, r)
      expect(checked.length).toBeGreaterThan(300)

      // Every other string in a non-SRD entry too, but the stat lines and item lists, which are
      // facts in the book's own terms (a casting time's trigger, a material component, gear, a
      // prerequisite line, an item's type line, a species' size line).
      const FACTS = new Set([
        'castingTime',
        'trigger',
        'range',
        'duration',
        'm',
        'items',
        'name',
        'prerequisite',
        'category',
        'sizeText',
      ])
      for (const [set, rows] of records())
        for (const r of rows.filter((x) => !x.srd && x.wiki)) {
          const strings: string[] = []
          const walk = (v: unknown, k = ''): void => {
            if (typeof v === 'string') {
              if (!FACTS.has(k)) strings.push(v)
            } else if (Array.isArray(v)) v.forEach((x) => walk(x, k))
            else if (v && typeof v === 'object' && (v as { srd?: boolean }).srd !== true)
              for (const [kk, x] of Object.entries(v)) if (!FACTS.has(kk)) walk(x, kk)
          }
          walk(r)
          for (const t of strings)
            expect(copiedRuns(t, source(r.wiki!), open), `${set}/${r.slug}: ${t}`).toEqual([])
        }
    },
  )
})
