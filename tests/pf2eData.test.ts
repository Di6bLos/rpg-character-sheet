import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type Pf2eData, loadPf2e } from '../data/pf2e'

const dir = join(import.meta.dirname, '..', 'data', 'pf2e', 'generated')
const load = <K extends keyof Pf2eData>(set: K): Pf2eData[K] =>
  JSON.parse(readFileSync(join(dir, `${set}.json`), 'utf8'))

const data = {
  actions: load('actions'),
  ancestries: load('ancestries'),
  armor: load('armor'),
  backgrounds: load('backgrounds'),
  classes: load('classes'),
  conditions: load('conditions'),
  deities: load('deities'),
  feats: load('feats'),
  heritages: load('heritages'),
  shields: load('shields'),
  spells: load('spells'),
  traits: load('traits'),
  weapons: load('weapons'),
}
const classNames = new Set(data.classes.map((c) => c.name))
const featNames = new Set(data.feats.map((f) => f.name))

describe('pf2e data', () => {
  it.each(Object.entries(data))('%s: unique ids, a source page, rules text', (_, rows) => {
    expect(rows.length).toBeGreaterThan(0)
    const records = rows as Pf2eData['traits']
    expect(new Set(records.map((r) => r.id)).size).toBe(records.length)
    for (const r of records) {
      expect(r.source.book, r.id).not.toBe('')
      expect(r, r.id).not.toHaveProperty('deity')
    }
  })

  it('cites a printed page, except a few web-only articles', () => {
    for (const set of [
      'classes',
      'ancestries',
      'backgrounds',
      'spells',
      'actions',
      'conditions',
    ] as const)
      for (const r of data[set]) expect(r.source.page, r.id).toBeGreaterThan(0)
    const pageless = [...data.feats, ...data.heritages].filter((r) => !r.source.page)
    expect(pageless.length).toBeLessThan(20)
  })

  it('has the Player Core and Player Core 2 classes', () => {
    for (const c of [
      'Bard',
      'Cleric',
      'Druid',
      'Fighter',
      'Ranger',
      'Rogue',
      'Witch',
      'Wizard',
      'Alchemist',
      'Barbarian',
      'Champion',
      'Investigator',
      'Monk',
      'Oracle',
      'Sorcerer',
      'Swashbuckler',
    ])
      expect(classNames, c).toContain(c)
  })

  it.each(data.classes.map((c) => [c.name, c] as const))(
    '%s: levels 1–20 and its build numbers',
    (_, c) => {
      expect(c.advancement.map((a) => a.level)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1))
      expect(c.keyAttributes.length).toBeGreaterThan(0)
      expect(c.hp).toBeGreaterThan(0)
      for (const f of c.features) expect(f.level, f.name).toBeGreaterThanOrEqual(1)
      for (const row of c.spellSlots ?? []) {
        expect(row.slots).toHaveLength(10)
        expect(row.cantrips, `${c.name} ${row.level}`).toBeGreaterThan(0)
      }
      if (c.spellSlots) expect(c.traditions.length + c.subclasses.length, c.name).toBeGreaterThan(0)
    },
  )

  it('names feats by classes and ancestries that exist', () => {
    const lists = new Set([
      ...data.ancestries.map((a) => a.name),
      ...data.heritages.map((h) => h.name),
    ])
    for (const f of data.feats) {
      expect(f.level, f.name).toBeGreaterThanOrEqual(1)
      for (const c of f.classes) expect(classNames, f.name).toContain(c)
      for (const a of f.ancestries) expect(lists, f.name).toContain(a)
    }
  })

  it('links heritages to ancestries that exist', () => {
    const slugs = new Set(data.ancestries.map((a) => a.slug))
    for (const h of data.heritages) if (h.ancestry) expect(slugs, h.name).toContain(h.ancestry)
    expect(data.heritages.filter((h) => !h.ancestry && !h.versatile).length).toBeLessThan(40)
  })

  it('gives each background two boost choices and skill feats that exist', () => {
    for (const b of data.backgrounds) {
      for (const f of b.feats) expect(featNames, `${b.name}: ${f}`).toContain(f)
    }
  })

  it('reads spell stats from the stat lines', () => {
    const fireball = data.spells.find((s) => s.name === 'Fireball')
    expect(fireball).toMatchObject({
      rank: 3,
      kind: 'spell',
      actions: 2,
      range: '500 feet',
      area: '20-foot burst',
      defense: 'basic Reflex',
      heightened: { step: 1 },
      traditions: ['Arcane', 'Primal'],
    })
    for (const s of data.spells) {
      expect(s.rank, s.name).toBeGreaterThanOrEqual(1)
      expect(s.rank, s.name).toBeLessThanOrEqual(10)
      if (s.kind === 'cantrip') expect(s.traits, s.name).toContain('Cantrip')
      for (const c of s.classes) expect(classNames, s.name).toContain(c)
    }
  })

  it('keeps weapon, armor and shield statistics', () => {
    expect(data.weapons.find((w) => w.name === 'Longsword')).toMatchObject({
      damage: '1d8',
      category: 'Martial',
      group: 'Sword',
      type: 'Melee',
      price: 100,
    })
    expect(data.armor.find((a) => a.name === 'Chain Mail')).toMatchObject({
      ac: 4,
      dexCap: 1,
      checkPenalty: -2,
      speedPenalty: -5,
      strength: 3,
    })
    expect(data.shields.find((s) => s.name === 'Steel Shield')).toMatchObject({
      ac: 2,
      hardness: 5,
      hp: 20,
    })
  })

  it('gives deities what a cleric needs', () => {
    const sarenrae = data.deities.find((d) => d.name === 'Sarenrae')
    expect(sarenrae).toMatchObject({
      attributes: ['CON', 'WIS'],
      divineFont: ['Heal'],
      favoredWeapons: ['Scimitar'],
      domains: expect.arrayContaining(['Fire', 'Healing', 'Sun', 'Truth']),
    })
    // Some remastered deities still list spells only printed in legacy books.
    const spellNames = new Set(data.spells.map((s) => s.name))
    const legacyOnly = new Set(
      data.deities.flatMap((d) => d.clericSpells).filter((s) => !spellNames.has(s)),
    )
    expect(legacyOnly.size).toBeLessThan(25)
    for (const d of data.deities.filter((x) => x.divineFont.length))
      expect(d.domains.length, d.name).toBeGreaterThan(0)
  })

  it('marks the valued conditions', () => {
    const valued = data.conditions.filter((c) => c.valued).map((c) => c.name)
    expect(valued).toEqual(
      expect.arrayContaining(['Frightened', 'Clumsy', 'Dying', 'Wounded', 'Doomed']),
    )
    expect(valued).not.toContain('Prone')
  })
})

describe('loadPf2e', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('fetches a set once and shares it', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(data.conditions)))
    vi.stubGlobal('fetch', fetch)
    const [a, b] = await Promise.all([loadPf2e('conditions'), loadPf2e('conditions')])
    expect(a).toEqual(data.conditions)
    expect(b).toBe(a)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('fails loudly and fetches again after a failure', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(data.shields)))
    vi.stubGlobal('fetch', fetch)
    await expect(loadPf2e('shields')).rejects.toThrow('PF2e shields data: HTTP 404')
    await expect(loadPf2e('shields')).resolves.toEqual(data.shields)
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
