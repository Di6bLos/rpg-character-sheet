import { describe, expect, it } from 'vitest'
import type { Pf2eCreation } from '../types/sheets'
import {
  actionGlyph,
  ancestryBoostPlan,
  armorPenalties,
  armorRank,
  attributeMods,
  backgroundBoostProblems,
  backgroundBoostSlots,
  backgroundSkills,
  boostProblems,
  buildPf2eSheet,
  creationProblems,
  emptyCreation,
  featOptions,
  featSlots,
  gearOptions,
  keyAttributeOptions,
  levelOneText,
  needsDeity,
  proficiency,
  resolve,
  setSlotBoost,
  skillPlan,
  skillProblems,
  slotTaken,
  speedLine,
  subclassChoices,
  trainedSkills,
  untrainedGear,
  weaponRank,
} from '../utils/pf2eBuild'
import { autoCreation, buildData as data, fillSlots, named } from './helpers/pf2e'

const cls = (name: string) => named(data.classes, name)

/** Player Core's dwarf fighter: Acolyte, chain mail and a longsword. */
function dwarfFighter(): Pf2eCreation {
  return {
    ...emptyCreation(),
    ancestry: named(data.ancestries, 'Dwarf').id,
    heritage: named(data.heritages, 'Rock Dwarf').id,
    background: named(data.backgrounds, 'Acolyte').id,
    class: cls('Fighter').id,
    ancestryBoosts: ['STR'],
    backgroundBoosts: ['WIS', 'STR'],
    keyAttribute: 'STR',
    freeBoosts: ['STR', 'DEX', 'CON', 'INT'],
    skills: ['Athletics', 'Acrobatics', 'Intimidation', 'Medicine', 'Survival'],
    feats: {
      ancestry: named(data.feats, 'Dwarven Lore').id,
      class: named(data.feats, 'Sudden Charge').id,
    },
    armor: named(data.armor, 'Chain Mail').id,
    weapons: [named(data.weapons, 'Longsword').id],
  }
}

describe('pf2e creation: a dwarf fighter (Player Core pp. 22–27)', () => {
  const c = dwarfFighter()

  it('adds up the boosts and the dwarf’s Charisma flaw', () => {
    expect(attributeMods(c, data)).toEqual({ STR: 4, DEX: 1, CON: 2, INT: 1, WIS: 2, CHA: -1 })
    expect(boostProblems(c, data)).toEqual([])
  })

  it('has no problems left in any step', () => {
    for (const problems of Object.values(creationProblems(c, data))) expect(problems).toEqual([])
  })

  it('fills in the sheet numbers', () => {
    const s = buildPf2eSheet(c, data)
    expect(s).toMatchObject({
      lineage: 'Dwarf',
      heritage: 'Rock Dwarf',
      background: 'Acolyte',
      class: 'Fighter',
      classSlug: 'fighter',
      keyAttr: 'STR',
      // Dwarf 10 + fighter 10 + CON 2
      hpMax: 22,
      hpPerLevel: 10,
      speed: '20 ft',
      // 10 + DEX 1 (chain mail cap 1) + trained 3 + chain mail 4
      ac: 18,
      acRank: 'T',
      // expert Perception 5 + WIS 2
      initMod: 7,
      bulkLimit: 9,
      // 15 gp − chain mail 6 gp − longsword 1 gp
      coins: { gp: 8, sp: 0, cp: 0 },
    })
    expect(s.saves.map((x) => [x.label, x.value])).toEqual([
      ['Fortitude', 7],
      ['Reflex', 6],
      ['Will', 5],
      ['Perception', 7],
      ['Class DC', 17],
    ])
    expect(s.strikes).toEqual([
      expect.objectContaining({ name: 'Fist', bonus: 9, agile: true, dmg: '1d4+4' }),
      expect.objectContaining({ name: 'Longsword', bonus: 9, agile: false, dmg: '1d8+4' }),
    ])
    const skill = (n: string) => s.skills.find((x) => x.name === n)
    expect(skill('Religion')).toMatchObject({ rank: 'T', value: 5 })
    expect(skill('Scribing Lore')).toMatchObject({ rank: 'T', value: 4 })
    expect(skill('Athletics')).toMatchObject({ rank: 'T', value: 7 })
    expect(skill('Arcana')).toMatchObject({ rank: 'U', value: 1 })
    expect(s.feats.map((f) => f.name)).toEqual(
      expect.arrayContaining([
        'Rock Dwarf',
        'Reactive Strike',
        'Dwarven Lore',
        'Sudden Charge',
        'Student of the Canon',
      ]),
    )
    expect(s.notes).toBe('Languages: Common, Dwarven (+1 of your choice)')
    expect(s.creation).toEqual(c)
  })
})

describe('pf2e attribute boosts', () => {
  it('gives every ancestry at least two boosts', () => {
    for (const a of data.ancestries) {
      const plan = ancestryBoostPlan(a, false)
      expect(plan.fixed.length + plan.free, a.name).toBeGreaterThanOrEqual(2)
    }
    expect(ancestryBoostPlan(named(data.ancestries, 'Human'), false)).toEqual({
      fixed: [],
      free: 2,
      flaws: [],
    })
  })

  it('needs four different free boosts', () => {
    const c = { ...dwarfFighter(), freeBoosts: ['STR', 'STR', 'CON', 'INT'] as const }
    expect(boostProblems({ ...c, freeBoosts: [...c.freeBoosts] }, data)).toContain(
      'Each free boost must go to a different attribute',
    )
  })

  it('sends the first background boost to one of its two attributes', () => {
    const c = { ...dwarfFighter(), backgroundBoosts: ['CHA', 'STR'] as ('CHA' | 'STR')[] }
    expect(backgroundBoostProblems(c, data)).toContain(
      'The first background boost goes to Intelligence or Wisdom',
    )
    // Checked on the Background step itself, not only once the attributes come up.
    expect(creationProblems(c, data).background).toContain(
      'The first background boost goes to Intelligence or Wisdom',
    )
  })

  it('offers two free boosts in place of the ancestry’s', () => {
    const c = { ...dwarfFighter(), freeAncestryBoosts: true, ancestryBoosts: ['STR' as const] }
    expect(boostProblems(c, data)).toContain('Choose 2 free ancestry boosts')
    const mods = attributeMods({ ...c, ancestryBoosts: ['STR', 'DEX'] }, data)
    expect(mods.CHA).toBe(0)
    expect(mods.CON).toBe(1)
  })
})

describe('pf2e skills', () => {
  it('gives a free skill for one the class repeats (Player Core p. 24)', () => {
    const c = autoCreation(cls('Cleric'))
    const plan = skillPlan(c, data)
    // Acolyte and the cleric both train Religion; the deity adds its divine skill.
    expect(plan.fixed).toEqual(expect.arrayContaining(['Religion', 'Scribing Lore']))
    const int = attributeMods(c, data).INT
    expect(plan.free).toBe(2 + int + 1)
  })

  it('asks for either Acrobatics or Athletics', () => {
    const c = { ...dwarfFighter(), skills: ['Intimidation', 'Medicine', 'Survival', 'Arcana'] }
    expect(skillProblems(c, data)).toContain('Choose Acrobatics or Athletics')
  })

  it('counts the free skills: 3 plus INT', () => {
    const c = { ...dwarfFighter(), skills: ['Athletics', 'Intimidation'] }
    expect(skillProblems(c, data)).toContain('Choose 3 more trained skills')
  })

  it('takes a subclass’s skills', () => {
    const c = autoCreation(cls('Rogue'))
    c.subclasses = { 'Rogue Racket': [named(cls('Rogue').subclasses, 'Thief').id] }
    expect(skillPlan(c, data).fixed).toContain('Thievery')
  })
})

describe('pf2e level 1 choices', () => {
  const keys = (name: string) =>
    subclassChoices(cls(name)).map((c) => [c.key, c.count.min, c.count.max])

  it('reads the subclass choices off the class table', () => {
    expect(keys('Fighter')).toEqual([])
    expect(keys('Rogue')).toEqual([['Rogue Racket', 1, 1]])
    expect(keys('Wizard')).toEqual(
      expect.arrayContaining([
        ['Wizard Arcane Thesis', 1, 1],
        ['Wizard Arcane School', 1, 1],
      ]),
    )
    expect(keys('Witch')).toEqual([['Witch Patron Theme', 1, 1]])
    expect(keys('Animist')).toEqual([['Animistic Practice', 1, 1]])
    expect(keys('Exemplar')).toEqual([['Exemplar Ikons', 3, 3]])
    expect(keys('Commander')).toEqual([['Commander Tactic', 5, 5]])
    expect(keys('Kineticist')).toEqual([['Kineticist Element', 1, 2]])
    const runes = subclassChoices(cls('Runesmith'))[0]!
    expect(runes.count).toEqual({ min: 4, max: 4 })
    expect(runes.options.every((o) => (o.level ?? 1) <= 1)).toBe(true)
  })

  it('lists feat slots from the class table', () => {
    expect(featSlots(cls('Fighter'))).toEqual(['ancestry', 'class'])
    expect(featSlots(cls('Wizard'))).toEqual(['ancestry'])
    expect(featSlots(cls('Rogue'))).toEqual(['ancestry', 'class', 'skill'])
  })

  it('offers 1st-level ancestry feats, versatile heritage feats included', () => {
    const c = dwarfFighter()
    const names = featOptions('ancestry', c, data).map((f) => f.name)
    expect(names).toContain('Dwarven Lore')
    expect(featOptions('ancestry', c, data).every((f) => f.level === 1)).toBe(true)
    const versatile = data.heritages.find((h) => h.versatile)!
    const withV = featOptions('ancestry', { ...c, heritage: versatile.id }, data)
    expect(withV.some((f) => f.ancestries.includes(versatile.name))).toBe(true)
  })
})

describe('pf2e proficiencies', () => {
  it('ranks weapons and armor from the class lines', () => {
    const fighter = cls('Fighter')
    expect(weaponRank(named(data.weapons, 'Longsword'), fighter)).toBe('E')
    expect(armorRank(fighter, 'Heavy')).toBe('T')
    const wizard = cls('Wizard')
    expect(weaponRank(named(data.weapons, 'Longsword'), wizard)).toBe('U')
    expect(armorRank(wizard, 'Light')).toBe('U')
    expect(armorRank(wizard, 'Unarmored')).toBe('T')
  })

  it('trains a cleric in their deity’s favored weapon', () => {
    const sarenrae = named(data.deities, 'Sarenrae')
    expect(weaponRank(named(data.weapons, 'Scimitar'), cls('Cleric'), sarenrae)).toBe('T')
    expect(weaponRank(named(data.weapons, 'Scimitar'), cls('Cleric'))).toBe('U')
  })

  it('adds level to trained or better', () => {
    expect(proficiency('U')).toBe(0)
    expect(proficiency('T')).toBe(3)
    expect(proficiency('L', 20)).toBe(28)
  })
})

describe('pf2e every class', () => {
  it.each(data.classes.map((c) => [c.name, c] as const))('%s builds a level 1 hero', (_, c) => {
    const creation = autoCreation(c)
    const problems = creationProblems(creation, data)
    for (const [step, list] of Object.entries(problems)) expect(list, step).toEqual([])
    const sheet = buildPf2eSheet(creation, data)
    expect(sheet.hpMax).toBeGreaterThan(c.hp)
    expect(sheet.class).toBe(c.name)
    expect(sheet.skills.filter((s) => s.rank === 'T').length).toBeGreaterThanOrEqual(2)
  })
})

const bg = (name: string) => named(data.backgrounds, name)
const sub = (clsName: string, name: string) => named(cls(clsName).subclasses, name)
/** `autoCreation` with some subclass picks swapped in, key attribute and deity refreshed. */
function withPicks(clsName: string, picks: Record<string, string[]>) {
  const c = autoCreation(cls(clsName))
  c.subclasses = { ...c.subclasses, ...picks }
  return c
}

describe('pf2e background boosts the data leaves out (from the rules text)', () => {
  const shape = (name: string) =>
    backgroundBoostSlots(bg(name)).map((s) => (s.allowed.length === 6 ? 'free' : s.allowed))

  /** A background as the data gives it when the boosts are only in the text. */
  const textOnly = (text: string) => ({ ...bg('Amnesiac'), boosts: [], text })

  it('reads "You gain N free attribute boosts"', () => {
    expect(shape('Amnesiac')).toEqual(['free', 'free', 'free'])
    expect(shape('Discarded Duplicate')).toEqual(['free', 'free', 'free'])
    // Fated Rival's wording (a Golarion book, so not in the committed data).
    const rival = textOnly(
      'You gain two free attribute boosts; you choose one, and the GM chooses one to complement your rival.',
    )
    expect(backgroundBoostSlots(rival)).toHaveLength(2)
    expect(backgroundBoostSlots(rival)[0]!.note).toMatch(/GM chooses one/)
  })

  it('reads "Choose … It must be to" and "Each boost has to be to"', () => {
    expect(shape('Feral Child')).toEqual([['STR', 'DEX', 'CON']])
    expect(shape('The Hunted')).toEqual([
      ['DEX', 'CON', 'WIS'],
      ['DEX', 'CON', 'WIS'],
    ])
  })

  it('leaves a sign or a deity not chosen yet free, with a note', () => {
    // Zodiac Bound's wording (a Golarion book, so not in the committed data).
    const zodiac = textOnly(
      'Choose two attribute boosts. One must be to the attribute tied to your sign, and one is a free attribute boost.',
    )
    const [sign, free] = backgroundBoostSlots(zodiac)
    expect(sign).toMatchObject({ label: "Your sign's attribute", note: expect.any(String) })
    expect(sign!.allowed).toHaveLength(6)
    expect(free!.allowed).toHaveLength(6)
    expect(shape('Raised by Belief')).toEqual(['free', 'free'])
    expect(backgroundBoostSlots(bg('Raised by Belief'))[0]!.note).toMatch(/deity/)
    const sarenrae = named(data.deities, 'Sarenrae')
    expect(backgroundBoostSlots(bg('Raised by Belief'), sarenrae)[0]!.allowed).toEqual(
      sarenrae.attributes,
    )
  })

  it('keeps the usual "one of two, plus one free" shape', () => {
    expect(shape('Acolyte')).toEqual([['INT', 'WIS'], 'free'])
  })

  it('gives every background at least one boost, and every one builds', () => {
    for (const b of data.backgrounds) {
      expect(backgroundBoostSlots(b).length, b.name).toBeGreaterThan(0)
      const c = autoCreation(cls('Fighter'), data, b.name)
      expect(creationProblems(c, data).background, b.name).toEqual([])
    }
  })

  it('counts each slot: an Amnesiac needs three different boosts', () => {
    const c: Pf2eCreation = {
      ...autoCreation(cls('Fighter'), data, 'Amnesiac'),
      backgroundBoosts: [],
    }
    expect(backgroundBoostProblems(c, data)).toEqual(['Choose all 3 background boosts'])
    c.backgroundBoosts = ['STR', 'DEX', 'STR']
    expect(backgroundBoostProblems(c, data)).toEqual([
      'Each background boost must go to a different attribute',
    ])
    const before = attributeMods({ ...c, backgroundBoosts: [] }, data)
    c.backgroundBoosts = ['INT', 'WIS', 'CHA']
    expect(backgroundBoostProblems(c, data)).toEqual([])
    expect(attributeMods(c, data)).toMatchObject({
      INT: before.INT + 1,
      WIS: before.WIS + 1,
      CHA: before.CHA + 1,
    })
  })

  it('never boosts one attribute twice: a repeat swaps slots or is refused', () => {
    const slots = backgroundBoostSlots(bg('Acolyte'))
    // INT, then a free WIS; WIS in the first slot sends INT to the free one.
    expect(setSlotBoost(['INT', 'WIS'], slots, 0, 'WIS')).toEqual(['WIS', 'INT'])
    // CHA can't move into the INT-or-WIS slot, so INT can't be taken from it.
    expect(slotTaken(['INT', 'CHA'], slots, 1)).toEqual(['INT'])
    expect(setSlotBoost(['INT', 'CHA'], slots, 1, 'INT')).toEqual(['INT', 'CHA'])
    // Slots fill in order, and clearing one clears the ones after it.
    expect(setSlotBoost([], slots, 1, 'STR')).toEqual([])
    expect(setSlotBoost(['INT', 'CHA'], slots, 0)).toEqual([])
    expect(fillSlots(slots)).toEqual(['INT', 'STR'])
  })
})

describe('pf2e class table rows out of order', () => {
  it('finds the 1st-level row by its level, not its position', () => {
    for (const name of ['Rogue', 'Cleric', 'Psychic', 'Summoner']) {
      const k = cls(name)
      const shuffled = { ...k, advancement: [...k.advancement].reverse() }
      expect(subclassChoices(shuffled), name).toEqual(subclassChoices(k))
      expect(featSlots(shuffled), name).toEqual(featSlots(k))
      expect(needsDeity(shuffled), name).toBe(needsDeity(k))
    }
  })
})

describe('pf2e key attributes from the 1st-level choices', () => {
  it('adds the one a racket allows', () => {
    const rogue = cls('Rogue')
    expect(keyAttributeOptions(rogue)).toEqual(['DEX'])
    expect(keyAttributeOptions(rogue, [sub('Rogue', 'Ruffian')])).toEqual(['DEX', 'STR'])
    expect(keyAttributeOptions(rogue, [sub('Rogue', 'Mastermind')])).toEqual(['DEX', 'INT'])
    expect(keyAttributeOptions(rogue, [sub('Rogue', 'Scoundrel')])).toEqual(['DEX', 'CHA'])
    expect(keyAttributeOptions(rogue, [sub('Rogue', 'Thief')])).toEqual(['DEX'])
  })

  it('takes the one a psychic’s subconscious mind sets', () => {
    const psychic = cls('Psychic')
    expect(keyAttributeOptions(psychic)).toEqual(['INT', 'CHA'])
    expect(keyAttributeOptions(psychic, [sub('Psychic', 'Emotional Acceptance')])).toEqual(['CHA'])
    expect(keyAttributeOptions(psychic, [sub('Psychic', 'Gathered Lore')])).toEqual(['INT'])
  })

  it('checks the key against the choices', () => {
    const thief = withPicks('Rogue', { 'Rogue Racket': [sub('Rogue', 'Thief').id] })
    thief.keyAttribute = 'STR'
    expect(boostProblems(thief, data)).toContain('Choose your key attribute: DEX')
    const ruffian = { ...thief, subclasses: { 'Rogue Racket': [sub('Rogue', 'Ruffian').id] } }
    expect(boostProblems(ruffian, data)).not.toContain('Choose your key attribute: DEX or STR')
    const mind = withPicks('Psychic', {
      'Psychic Subconscious Mind': [sub('Psychic', 'Emotional Acceptance').id],
    })
    mind.keyAttribute = 'INT'
    expect(boostProblems(mind, data)).toContain('Choose your key attribute: CHA')
  })

  it('asks an avenger, and no other rogue, for a deity', () => {
    expect(needsDeity(cls('Rogue'), [sub('Rogue', 'Avenger')])).toBe(true)
    expect(needsDeity(cls('Rogue'), [sub('Rogue', 'Ruffian')])).toBe(false)
    const c = withPicks('Rogue', { 'Rogue Racket': [sub('Rogue', 'Avenger').id] })
    c.deity = undefined
    expect(creationProblems(c, data).class).toEqual(['Choose a deity'])
  })
})

describe('pf2e skill text', () => {
  it('splits "Arcana, Nature, Occultism, or Religion" into four (Runesmith)', () => {
    const c = autoCreation(cls('Runesmith'))
    expect(skillPlan(c, data).groups).toContainEqual({
      options: ['Arcana', 'Nature', 'Occultism', 'Religion'],
      count: 1,
    })
  })

  it('makes a mastermind choose one of four skills besides Society', () => {
    const c = withPicks('Rogue', { 'Rogue Racket': [sub('Rogue', 'Mastermind').id] })
    const plan = skillPlan(c, data)
    expect(plan.fixed).toContain('Society')
    expect(plan.groups).toContainEqual({
      options: ['Arcana', 'Nature', 'Occultism', 'Religion'],
      count: 1,
    })
  })

  it('gives an avenger their deity’s divine skill', () => {
    const c = withPicks('Rogue', { 'Rogue Racket': [sub('Rogue', 'Avenger').id] })
    const deity = resolve(c, data).deity!
    expect(skillPlan(c, data).fixed).toContain(deity.skill[0])
  })

  it('reads a background’s Lore prose: a choice, or a Lore the player names', () => {
    expect(backgroundSkills(bg('Noble')).groups).toEqual([
      { options: ['Genealogy Lore', 'Heraldry Lore'], count: 1 },
    ])
    expect(backgroundSkills(bg('Guard')).groups[0]!.options).toEqual(['Legal Lore', 'Warfare Lore'])
    // AoN's doubled "Lore Lore", three options, a note after the name, a link.
    const prose = (skills: string[]) => backgroundSkills({ ...bg('Guard'), skills })
    expect(prose(['Driving Lore Lore or Piloting Lore']).groups[0]!.options).toEqual([
      'Driving Lore',
      'Piloting Lore',
    ])
    expect(
      prose(['Basket Weaving Lore or Tapestry Lore or Textile Lore.']).groups[0]!.options,
    ).toHaveLength(3)
    expect(prose(['Azlant Lore . Add Azlanti to your languages.']).fixed).toEqual(['Azlant Lore'])
    expect(prose(['Mana Wastes Lore (or another similar Lore skill)']).fixed).toEqual([
      'Mana Wastes Lore',
    ])
    expect(
      prose(['Academia Lore or a Lore skill <a href="/x">associated with your school</a>']).lores,
    ).toEqual([{ hint: 'Academia Lore or a Lore skill associated with your school' }])
    const bandit = backgroundSkills(bg('Bandit'))
    expect(bandit.fixed).toEqual(['Intimidation'])
    expect(bandit.lores).toEqual([{ hint: expect.stringMatching(/^Lore related to the terrain/) }])
    expect(backgroundSkills(bg('Saloon Entertainer')).lores).toEqual([
      { hint: 'Lore of your choice' },
    ])
  })

  it('needs the named Lore before the hero is done, then trains it', () => {
    const c = autoCreation(cls('Fighter'), data, 'Bandit')
    c.lores = ['']
    expect(skillProblems(c, data)).toContain('Name the Lore skill your background gives')
    c.lores = ['desert lore']
    expect(skillProblems(c, data)).toEqual([])
    expect(trainedSkills(c, data)).toContain('Desert Lore')
    expect(buildPf2eSheet(c, data).skills.find((s) => s.name === 'Desert Lore')).toMatchObject({
      rank: 'T',
    })
  })

  it('trains the Lore a class feature names', () => {
    expect(skillPlan(autoCreation(cls('Necromancer')), data).fixed).toContain('Undead Lore')
    expect(skillPlan(autoCreation(cls('Thaumaturge')), data).fixed).toContain('Esoteric Lore')
  })

  it('takes no Lore from an animist’s apparitions, which change every day', () => {
    const lores = skillPlan(autoCreation(cls('Animist')), data).fixed.filter((s) =>
      s.endsWith(' Lore'),
    )
    expect(lores).toEqual(['Scribing Lore'])
  })
})

describe('pf2e training from 1st-level choices', () => {
  it('reads only the 1st-level part of a doctrine', () => {
    const warpriest = levelOneText(sub('Cleric', 'Warpriest').text)
    expect(warpriest).toMatch(/light and medium armor/)
    expect(warpriest).not.toMatch(/martial weapons/)
  })

  it('trains a warpriest and a ruffian in armor', () => {
    const cleric = cls('Cleric')
    expect(armorRank(cleric, 'Medium')).toBe('U')
    expect(armorRank(cleric, 'Medium', [sub('Cleric', 'Warpriest')])).toBe('T')
    expect(armorRank(cleric, 'Light', [sub('Cleric', 'Warpriest')])).toBe('T')
    expect(armorRank(cleric, 'Heavy', [sub('Cleric', 'Warpriest')])).toBe('U')
    expect(armorRank(cleric, 'Medium', [sub('Cleric', 'Cloistered Cleric')])).toBe('U')
    expect(armorRank(cls('Rogue'), 'Medium', [sub('Rogue', 'Ruffian')])).toBe('T')
    expect(armorRank(cls('Rogue'), 'Medium', [sub('Rogue', 'Avenger')])).toBe('T')
    expect(armorRank(cls('Rogue'), 'Medium', [sub('Rogue', 'Thief')])).toBe('U')
  })

  it('trains weapons a choice names, and an avenger’s favored weapon', () => {
    const longsword = named(data.weapons, 'Longsword')
    const necro = cls('Necromancer')
    expect(weaponRank(longsword, necro)).toBe('U')
    expect(weaponRank(longsword, necro, undefined, [sub('Necromancer', 'Reaper')])).toBe('T')
    expect(weaponRank(longsword, cls('Cleric'), undefined, [sub('Cleric', 'Warpriest')])).toBe('U')
    const sarenrae = named(data.deities, 'Sarenrae')
    const falcata = data.weapons.find((w) => w.category === 'Advanced')!
    const avenger = [sub('Rogue', 'Avenger')]
    const favored = { ...sarenrae, favoredWeapons: [falcata.name] }
    expect(weaponRank(falcata, cls('Rogue'), favored, avenger)).toBe('T')
    expect(weaponRank(falcata, cls('Rogue'), favored)).toBe('U')
  })

  it('builds a warpriest in chain mail with trained AC and expert Fortitude', () => {
    const c = withPicks('Cleric', { 'Cleric Doctrine': [sub('Cleric', 'Warpriest').id] })
    c.armor = named(data.armor, 'Chain Mail').id
    expect(creationProblems(c, data).gear).toEqual([])
    const s = buildPf2eSheet(c, data)
    expect(s.acRank).toBe('T')
    const fort = s.saves.find((x) => x.label === 'Fortitude')!
    expect(fort).toMatchObject({ rank: 'E', value: 5 + attributeMods(c, data).CON })
    const cloistered = {
      ...c,
      subclasses: { 'Cleric Doctrine': [sub('Cleric', 'Cloistered Cleric').id] },
    }
    expect(buildPf2eSheet(cloistered, data).saves[0]!.rank).toBe('T')
  })
})

describe('pf2e gear', () => {
  it('sells level 0 and 1 items, once each, no fists', () => {
    const g = gearOptions(data)
    expect(g.armor.map((a) => a.name)).toContain('Splint Mail')
    expect(g.weapons.some((w) => w.category === 'Unarmed')).toBe(false)
    expect(g.weapons.every((w) => w.level <= 1)).toBe(true)
    const names = g.weapons.map((w) => w.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('flags armor and weapons the hero isn’t trained in', () => {
    const c = autoCreation(cls('Wizard'))
    c.weapons = [named(data.weapons, 'Longsword').id]
    c.armor = named(data.armor, 'Leather Armor').id
    expect(untrainedGear(c, data).map((g) => g.name)).toEqual(['Leather Armor', 'Longsword'])
    expect(creationProblems(c, data).gear).toEqual([
      'Not trained in Leather Armor, Longsword: pick something else',
    ])
  })

  it('puts ammunition in the pack, without a proficiency or a Strike', () => {
    const c = dwarfFighter()
    const arrows = named(data.weapons, 'Arrows')
    c.weapons = [...c.weapons, arrows.id]
    expect(untrainedGear(c, data)).toEqual([])
    const s = buildPf2eSheet(c, data)
    expect(s.strikes.map((x) => x.name)).toEqual(['Fist', 'Longsword'])
    expect(s.inventory.map((i) => i.name)).toContain('Arrows')
  })
})

describe('pf2e armor penalties (Player Core p. 271)', () => {
  const chain = named(data.armor, 'Chain Mail')
  const mods = (STR: number) => ({ STR, DEX: 1, CON: 0, INT: 0, WIS: 0, CHA: 0 })

  it('drops the check penalty and 5 ft of the Speed penalty for a strong wearer', () => {
    expect(armorPenalties(mods(3), chain)).toMatchObject({ check: 0, speed: 0 })
    expect(armorPenalties(mods(2), chain)).toMatchObject({
      check: chain.checkPenalty,
      speed: chain.speedPenalty,
    })
    const splint = named(data.armor, 'Splint Mail')
    expect(armorPenalties(mods(4), splint).speed).toBe(splint.speedPenalty + 5)
  })

  it('always takes a shield’s Speed penalty', () => {
    const tower = named(data.shields, 'Tower Shield')
    expect(armorPenalties(mods(0), undefined, tower).speed).toBe(tower.speedPenalty)
  })

  it('puts them on the sheet: STR and DEX skills, Speed, and a note', () => {
    const c = {
      ...dwarfFighter(),
      ancestryBoosts: ['DEX' as const],
      backgroundBoosts: ['WIS' as const, 'CON' as const],
      freeBoosts: ['DEX' as const, 'CON' as const, 'INT' as const, 'WIS' as const],
    }
    // STR +1 (key) against chain mail's Strength +3.
    expect(attributeMods(c, data).STR).toBe(1)
    const s = buildPf2eSheet(c, data)
    const plainSheet = buildPf2eSheet({ ...c, armor: undefined }, data)
    const skill = (sheet: typeof s, n: string) => sheet.skills.find((x) => x.name === n)!.value
    expect(skill(s, 'Acrobatics')).toBe(skill(plainSheet, 'Acrobatics') + chain.checkPenalty)
    expect(skill(s, 'Athletics')).toBe(skill(plainSheet, 'Athletics') + chain.checkPenalty)
    expect(skill(s, 'Medicine')).toBe(skill(plainSheet, 'Medicine'))
    expect(s.speed).toBe(`${20 + chain.speedPenalty} ft`)
    expect(s.notes).toMatch(/Chain Mail: -2 to Strength and Dexterity skill checks/)
  })
})

describe('pf2e feats from the class table and heritages', () => {
  it('gives a summoner an evolution feat in the class slot', () => {
    const summoner = cls('Summoner')
    expect(featSlots(summoner)).toEqual(['ancestry', 'class'])
    const c = autoCreation(summoner)
    const options = featOptions('class', c, data)
    expect(options.length).toBeGreaterThan(0)
    expect(options.every((f) => f.traits.includes('Evolution'))).toBe(true)
    delete c.feats.class
    expect(creationProblems(c, data).skills).toContain('Choose an evolution feat')
  })

  it('opens elf feats to an aiuvarin and orc feats to a dromaar', () => {
    const c = dwarfFighter()
    const lists = (heritage: string) =>
      new Set(
        featOptions('ancestry', { ...c, heritage: named(data.heritages, heritage).id }, data)
          .flatMap((f) => f.ancestries)
          .filter((a) => a !== 'Dwarf'),
      )
    expect(lists('Aiuvarin')).toEqual(new Set(['Aiuvarin', 'Elf']))
    expect(lists('Dromaar')).toEqual(new Set(['Dromaar', 'Orc']))
  })

  it('leaves generic class features off the sheet whatever their case', () => {
    const fighter = cls('Fighter')
    const lower = {
      ...fighter,
      features: fighter.features.map((f) => ({ ...f, name: f.name.toLowerCase() })),
    }
    const s = buildPf2eSheet(dwarfFighter(), {
      ...data,
      classes: data.classes.map((k) => (k.id === fighter.id ? lower : k)),
    })
    const names = s.feats.map((f) => f.name)
    expect(names).toContain('reactive strike')
    expect(names).not.toContain('attribute boosts')
    expect(names).not.toContain('initial proficiencies')
  })

  it('notes what the data leaves out (a druid’s order) on the sheet', () => {
    const druid = cls('Druid')
    const order = druid.subclasses.find((o) => o.gap)!
    const c = withPicks('Druid', { 'Druidic Order': [order.id] })
    expect(buildPf2eSheet(c, data).notes).toContain(`${order.name}: ${order.gap}`)
  })
})

describe('pf2e data shapes after the setting cut', () => {
  it('reads each part of a compound action cost', () => {
    expect(actionGlyph(2)).toBe('◆◆')
    expect(actionGlyph('1 to 3')).toBe('◆ to ◆◆◆')
    expect(actionGlyph('free or 1')).toBe('◇ or ◆')
    expect(actionGlyph('reaction or 2')).toBe('↺ or ◆◆')
    expect(actionGlyph('2 to 2 rounds')).toBe('◆◆ to 2 rounds')
  })

  it('takes Speed from a heritage that gives one (awakened animals)', () => {
    const animal = named(data.ancestries, 'Awakened Animal')
    expect(speedLine(animal, named(data.heritages, 'Climbing Animal'))).toBe('20 ft, climb 20 ft')
    expect(speedLine(animal, named(data.heritages, 'Swimming Animal'))).toBe('swim 30 ft')
    const dwarf = named(data.ancestries, 'Dwarf')
    expect(speedLine(dwarf, named(data.heritages, 'Rock Dwarf'), -10)).toBe('10 ft')
    expect(speedLine(dwarf, undefined, -20)).toBe('5 ft')
  })

  it('puts the shield’s own AC bonus on the sheet', () => {
    const buckler = named(data.shields, 'Buckler')
    const s = buildPf2eSheet({ ...dwarfFighter(), shield: buckler.id }, data)
    expect(s.shield).toMatchObject({ name: 'Buckler', ac: buckler.ac })
  })
})
