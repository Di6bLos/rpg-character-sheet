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
  armor: load('armor'),
  backgrounds: load('backgrounds'),
  classes: load('classes'),
  conditions: load('conditions'),
  consumables: load('consumables'),
  deities: load('deities'),
  feats: load('feats'),
  gear: load('gear'),
  heritages: load('heritages'),
  magicItems: load('magicItems'),
  runes: load('runes'),
  shields: load('shields'),
  spells: load('spells'),
  staves: load('staves'),
  traits: load('traits'),
  wands: load('wands'),
  weapons: load('weapons'),
}
const items = [
  ...data.gear,
  ...data.consumables,
  ...data.magicItems,
  ...data.runes,
  ...data.staves,
  ...data.wands,
]
const item = (name: string) => items.find((i) => i.name === name)
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
      'gear',
      'consumables',
      'magicItems',
      'runes',
      'staves',
      'wands',
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

  // Items named for deities and places (Treasure Vault's Rovagug's Mud and Achaekek's Kiss,
  // GM Core's Frozen Lava of Mhar Massif) stay out; a writing set (Player Core p. 292) is not
  // named for the deity Set.
  it('leaves setting-named items out of every item set', () => {
    for (const name of [
      "Rovagug's Mud",
      "Achaekek's Kiss",
      'Bellflower Toolbelt',
      'Frozen Lava of Mhar Massif',
      "Eternal Eruption of Droskar's Crag",
    ])
      expect(item(name), name).toBeUndefined()
    expect(item('Writing Set')?.source).toEqual({ book: 'Player Core', page: 292 })
    for (const i of items) expect(i.text, i.name).not.toMatch(/Core Rulebook pg\./)
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

  // AoN files many Player Core weapons under a later setting reprint (the spear and staff under
  // Tian Xia Character Guide); they are Player Core's and must be in the data, cited in an open
  // book (Player Core, or an open reprint such as Treasure Vault's bola).
  it('has every weapon in Player Core’s tables (pp. 277–280)', () => {
    const table = {
      Simple: [
        'Blowgun',
        'Clan Dagger',
        'Club',
        'Crossbow',
        'Dagger',
        'Dart',
        'Gauntlet',
        'Hand Crossbow',
        'Heavy Crossbow',
        'Javelin',
        'Katar',
        'Light Mace',
        'Longspear',
        'Mace',
        'Morningstar',
        'Sickle',
        'Sling',
        'Spear',
        'Spiked Gauntlet',
        'Staff',
      ],
      Martial: [
        'Alchemical Bomb',
        'Arbalest',
        'Bastard Sword',
        'Battle Axe',
        'Bo Staff',
        'Bola',
        'Composite Longbow',
        'Composite Shortbow',
        'Dogslicer',
        'Elven Curve Blade',
        'Falchion',
        "Filcher's Fork",
        'Flail',
        'Glaive',
        'Gnome Hooked Hammer',
        'Greataxe',
        'Greatclub',
        'Greatpick',
        'Greatsword',
        'Guisarme',
        'Halberd',
        'Halfling Sling Staff',
        'Hatchet',
        'Horsechopper',
        'Kama',
        'Katana',
        'Khakkhara',
        'Kukri',
        'Lance',
        'Light Hammer',
        'Light Pick',
        'Longbow',
        'Longsword',
        'Main-gauche',
        'Maul',
        'Nunchaku',
        'Orc Knuckle Dagger',
        'Pick',
        'Ranseur',
        'Rapier',
        'Sai',
        'Sap',
        'Scimitar',
        'Scythe',
        'Shield Bash',
        'Shield Boss',
        'Shield Spikes',
        'Shortbow',
        'Shortsword',
        'Shuriken',
        'Spiked Chain',
        'Starknife',
        'Sword Cane',
        'Temple Sword',
        'Trident',
        'Wakizashi',
        'War Flail',
        'Warhammer',
        'Whip',
      ],
      Advanced: ['Dwarven Waraxe', 'Gnome Flickmace', 'Orc Necksplitter', 'Sawtooth Saber'],
      Ammunition: ['Arrows', 'Blowgun Darts', 'Bolts', 'Sling Bullets'],
    }
    for (const [category, names] of Object.entries(table))
      for (const name of names) {
        const w = data.weapons.find((x) => x.name === name)
        expect(w?.category, name).toBe(category)
        expect(openBook(w?.source.book), name).toBe(true)
      }
    expect(data.weapons.find((w) => w.name === 'Staff')).toMatchObject({
      source: { book: 'Player Core', page: 277 },
      damage: '1d4',
      traits: ['Monk', 'Two-Hand'],
    })
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

  it('keeps every item a price, level, Bulk and a kind its set holds', () => {
    const kinds: Record<string, string[]> = {
      gear: ['gear'],
      consumables: ['potion', 'elixir', 'scroll', 'talisman', 'ammunition', 'oil', 'bomb'],
      magicItems: ['held', 'worn'],
      runes: ['rune'],
      staves: ['staff'],
      wands: ['wand'],
    }
    for (const [set, allowed] of Object.entries(kinds))
      for (const i of data[set as 'gear']) {
        expect(allowed, `${set}: ${i.name}`).toContain(i.kind)
        expect(i.price, i.name).toBeGreaterThanOrEqual(0)
        expect(i.level, i.name).toBeGreaterThanOrEqual(0)
        expect(i.bulk, i.name).toBeGreaterThanOrEqual(0)
        expect(i.source.page, i.name).toBeGreaterThan(0)
        for (const a of i.activations) expect(String(a.actions ?? ''), i.name).not.toMatch(/Action/)
      }
    for (const k of kinds.consumables!)
      expect(
        data.consumables.some((i) => i.kind === k),
        k,
      ).toBe(true)
  })

  it('reads consumables as printed (GM Core pp. 244–262, Player Core 2 pp. 283–289)', () => {
    expect(item('Healing Potion (Minor)')).toMatchObject({
      kind: 'potion',
      level: 1,
      price: 400,
      bulk: 0.1,
      healing: '1d8',
      source: { book: 'GM Core', page: 259 },
      activations: [{ actions: 1, traits: ['manipulate'] }],
    })
    expect(item('Healing Potion (Lesser)')).toMatchObject({
      level: 3,
      price: 1200,
      healing: '2d8+5',
    })
    expect(item('Healing Potion (Major)')?.healing).toBe('8d8+30')
    expect(item("Alchemist's Fire (Lesser)")).toMatchObject({
      kind: 'bomb',
      price: 300,
      bomb: {
        damage: { dice: '1d8', type: 'fire' },
        persistent: { dice: '1', type: 'fire' },
        splash: 1,
      },
      activations: [{ actions: 1, as: 'Strike' }],
    })
    expect(item("Alchemist's Fire (Moderate)")?.bomb).toMatchObject({
      damage: { dice: '2d8' },
      attack: 1,
    })
    expect(item('Eagle-Eye Elixir (Lesser)')).toMatchObject({
      bonuses: [{ value: 1, type: 'item', selector: 'perception' }],
      duration: '1 hour',
    })
    expect(item('Cognitive Mutagen (Moderate)')).toMatchObject({
      bonuses: [
        { value: 2, selector: 'skills', skills: ['Arcana', 'Crafting', 'Occultism', 'Society'] },
      ],
      duration: '10 minutes',
    })
    expect(item('1st-rank Scroll')).toMatchObject({ level: 1, price: 400, spellRank: 1 })
    expect(item('10th-rank Scroll')).toMatchObject({ level: 19, price: 800000, spellRank: 10 })
  })

  it('reads runes as printed (GM Core pp. 226, 236–237)', () => {
    expect(item('Weapon Potency (+1)')).toMatchObject({
      level: 2,
      price: 3500,
      rune: { slot: 'potency', onto: 'weapon', value: 1 },
    })
    expect(item('Striking')).toMatchObject({
      level: 4,
      price: 6500,
      rune: { slot: 'striking', value: 1 },
    })
    expect(item('Striking (Major)')?.rune?.value).toBe(3)
    expect(item('Armor Potency (+1)')).toMatchObject({
      level: 5,
      price: 16000,
      rune: { onto: 'armor', value: 1 },
    })
    expect(item('Resilient')).toMatchObject({
      level: 8,
      price: 34000,
      rune: { slot: 'resilient', value: 1 },
    })
    expect(item('Flaming')).toMatchObject({
      level: 8,
      price: 50000,
      rune: { slot: 'property', damage: { dice: '1d6', type: 'fire' } },
    })
    expect(item('Flaming')?.rune?.crit).toMatch(/1d10 persistent fire damage on a critical hit/)
    for (const r of data.runes) expect(r.rune?.usage, r.name).toMatch(/^etched (?:onto|into)/)
  })

  it('reads staves, wands and worn items as printed (GM Core pp. 279–286)', () => {
    expect(item('Staff of Fire')).toMatchObject({
      level: 3,
      price: 6000,
      spells: [
        { rank: 0, names: ['Ignition'] },
        { rank: 1, names: ['Breathe Fire'] },
      ],
    })
    const greater = item('Staff of Fire (Greater)')?.spells
    expect(greater?.find((r) => r.rank === 1)?.names).toEqual(['Breathe Fire'])
    expect(greater?.find((r) => r.rank === 3)?.names).toEqual(['Floating Flame', 'Fireball'])
    // Staff spells are the data's spells (a limit in brackets aside), except legacy names a
    // reprinted staff still prints (Dragonprism Staff's burning hands).
    const spellNames = new Set(data.spells.map((sp) => sp.name))
    const listed = data.staves.flatMap((st) => (st.spells ?? []).flatMap((r) => r.names))
    const unknown = listed.filter((n) => !spellNames.has(n.replace(/\s*\([^)]*\)$/, '')))
    expect(unknown.length / listed.length).toBeLessThan(0.05)
    expect(greater?.find((r) => r.rank === 0)?.names).toEqual(['Ignition'])
    expect(item('Magic Wand (1st-rank Spell)')).toMatchObject({
      level: 3,
      price: 6000,
      spellRank: 1,
      activations: [{ as: 'Cast a Spell', frequency: 'once per day, plus overcharge' }],
    })
    expect(item('Boots of Bounding')).toMatchObject({
      kind: 'worn',
      traits: ['Invested', 'Magical'],
      bonuses: [
        { value: 5, type: 'item', selector: 'speed' },
        { selector: 'skills', when: expect.any(String) },
      ],
    })
    // An activation's bonus is for its trigger, not a constant one.
    expect(item('Bracers of Missile Deflection')?.bonuses).toBeUndefined()
    expect(item('Bracers of Missile Deflection')?.activations[0]).toMatchObject({
      actions: 'reaction',
      frequency: 'once per day',
    })
    expect(item('Rope')).toMatchObject({ kind: 'gear', price: 50, bulk: 0.1 })
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
