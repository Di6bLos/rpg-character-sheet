import { describe, expect, it } from 'vitest'
import type { Pf2eAttr, Pf2eCreation, Pf2eRank, Pf2eSheet } from '../types/sheets'
import { restoreLevel } from '../utils/levelHistory'
import { buildPf2eSheet, emptyCreation } from '../utils/pf2eBuild'
import {
  applyPf2eLevel,
  boostAttrs,
  featPrerequisites,
  gatedParts,
  levelFeatOptions,
  levelFeatSlots,
  pf2eLevelPlan,
  pf2eLevelProblems,
} from '../utils/pf2eLevelUp'
import { autoCreation, autoLevelPicks, buildData as data, levelTo, named } from './helpers/pf2e'

const cls = (name: string) => named(data.classes, name)
const BOOSTS: Pf2eAttr[] = ['STR', 'DEX', 'CON', 'WIS']

/** Player Core's dwarf fighter (as in pf2eBuild.test.ts), in chain mail with a longsword. */
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

/** Levels a sheet one level at a time, the fighter's weapon group set to swords. */
function climb(s: Pf2eSheet, to: number, snaps: Record<number, Pf2eSheet>) {
  snaps[1] = structuredClone(s)
  for (let l = 2; l <= to; l++) {
    const picks = autoLevelPicks(s, l, data, BOOSTS)
    for (const k of Object.keys(picks.choices))
      if (k.startsWith('group:')) picks.choices[k] = ['Sword']
    applyPf2eLevel(s, l, picks, data)
    snaps[l] = structuredClone(s)
  }
  return snaps
}

const row = (s: Pf2eSheet, label: string) => s.saves.find((x) => x.label === label)!
const ranks = (s: Pf2eSheet) =>
  Object.fromEntries(s.saves.map((x) => [x.label, x.rank])) as Record<string, Pf2eRank>
const slotMax = (s: Pf2eSheet) =>
  s.spellcasting!.slots.map((x) => x.max).filter((n, i, all) => n || all.slice(i).some(Boolean))

describe('pf2e level-up: the dwarf fighter, 1 → 20 (Player Core pp. 29, 136–143)', () => {
  const at = climb(buildPf2eSheet(dwarfFighter(), data), 20, {})

  it('adds class HP plus CON each level, and a CON increase for every level before', () => {
    // Dwarf 10 + (Fighter 10 + CON) per level; CON 2, 3 from 5th, 4 from 10th, 5 from 20th.
    expect([1, 2, 5, 10, 20].map((l) => at[l]!.hpMax)).toEqual([22, 34, 75, 150, 310])
  })

  it('records a boost to +4 or more as a partial boost (p. 19)', () => {
    expect(at[5]!.attrs.STR).toBe(4)
    expect(at[5]!.partialBoosts).toEqual(['STR'])
    expect(at[10]!.attrs.STR).toBe(5)
    expect(at[10]!.partialBoosts).toEqual([])
    expect(at[20]!.attrs).toMatchObject({ STR: 6, DEX: 4, CON: 5, WIS: 5 })
    expect(at[20]!.partialBoosts).toEqual(['DEX'])
  })

  it('raises proficiencies from the class features', () => {
    expect(ranks(at[1]!)).toMatchObject({ Fortitude: 'E', Reflex: 'E', Will: 'T', Perception: 'E' })
    expect(ranks(at[5]!)).toMatchObject({ Will: 'E', 'Class DC': 'T' })
    expect(ranks(at[10]!)).toMatchObject({ Fortitude: 'M', Perception: 'M', Reflex: 'E' })
    expect(ranks(at[20]!)).toMatchObject({
      Fortitude: 'M',
      Reflex: 'M',
      Will: 'E',
      Perception: 'M',
      'Class DC': 'M',
    })
    expect([1, 10, 11, 17, 20].map((l) => at[l]!.acRank)).toEqual(['T', 'T', 'E', 'M', 'M'])
  })

  it('reaches weapon mastery in the chosen group at 5th and legendary at 19th', () => {
    const sword = (l: number) => at[l]!.strikes.find((x) => x.name === 'Longsword')!
    const fist = (l: number) => at[l]!.strikes.find((x) => x.name === 'Fist')!
    expect([1, 5, 12, 13, 19].map((l) => sword(l).rank)).toEqual(['E', 'M', 'M', 'L', 'L'])
    expect([1, 5, 13, 19].map((l) => fist(l).rank)).toEqual(['E', 'E', 'M', 'L'])
  })

  it('moves every number with the level, ranks and attributes', () => {
    const n = (s: Pf2eSheet) => ({
      ac: s.ac,
      fort: row(s, 'Fortitude').value,
      ref: row(s, 'Reflex').value,
      will: row(s, 'Will').value,
      perception: row(s, 'Perception').value,
      classDc: row(s, 'Class DC').value,
      sword: s.strikes.find((x) => x.name === 'Longsword')!.bonus,
      dmg: s.strikes.find((x) => x.name === 'Longsword')!.dmg,
    })
    // Chain mail: AC +4, Dex cap +1.
    expect(n(at[1]!)).toEqual({
      ac: 18,
      fort: 7,
      ref: 6,
      will: 5,
      perception: 7,
      classDc: 17,
      sword: 9,
      dmg: '1d8+4',
    })
    expect(n(at[2]!)).toEqual({
      ac: 19,
      fort: 8,
      ref: 7,
      will: 6,
      perception: 8,
      classDc: 18,
      sword: 10,
      dmg: '1d8+4',
    })
    expect(n(at[5]!)).toEqual({
      ac: 22,
      fort: 12,
      ref: 11,
      will: 12,
      perception: 12,
      classDc: 21,
      sword: 15,
      dmg: '1d8+4',
    })
    expect(n(at[10]!)).toEqual({
      ac: 27,
      fort: 20,
      ref: 17,
      will: 18,
      perception: 20,
      classDc: 27,
      sword: 21,
      dmg: '1d8+5',
    })
    expect(n(at[20]!)).toEqual({
      ac: 41,
      fort: 31,
      ref: 30,
      will: 29,
      perception: 31,
      classDc: 42,
      sword: 34,
      dmg: '1d8+6',
    })
    expect(at[20]!.initMod).toBe(31)
  })

  it('adds the class features, with the ones the effects engine reads by name', () => {
    const names = at[20]!.feats.map((f) => f.name)
    expect(names).toEqual(
      expect.arrayContaining([
        'Bravery',
        'Fighter Weapon Mastery',
        'Weapon Specialization',
        'Greater Weapon Specialization',
        'Versatile Legend',
      ]),
    )
    expect(at[7]!.feats.find((f) => f.name === 'Weapon Specialization')!.level).toBe('7')
    expect(at[20]!.level).toBe(20)
  })

  it('takes one feat per slot the table lists', () => {
    const count = (type: string) =>
      at[20]!.feats.filter((f) => f.type === type && f.level !== '1').length
    expect([
      count('Class feat'),
      count('Skill feat'),
      count('General feat'),
      count('Ancestry feat'),
    ]).toEqual([10, 10, 5, 4])
  })
})

describe('pf2e level-up: casters and the rogue (Player Core class tables)', () => {
  const build = (name: string, sub: string[] = []) =>
    climb(buildPf2eSheet(autoCreation(cls(name), data, 'Acolyte', sub), data), 20, {})

  it('cleric warpriest: doctrine proficiencies, slots and divine font', () => {
    const at = build('Cleric', ['Warpriest'])
    expect(ranks(at[1]!)).toMatchObject({ Fortitude: 'E', Reflex: 'T', Will: 'E', Perception: 'T' })
    expect(ranks(at[5]!)).toMatchObject({ Perception: 'E' })
    expect(ranks(at[10]!)).toMatchObject({ Will: 'M', Reflex: 'T' })
    expect(ranks(at[20]!)).toMatchObject({
      Fortitude: 'M',
      Reflex: 'E',
      Will: 'M',
      Perception: 'E',
    })
    expect([1, 10, 11, 19].map((l) => at[l]!.spellcasting!.rank)).toEqual(['T', 'T', 'E', 'M'])
    expect([1, 12, 13].map((l) => at[l]!.acRank)).toEqual(['T', 'T', 'E'])
    expect(slotMax(at[1]!)).toEqual([2])
    expect(slotMax(at[2]!)).toEqual([3])
    expect(slotMax(at[5]!)).toEqual([3, 3, 2])
    expect(slotMax(at[10]!)).toEqual([3, 3, 3, 3, 3])
    expect(slotMax(at[20]!)).toEqual([3, 3, 3, 3, 3, 3, 3, 3, 3, 1])
    expect([1, 5, 15].map((l) => at[l]!.spellcasting!.font?.max)).toEqual([4, 5, 6])
    // Cleric 8 HP per level, human 8.
    const con = at[20]!.attrs.CON
    expect(at[20]!.hpMax).toBe(8 + (8 + con) * 20)
  })

  it('warpriest weapons: martial at 3rd, expert at 7th, the favored weapon master at 19th', () => {
    const at = build('Cleric', ['Warpriest'])
    const plan3 = pf2eLevelPlan(at[2]!, 3, data)!
    expect(plan3.proficiencies).toContainEqual({ label: 'Martial weapons', from: 'U', to: 'T' })
    const plan7 = pf2eLevelPlan(at[6]!, 7, data)!
    expect(plan7.proficiencies).toContainEqual({ label: 'Martial weapons', from: 'T', to: 'E' })
    expect(plan7.features.map((f) => f.name)).toContain('Warpriest')
    const plan13 = pf2eLevelPlan(at[12]!, 13, data)!
    expect(plan13.proficiencies).toContainEqual({ label: 'Medium armor', from: 'T', to: 'E' })
  })

  it('rogue thief: a skill feat and a skill increase every level', () => {
    const at = build('Rogue', ['Thief'])
    expect(ranks(at[1]!)).toMatchObject({ Fortitude: 'T', Reflex: 'E', Will: 'E', Perception: 'E' })
    expect(ranks(at[10]!)).toMatchObject({ Reflex: 'M', Perception: 'M', Fortitude: 'E' })
    expect(ranks(at[20]!)).toMatchObject({
      Reflex: 'L',
      Perception: 'L',
      Will: 'M',
      Fortitude: 'E',
      'Class DC': 'M',
    })
    expect([1, 5, 13].map((l) => at[l]!.strikes[0]!.rank)).toEqual(['T', 'E', 'M'])
    expect([1, 13, 19].map((l) => at[l]!.acRank)).toEqual(['T', 'E', 'M'])
    const skillFeats = at[20]!.feats.filter((f) => f.type === 'Skill feat' && f.level !== '1')
    expect(skillFeats).toHaveLength(19)
    expect(pf2eLevelPlan(at[1]!, 2, data)!.skillIncreases).toBe(1)
    expect(pf2eLevelPlan(at[6]!, 7, data)!.skillMax).toBe('M')
    expect(pf2eLevelPlan(at[14]!, 15, data)!.skillMax).toBe('L')
  })

  it('wizard: spell proficiency 7/15/19, two spellbook spells a level', () => {
    const at = build('Wizard')
    expect(ranks(at[5]!)).toMatchObject({ Reflex: 'E', Fortitude: 'T' })
    expect(ranks(at[10]!)).toMatchObject({ Fortitude: 'E', Perception: 'T' })
    expect(ranks(at[20]!)).toMatchObject({ Will: 'M', Perception: 'E' })
    expect([1, 7, 15, 19].map((l) => at[l]!.spellcasting!.rank)).toEqual(['T', 'E', 'M', 'L'])
    expect(slotMax(at[5]!)).toEqual([3, 3, 2])
    expect(slotMax(at[10]!)).toEqual([3, 3, 3, 3, 3])
    expect(slotMax(at[20]!)).toEqual([3, 3, 3, 3, 3, 3, 3, 3, 3, 1])
    const book = (l: number) => at[l]!.spellcasting!.spells.length
    expect(book(20) - book(1)).toBe(38)
    expect(pf2eLevelPlan(at[4]!, 5, data)!.spells).toEqual([
      { key: 'book', label: '2 new spells of rank 3 or lower', count: 2, rank: 3 },
    ])
  })

  it('sorcerer: a repertoire spell per new slot, the bloodline gift first at each new rank', () => {
    const at = build('Sorcerer', ['Aberrant'])
    expect([1, 7, 15, 19].map((l) => at[l]!.spellcasting!.rank)).toEqual(['T', 'E', 'M', 'L'])
    expect(ranks(at[5]!)).toMatchObject({ Fortitude: 'E', Reflex: 'T' })
    expect(ranks(at[10]!)).toMatchObject({ Reflex: 'E' })
    expect(ranks(at[20]!)).toMatchObject({ Will: 'M', Perception: 'E' })
    expect(slotMax(at[1]!)).toEqual([3])
    expect(slotMax(at[2]!)).toEqual([4])
    expect(slotMax(at[5]!)).toEqual([4, 4, 3])
    expect(slotMax(at[10]!)).toEqual([4, 4, 4, 4, 4])
    expect(slotMax(at[20]!)).toEqual([4, 4, 4, 4, 4, 4, 4, 4, 4, 1])
    const plan3 = pf2eLevelPlan(at[2]!, 3, data)!
    expect(plan3.granted.map((s) => [s.name, s.rank])).toEqual([['Stupefy', 2]])
    expect(plan3.spells).toMatchObject([{ key: 'rank2', count: 2, learnAt: 2 }])
    expect(at[3]!.spellcasting!.spells.filter((s) => s.rank === 2)).toHaveLength(3)
    const known = (l: number) => at[l]!.spellcasting!.spells.length
    expect(known(20) - known(1)).toBe(34)
  })
})

describe('pf2e level-up: every class', () => {
  it.each(data.classes.map((c) => [c.name, c] as const))('%s levels 1 → 20', (_, c) => {
    const s = buildPf2eSheet(autoCreation(c), data)
    expect(() => levelTo(s, 20)).not.toThrow()
    expect(s.level).toBe(20)
    const slots = Array.from({ length: 19 }, (_, i) => levelFeatSlots(c, i + 2)).flat()
    const n = (k: string) => slots.filter((x) => x.kind === k).length
    expect(n('class')).toBe(10)
    expect(n('skill')).toBe(c.name === 'Rogue' ? 19 : 10)
    expect(n('general')).toBe(5)
    expect(n('ancestry')).toBe(4)
    for (let l = 2; l <= 20; l++) expect(pf2eLevelPlan(s, l, data)!.feats.length).toBeGreaterThan(0)
  })
})

describe('pf2e level-up: feats and prerequisites', () => {
  const s = buildPf2eSheet(dwarfFighter(), data)

  it('reads skill ranks, attributes and feats the hero has', () => {
    const climber = named(data.feats, 'Combat Climber')
    expect(featPrerequisites(climber, s, data).unmet).toEqual([])
    const noAthletics = structuredClone(s)
    noAthletics.skills.find((x) => x.name === 'Athletics')!.rank = 'U'
    expect(featPrerequisites(climber, noAthletics, data).unmet).toEqual(['Trained in Athletics'])
    expect(featPrerequisites(named(data.feats, 'Chromotherapy'), s, data).unmet).toEqual([
      'Expert in Medicine',
    ])
    expect(featPrerequisites({ prerequisites: 'Strength +4' }, s, data).unmet).toEqual([])
    expect(featPrerequisites({ prerequisites: 'Dexterity +3' }, s, data).unmet).toEqual([
      'Dexterity +3',
    ])
    expect(
      featPrerequisites(
        { prerequisites: 'Expert in Arcana, Expert in Nature, or Expert in Athletics' },
        s,
        data,
      ).unmet,
    ).toEqual(['Expert in Arcana, Expert in Nature, or Expert in Athletics'])
  })

  it('knows class features and feats as prerequisites', () => {
    expect(featPrerequisites(named(data.feats, 'Disorienting Opening'), s, data).unmet).toEqual([])
    expect(featPrerequisites(named(data.feats, 'Crashing Slam'), s, data).unmet).toEqual([
      'Slam Down',
    ])
    expect(featPrerequisites({ prerequisites: 'some rite of passage' }, s, data)).toEqual({
      unmet: [],
      unknown: ['some rite of passage'],
    })
  })

  it("reads the class's subclass options: a muse the bard didn't pick is unmet", () => {
    const bard = buildPf2eSheet(autoCreation(cls('Bard'), data, 'Acolyte', ['Enigma']), data)
    expect(featPrerequisites({ prerequisites: 'zoophonia muse' }, bard, data).unmet).toEqual([
      'zoophonia muse',
    ])
    expect(featPrerequisites({ prerequisites: 'enigma muse' }, bard, data).unmet).toEqual([])
    expect(featPrerequisites(named(data.feats, 'Double Take'), bard, data).unmet).toEqual([
      'trickster muse',
    ])
  })

  it('offers feats of the slot and level the hero has not taken', () => {
    const options = levelFeatOptions('class', s, 2, data)
    expect(options.every((f) => f.level <= 2 && f.classes.includes('Fighter'))).toBe(true)
    expect(options.map((f) => f.name)).not.toContain('Sudden Charge')
    expect(levelFeatOptions('general', s, 3, data).some((f) => f.name === 'Toughness')).toBe(true)
  })

  it('lists what the picks still need', () => {
    const plan = pf2eLevelPlan(s, 5, data)!
    expect(
      pf2eLevelProblems(
        plan,
        { boosts: ['STR'], feats: {}, skills: [], spells: {}, choices: {} },
        s,
      ),
    ).toEqual([
      { section: 'boosts', text: 'Choose 4 attribute boosts' },
      { section: 'choice:group:Fighter Weapon Mastery', text: 'Choose a weapon group' },
      { section: 'feat:ancestry', text: 'Choose an ancestry feat' },
      { section: 'skills', text: 'Choose the skill increase' },
    ])
    expect(plan.choices[0]!.feature?.name).toBe('Fighter Weapon Mastery')
    const picks = autoLevelPicks(s, 5, data, BOOSTS)
    expect(pf2eLevelProblems(pf2eLevelPlan(s, 5, data, picks)!, picks, s)).toEqual([])
  })

  it('a partial boost takes a second boost to raise the attribute', () => {
    const base = { STR: 4, DEX: 3, CON: 2, INT: 0, WIS: 1, CHA: 0 }
    const once = boostAttrs(base, [], ['STR', 'DEX', 'CON', 'WIS'])
    expect(once.attrs).toMatchObject({ STR: 4, DEX: 4, CON: 3, WIS: 2 })
    expect(once.partial).toEqual(['STR'])
    const twice = boostAttrs(once.attrs, once.partial, ['STR', 'DEX', 'CON', 'WIS'])
    expect(twice.attrs).toMatchObject({ STR: 5, DEX: 4, CON: 4, WIS: 3 })
    expect(twice.partial).toEqual(['DEX'])
  })

  it('a Constitution increase raises HP for every earlier level (p. 29)', () => {
    const at4 = levelTo(buildPf2eSheet(dwarfFighter(), data), 4)
    const plan = pf2eLevelPlan(at4, 5, data, { ...autoLevelPicks(at4, 5, data, BOOSTS) })!
    expect(plan.hp).toEqual({ cls: 10, con: 3, retro: 4, feats: 0, total: 17 })
  })
})

describe('pf2e level-up: going back', () => {
  it('level up then restoreLevel gives back the same sheet', () => {
    const s = levelTo(buildPf2eSheet(dwarfFighter(), data), 4)
    const before = structuredClone(s)
    applyPf2eLevel(s, 5, autoLevelPicks(s, 5, data, BOOSTS), data)
    expect(s.hpMax).toBeGreaterThan(before.hpMax)
    expect(restoreLevel(s, 4)).toBe(true)
    expect(s).toEqual(before)
  })

  it('records the picks so Reconfigure can replay them', () => {
    const s = levelTo(buildPf2eSheet(dwarfFighter(), data), 4)
    const picks = autoLevelPicks(s, 5, data, BOOSTS)
    applyPf2eLevel(s, 5, picks, data)
    expect(s.levelHistory?.find((e) => e.level === 5)?.pf2e).toEqual(picks)
  })
})

describe('gatedParts', () => {
  it('reads labels, headings and "At Nth level" sentences', () => {
    const text = [
      'Base text.',
      '- **Second Doctrine (3rd)** You’re trained in martial weapons.',
      '- **Third Doctrine (7th)** Your proficiency ranks for the spell',
      'attack modifier increase to expert. At 13th level, more.',
      '## Specialization Ability · Level 7',
      'Seven.',
    ].join('\n')
    expect(gatedParts(text).map((p) => [p.level, p.text])).toEqual([
      [1, 'Base text.'],
      [3, "- Second Doctrine (3rd) You're trained in martial weapons."],
      [
        7,
        '- Third Doctrine (7th) Your proficiency ranks for the spell attack modifier increase to expert.',
      ],
      [13, 'At 13th level, more.'],
      [7, 'Seven.'],
    ])
  })
})
