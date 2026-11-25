import { describe, expect, it } from 'vitest'
import type { Pf2eCreation } from '../types/sheets'
import {
  ancestryBoostPlan,
  armorRank,
  attributeMods,
  boostProblems,
  buildPf2eSheet,
  creationProblems,
  emptyCreation,
  featOptions,
  featSlots,
  proficiency,
  skillPlan,
  skillProblems,
  subclassChoices,
  weaponRank,
} from '../utils/pf2eBuild'
import { autoCreation, buildData as data, named } from './helpers/pf2e'

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
    expect(boostProblems(c, data)).toContain(
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
