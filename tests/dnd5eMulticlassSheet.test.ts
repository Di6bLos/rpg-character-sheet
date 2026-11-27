// A multiclass hero on the 5e sheet (SRD 5.2.1 pp. 24–26): the class line, Hit Point Dice by
// size, class features that count their own class's level (Rage, Sneak Attack, Brutal Strike,
// "your Monk level"), each class's table columns, and each spellcasting class's own DC. Proficiency
// Bonus stays on the character level, and a save from before multiclassing reads as before.
import { describe, expect, it } from 'vitest'
import type { Dnd5eAbility, Dnd5eSheet } from '../types/sheets'
import { weaponAttack } from '../utils/dnd5eAttacks'
import { buildDnd5eSheet, creationPicks } from '../utils/dnd5eBuild'
import { addEffect } from '../utils/dnd5eEffects'
import { heroColumns, heroEntries } from '../utils/dnd5eFeatures'
import { applyDnd5eLevel, dnd5eLevelPlan } from '../utils/dnd5eLevelUp'
import {
  castingFor,
  classLine,
  dnd5eHero,
  hitDiceLeft,
  hitDicePools,
  longRest,
  spendHitDie,
} from '../utils/dnd5ePlay'
import { attackRiders } from '../utils/dnd5eRiders'
import { cls, creation, data, fill } from './helpers/dnd5e'

function hero(slug: string, base: Record<Dnd5eAbility, number>) {
  const c = creation(slug)
  c.base = base
  const prefer = { abilities: cls(slug).primaryAbility.abilities }
  return buildDnd5eSheet(c, fill((p) => creationPicks(c, p, data), prefer), data)
}

/** Levels the sheet in each class of `levels` in turn, with first-valid picks. */
function play(sheet: Dnd5eSheet, levels: [string, string?][]) {
  levels.forEach(([slug, subclass], i) => {
    const level = i + 2
    const prefer = { abilities: cls(slug).primaryAbility.abilities, subclass }
    const start = { [`L${level}:class`]: [slug] }
    const picks = fill((p) => dnd5eLevelPlan(sheet, level, data, p)!.picks, prefer, start)
    const plan = dnd5eLevelPlan(sheet, level, data, picks)!
    applyDnd5eLevel(sheet, level, { hpRoll: plan.hp.fixed, picks }, data)
  })
  return sheet
}

const palalock = () =>
  play(hero('paladin', { STR: 15, DEX: 10, CON: 13, INT: 8, WIS: 12, CHA: 14 }), [
    ['paladin'],
    ['warlock'],
    ['warlock'],
    ['warlock', 'fiend-patron'],
  ])

const rogueBarb = () =>
  play(hero('rogue', { STR: 14, DEX: 15, CON: 13, INT: 10, WIS: 12, CHA: 8 }), [
    ['rogue'],
    ['rogue', 'thief'],
    ['barbarian'],
    ['barbarian'],
  ])

describe('5e multiclass sheet: who the hero is', () => {
  it('reads the class line from the classes, and from classSlug on an older save', () => {
    const s = palalock()
    expect(classLine(s, 5, data)).toBe('Paladin 2 / Warlock 3 (Fiend Patron)')
    const old: Dnd5eSheet = { ...rogueBarb(), classes: undefined, hitDice: undefined }
    old.classSlug = 'rogue'
    old.subclassSlug = 'thief'
    expect(classLine(old, 5, data)).toBe('Rogue (Thief)')
    expect(classLine({ ...old, classSlug: '', subclassSlug: '' }, 5)).toBe(old.class)
  })

  it('keeps Proficiency Bonus on the character level', () => {
    expect(dnd5eHero(palalock(), 5).pb).toBe(3)
  })
})

describe('5e multiclass sheet: Hit Point Dice by size (SRD 5.2.1 pp. 24, 186)', () => {
  it('spends the largest die first, or the size asked for, and a Long Rest gives all back', () => {
    const s = palalock()
    s.hp = 1
    expect(hitDicePools(s, 5).map((p) => `${p.left}/${p.count}d${p.die}`)).toEqual([
      '2/2d10',
      '3/3d8',
    ])
    expect(spendHitDie(s, 5, { roll: 4 })).toMatch(/^Hit Point Die d10: 4/)
    expect(spendHitDie(s, 5, { roll: 4, die: 8 })).toMatch(/^Hit Point Die d8: 4/)
    expect(hitDicePools(s, 5).map((p) => p.left)).toEqual([1, 2])
    expect(s.hitDiceUsed).toBe(2)
    expect(hitDiceLeft(s, 5)).toBe(3)
    spendHitDie(s, 5, { die: 10 })
    expect(spendHitDie(s, 5, { die: 10 })).toBe('No d10 Hit Point Dice left.')
    longRest(s, 5)
    expect(hitDiceLeft(s, 5)).toBe(5)
    expect(s.hitDiceSpent).toBeUndefined()
  })

  it('reads an older save’s total against the largest dice, and a single class as one pool', () => {
    const s = palalock()
    s.hitDiceUsed = 3
    expect(hitDicePools(s, 5).map((p) => p.left)).toEqual([0, 2])
    const single: Dnd5eSheet = { ...s, hitDice: undefined, hitDie: 8, hitDiceUsed: 1 }
    expect(hitDicePools(single, 5)).toEqual([{ die: 8, count: 5, used: 1, left: 4 }])
  })
})

describe('5e multiclass sheet: features count their own class’s level', () => {
  it('Rogue 3 / Barbarian 2: Sneak Attack at Rogue 3, Rage at Barbarian 2', () => {
    const s = rogueBarb()
    const hero = dnd5eHero(s, 5)
    expect(hero.classLevel('rogue')).toBe(3)
    expect(hero.classLevel('Barbarian')).toBe(2)
    expect(hero.classLevel('wizard')).toBe(0)
    expect(hero.levelOf('Sneak Attack')).toBe(3)
    expect(hero.levelOf('Rage')).toBe(2)
    expect(hero.levelOf('Fast Hands')).toBe(3)
    const cols = heroColumns(s, 5, data)
    expect(cols['Sneak Attack']).toMatch(/^2d6/)
    expect(cols['Rage Damage']).toBe('+2')
    expect(s.resources?.find((r) => r.name === 'Rage')?.max).toBe(2)
    const rage = heroEntries(s, 5, data, cols).find((e) => e.name === 'Rage')!
    expect(rage.kind).toBe('class')
    expect(rage.classLevel).toBe(2)
  })

  it('a single class counts the hero’s level, as before', () => {
    const s = play(hero('rogue', { STR: 10, DEX: 15, CON: 13, INT: 12, WIS: 14, CHA: 8 }), [
      ['rogue'],
      ['rogue', 'thief'],
      ['rogue'],
      ['rogue'],
    ])
    expect(dnd5eHero(s, 5).levelOf('Sneak Attack')).toBe(5)
    expect(heroColumns(s, 5, data)['Sneak Attack']).toMatch(/^3d6/)
  })

  it('Brutal Strike takes its dice and count from the Barbarian level, not the hero’s', () => {
    const s = rogueBarb()
    s.classes = [
      { slug: 'barbarian', name: 'Barbarian', level: 13, hitDie: 12 },
      { slug: 'fighter', name: 'Fighter', level: 4, hitDie: 10 },
    ]
    s.features = [
      ...s.features,
      { name: 'Brutal Strike', desc: '', from: 'Barbarian 9' },
      { name: 'Improved Brutal Strike', desc: '', from: 'Barbarian 13' },
    ]
    s.weapons = [{ name: 'Greataxe', atk: 0, dmg: '', type: '', range: '', slug: 'greataxe' }]
    addEffect(s, 'reckless')
    const axe = data.weapons.find((w) => w.slug === 'greataxe')!
    const p = weaponAttack(s, 17, s.weapons[0]!, axe, { key: 'w' })
    const forceful = attackRiders(s, 17, p).find((o) => o.def.key === 'brutal:forceful')!
    expect(forceful.base).toBe('1d10')
  })
})

describe('5e multiclass sheet: each spellcasting class’s own numbers', () => {
  it('Cleric 1 / Druid 4 / Artificer 2: a feature’s spell DC is its class’s', () => {
    const s = play(hero('cleric', { STR: 12, DEX: 10, CON: 13, INT: 14, WIS: 15, CHA: 8 }), [
      ['druid'],
      ['druid'],
      ['druid', 'circle-of-the-land'],
      ['druid'],
      ['artificer'],
      ['artificer'],
    ])
    const artificer = castingFor(s, 'Artificer 1')!
    const druid = castingFor(s, 'Druid 2')!
    expect(artificer.ability).toBe('INT')
    expect(druid.ability).toBe('WIS')
    expect(artificer.saveDc).not.toBe(druid.saveDc)
    expect(castingFor(s, 'Feat · Human')).toBeUndefined()
  })
})
