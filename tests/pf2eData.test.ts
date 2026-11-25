import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type Pf2eData, loadPf2e } from '../data/pf2e'
import { openBook, settingName } from '../scripts/lib/aon'

const dir = join(import.meta.dirname, '..', 'data', 'pf2e', 'generated')
const load = <K extends keyof Pf2eData>(set: K): Pf2eData[K] =>
  JSON.parse(readFileSync(join(dir, `${set}.json`), 'utf8'))

const data = {
  actions: load('actions'),
  ancestries: load('ancestries'),
  archetypes: load('archetypes'),
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
const subclasses = data.classes.flatMap((c) => c.subclasses)
const dupes = (keys: string[]) => keys.filter((k, i) => keys.indexOf(k) !== i)

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

  it('keeps one record per entry: no superseded printings, no reprints', () => {
    const byName = [
      'ancestries',
      'heritages',
      'backgrounds',
      'spells',
      'weapons',
      'armor',
      'shields',
      'conditions',
      'actions',
      'traits',
    ] as const
    for (const set of byName)
      expect(dupes(data[set].map((r) => r.name.toLowerCase())), set).toEqual([])
    // Feats share names across classes and archetypes (Watch Your Back: rogue 6, Golden
    // Legionnaire 14), so a feat is its name, level and traits.
    expect(
      dupes(data.feats.map((f) => `${f.name.toLowerCase()}:${f.level}:${[...f.traits].sort()}`)),
    ).toEqual([])
    // Lissala has two aspects, each with its own entry and epithet.
    expect(dupes(data.deities.map((d) => `${d.name}:${d.epithet}`))).toEqual([])
    expect(data.deities.filter((d) => d.name === 'Lissala')).toHaveLength(2)
    expect(dupes(subclasses.map((o) => `${o.kind}:${o.name}`))).toEqual([])
    for (const rows of Object.values(data))
      for (const r of rows as Pf2eData['traits'])
        expect(JSON.stringify(r), r.id).not.toMatch(/more recent version/i)
  })

  // The user's licensing call: deities are the one Reserved Material kept (Community Use
  // Policy); nothing else comes from a Golarion setting book or is named for its deities,
  // places or organizations. See .claude/skills/rpg-rules/references/licensing.md.
  it('keeps Golarion setting material out, deities aside', () => {
    const deityNames = data.deities.map((d) => d.name)
    const { deities: _deities, ...rest } = data
    const records = [...Object.values(rest).flat(), ...subclasses] as Pf2eData['traits']
    for (const r of records) {
      expect(openBook(r.source.book), `${r.name}: ${r.source.book}`).toBe(true)
      expect(settingName(r.name, deityNames), r.name).toBeUndefined()
    }
    for (const c of data.classes)
      for (const f of c.features) expect(settingName(f.name, deityNames), f.name).toBeUndefined()
    expect(data.deities.length).toBeGreaterThan(0)
  })

  // A setting archetype (Hellknight, Red Mantis Assassin, Aldori Duelist) has no feats of its
  // own in the data, so a feat that still names one, or names a Golarion noun, fails here.
  it('names only archetypes that are in the data themselves', () => {
    const deityNames = data.deities.map((d) => d.name)
    const own = new Set(
      data.feats
        .filter((f) => f.traits.includes('Archetype') || f.traits.includes('Mythic'))
        .flatMap((f) => f.archetypes),
    )
    for (const f of data.feats)
      for (const a of f.archetypes) {
        expect(own, `${f.name}: ${a}`).toContain(a)
        expect(settingName(a, deityNames), `${f.name}: ${a}`).toBeUndefined()
      }
    for (const a of ['Hellknight', 'Red Mantis Assassin', 'Aldori Duelist', 'Eagle Knight'])
      expect(
        data.feats.some((f) => f.archetypes.includes(a)),
        a,
      ).toBe(false)
  })

  it('has a record for every archetype a feat names, with its dedication', () => {
    const deityNames = data.deities.map((d) => d.name)
    const names = new Set(data.archetypes.map((a) => a.name))
    for (const a of new Set(data.feats.flatMap((f) => f.archetypes))) expect(names, a).toContain(a)
    for (const a of data.archetypes) {
      expect(settingName(a.name, deityNames), a.name).toBeUndefined()
      expect(openBook(a.source.book), a.name).toBe(true)
      for (const para of a.text.split(/\n{2,}/))
        expect(settingName(para, deityNames), `${a.name}: ${para}`).toBeUndefined()
    }
    const byName = (n: string) => data.archetypes.find((a) => a.name === n)!
    // Player Core p. 219: the fighter archetype, its dedication a 2nd-level feat.
    expect(byName('Fighter')).toMatchObject({ level: 2, categories: ['Multiclass'] })
    expect(data.feats.find((f) => f.id === byName('Fighter').dedication)?.name).toBe(
      'Fighter Dedication',
    )
    // Player Core p. 159, Player Core 2 p. 188: Advanced Warden is a 6th-level Beastmaster feat.
    expect(data.feats.find((f) => f.name === 'Advanced Warden')?.archetypeLevels).toEqual({
      Beastmaster: 6,
    })
  })

  it('has rules text for every trait, spoiler notes aside', () => {
    for (const t of data.traits) expect(t.text, t.name).not.toBe('')
    for (const rows of Object.values(data))
      for (const r of rows as Pf2eData['traits'])
        expect(r.text, r.name).not.toMatch(/Nethys Note:[^*]*spoilers/i)
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
      if (c.spellSlots)
        expect(c.spellSlots.map((r) => r.level)).toEqual(
          Array.from({ length: 20 }, (_, i) => i + 1),
        )
      for (const row of c.spellSlots ?? []) {
        expect(row.slots).toHaveLength(10)
        expect(row.cantrips, `${c.name} ${row.level}`).toBeGreaterThan(0)
      }
      if (c.spellSlots) expect(c.traditions.length + c.subclasses.length, c.name).toBeGreaterThan(0)
    },
  )

  it('reads the class table as the book lists it', () => {
    const kineticist = data.classes.find((c) => c.name === 'Kineticist')!
    expect(kineticist.advancement[0]?.features).toContain(
      'impulses (Elemental Blast, Base Kinesis)',
    )
    // One apostrophe everywhere, so a table entry finds its feature by name.
    for (const c of data.classes) {
      const table = new Set(c.advancement.flatMap((a) => a.features.map((f) => f.toLowerCase())))
      for (const f of [...c.features.map((x) => x.name), ...table]) expect(f).not.toMatch(/[‘’]/)
      expect(table.has("hunter's edge") || c.name !== 'Ranger').toBe(true)
    }
  })

  it('keeps the stat lines a class option needs', () => {
    const option = (name: string) => subclasses.find((o) => o.name === name)
    expect(option('Construct')?.skills).toEqual(['Intimidation', 'Stealth', 'Survival'])
    expect(option('Lesson of Life')).toMatchObject({ lessonType: 'Basic' })
    expect(option('Defensive Retreat')).toMatchObject({ tacticType: 'Mobility' })
    expect(option('Angel')).toMatchObject({ tradition: 'Divine' })
    expect(option('Angel')?.homePlane).toMatch(/Heaven/)
    for (const o of subclasses.filter(
      (x) => x.kind.startsWith('Exemplar') && x.kind.endsWith('Ikon'),
    ))
      expect(o.usage, o.name).toBeTruthy()
  })

  it("says what AoN's druidic orders leave out instead of inventing it", () => {
    const orders = subclasses.filter((o) => o.kind === 'Druidic Order')
    expect(orders.length).toBeGreaterThan(0)
    for (const o of orders) expect(o.gap, o.name).toMatch(/order spell/)
    const gaps = [...data.ancestries, ...subclasses].filter((r) => r.gap).map((r) => r.name)
    expect(gaps.sort()).toEqual(['Awakened Animal', 'Merfolk', ...orders.map((o) => o.name)].sort())
  })

  it('gives ancestries boosts, Hit Points and Speed a builder can use', () => {
    for (const a of data.ancestries) {
      for (const b of a.boosts)
        expect(
          ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma', 'Free'],
          a.name,
        ).toContain(b)
      if (!a.gap) expect(a.hp * a.speed, a.name).toBeGreaterThan(0)
    }
    expect(data.ancestries.find((a) => a.name === 'Human')?.boosts).toEqual(['Free', 'Free'])
    expect(data.heritages.find((h) => h.name === 'Climbing Animal')?.speeds).toEqual({
      land: 20,
      climb: 20,
    })
  })

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
    expect(data.heritages.filter((h) => !h.ancestry && !h.versatile).map((h) => h.name)).toEqual([])
    const of = (name: string) => data.heritages.find((h) => h.name === name)?.ancestry
    // Its name says no ancestry; it prints two pages after Awakened Animal.
    expect(of('Climbing Animal')).toBe('awakened-animal')
    for (const a of data.ancestries)
      expect(
        data.heritages.some((h) => h.ancestry === a.slug),
        a.name,
      ).toBe(true)
  })

  // The builder reads a background without listed boosts from its text: "You gain N free
  // attribute boosts" (Amnesiac) or "Choose N attribute boosts." (Feral Child).
  it('gives each background boosts the builder can read, and skill feats that exist', () => {
    const boostText =
      /You gain \w+ free (?:attribute|ability) boosts?|Choose \w+ (?:attribute|ability) boosts?\./i
    for (const b of data.backgrounds) {
      if (b.boosts.length < 2) expect(b.text, b.name).toMatch(boostText)
      for (const s of b.skills) expect(s, b.name).not.toMatch(/[<>[\]]/)
      for (const f of b.feats) expect(featNames, `${b.name}: ${f}`).toContain(f)
    }
  })

  // Every "You're trained in…" ends up somewhere the builder reads: a skill, a choice, or the
  // deity's skill (The Hunted's Stealth and Survival were missing from AoN's field).
  it('gives each background that trains a skill its skills or a skill choice', () => {
    for (const b of data.backgrounds)
      if (/\btrained in\b/i.test(b.text))
        expect(
          b.skills.length + (b.skillChoices?.length ?? 0) + (b.deitySkill ? 1 : 0),
          b.name,
        ).toBeGreaterThan(0)
    const named = (n: string) => data.backgrounds.find((b) => b.name === n)!
    expect(named('The Hunted').skills).toEqual(['Stealth', 'Survival'])
    expect(named('Scholar').skillChoices).toEqual([
      { options: ['Arcana', 'Nature', 'Occultism', 'Religion'], count: 1 },
    ])
    // A choice isn't also listed as trained (AoN's field gives a hermit both).
    expect(named('Hermit').skills).not.toContain('Nature')
    expect(named('Raised by Belief').deitySkill).toBe(true)
    for (const b of data.backgrounds)
      for (const ch of b.skillChoices ?? [])
        for (const o of ch.options) expect(b.skills, `${b.name}: ${o}`).not.toContain(o)
  })

  it('reads spell stats from their stat lines (Fireball as printed)', () => {
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
      for (const v of [s.range, s.area, s.targets, s.duration, s.defense, s.cost])
        expect(v ?? '', s.name).not.toMatch(/\*\*|<|\]\(/)
    }
  })

  it("makes a domain, bloodline, mystery or lesson spell that class's focus spell", () => {
    const owner = {
      domains: 'Cleric',
      bloodlines: 'Sorcerer',
      mysteries: 'Oracle',
      lessons: 'Witch',
    }
    for (const s of data.spells.filter((x) => x.kind === 'focus'))
      for (const [field, cls] of Object.entries(owner))
        if (s[field as keyof typeof owner]?.length) expect(s.classes, s.name).toContain(cls)
    expect(
      data.spells.filter((s) => s.kind === 'focus' && s.domains?.length).length,
    ).toBeGreaterThan(0)
  })

  it('reads heightening as printed: a step, fixed ranks, or both', () => {
    const spell = (name: string) => data.spells.find((s) => s.name === name)
    expect(spell('Fireball')?.heightened).toEqual({ step: 1, ranks: [] })
    expect(spell('Aerial Form')?.heightened).toEqual({ ranks: [5, 6] })
    expect(spell('Glimpse Weakness')?.ampHeightened).toEqual({ step: 2, ranks: [] })
    for (const s of data.spells)
      for (const r of s.heightened?.ranks ?? []) expect(r).toBeGreaterThan(s.rank)
  })

  it("writes action costs in the type's words, never AoN's", () => {
    expect(data.spells.find((s) => s.name === 'Heal')?.actions).toBe('1 to 3')
    for (const r of [...data.spells, ...data.feats, ...data.actions])
      expect(String(r.actions ?? ''), r.name).not.toMatch(/Action/)
    expect(data.actions.find((a) => a.name === 'Quick Tincture')?.cost).toBe('1 versatile vial')
    expect(data.feats.find((f) => f.name === 'Clan Pistol')?.access).toMatch(/^You are from/)
    expect(data.spells.find((s) => s.name === 'Raise Dead')?.cost).toMatch(/gemstones/)
  })

  it('keeps weapon, armor and shield statistics', () => {
    expect(data.weapons.find((w) => w.name === 'Longsword')).toMatchObject({
      damage: '1d8',
      category: 'Martial',
      group: 'Sword',
      type: 'Melee',
      price: 100,
    })
    expect(data.weapons.find((w) => w.name === 'Backpack Ballista')?.reload).toBe('1 minute')
    for (const r of [...data.weapons, ...data.armor, ...data.shields])
      expect(r.text, r.name).not.toMatch(/Specific Magic (Weapons|Armor|Shields)/)
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
    // Deities also list spells printed only in legacy or Golarion setting books, which the data
    // leaves out (39 of 292 names today).
    const spellNames = new Set(data.spells.map((s) => s.name))
    const legacyOnly = new Set(
      data.deities.flatMap((d) => d.clericSpells).filter((s) => !spellNames.has(s)),
    )
    expect(legacyOnly.size).toBeLessThan(50)
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
