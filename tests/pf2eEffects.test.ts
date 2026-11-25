import { describe, expect, it } from 'vitest'
import { PF2E_EFFECTS } from '../data/pf2e/effects'
import type { Pf2eFeat, Pf2eSheet } from '../types/sheets'
import {
  activeEffects,
  baseDeathAt,
  extraDice,
  mapPenalties,
  ownEffects,
  recoveryDcChange,
  setGiven,
  speedNow,
  toggleEffect,
} from '../utils/pf2eEffects'
import {
  activeConditions,
  adjusted,
  conditionValue,
  deathAt,
  recoveryCheck,
  takeDamage,
} from '../utils/pf2ePlay'
import { defaultSheet } from '../utils/sheetDefaults'
import { buildData, loadSet } from './helpers/pf2e'

const feat = (name: string): Pf2eFeat => ({ type: 'Feat', level: '1', action: '', name, desc: '' })
function hero(feats: string[] = [], over: Partial<Pf2eSheet> = {}): Pf2eSheet {
  return { ...defaultSheet('pf2e'), hp: 20, hpMax: 20, feats: feats.map(feat), ...over }
}

describe('pf2e effect data', () => {
  it('names a feat, feature, action, subclass option or spell that exists', () => {
    const names = new Set([
      ...buildData.feats.map((f) => f.name),
      ...buildData.spells.map((s) => s.name),
      ...loadSet('actions').map((a) => a.name),
      ...buildData.classes.flatMap((c) => [...c.features, ...c.subclasses].map((f) => f.name)),
    ])
    for (const e of PF2E_EFFECTS) expect(names, e.name).toContain(e.name.replace(' (ally)', ''))
  })
})

describe('pf2e effects on numbers', () => {
  it('turns Rage on: temp HP of level + CON, +2 melee damage, +1 if agile, nothing ranged', () => {
    const s = hero(['Rage'], { attrs: { ...defaultSheet('pf2e').attrs, CON: 3 }, tempHp: 2 })
    expect(toggleEffect(s, 'Rage', 1)).toContain('4 temporary Hit Points')
    expect(s.tempHp).toBe(4)
    expect(adjusted(s, 4, { kind: 'damage', attr: 'STR', melee: true }).value).toBe(6)
    expect(adjusted(s, 4, { kind: 'damage', attr: 'STR', melee: true, agile: true }).value).toBe(5)
    expect(adjusted(s, 0, { kind: 'damage', melee: false }).changed).toBe(false)
    expect(toggleEffect(s, 'Rage', 1)).toBe('Rage ends.')
    expect(adjusted(s, 4, { kind: 'damage', attr: 'STR', melee: true }).value).toBe(4)
  })

  it('only applies a toggle the hero has', () => {
    expect(ownEffects(hero())).toEqual([])
    expect(ownEffects(hero(['Rage'])).map((e) => e.name)).toEqual(['Rage'])
  })

  it('stacks status bonuses by type: Bless and Heroism give +2, not +3; a penalty still applies', () => {
    const s = hero()
    setGiven(s, 'Bless', true)
    setGiven(s, 'Heroism', true, 2)
    expect(adjusted(s, 9, { kind: 'attack', attr: 'STR' }).value).toBe(11)
    s.conditions = ['Frightened']
    s.conditionValues = { Frightened: 1 }
    expect(adjusted(s, 9, { kind: 'attack', attr: 'STR' }).value).toBe(10)
    expect(adjusted(s, 5, { kind: 'save', attr: 'WIS', save: 'Will' }).value).toBe(6)
    setGiven(s, 'Heroism', false)
    expect(activeEffects(s).map((a) => a.def.name)).toEqual(['Bless'])
  })

  it('Courageous Anthem adds +1 status to attacks and damage, ranged too', () => {
    const s = hero(['Courageous Anthem'])
    toggleEffect(s, 'Courageous Anthem', 1)
    expect(adjusted(s, 7, { kind: 'attack', attr: 'DEX' }).value).toBe(8)
    expect(adjusted(s, 0, { kind: 'damage', melee: false }).value).toBe(1)
  })

  it('Fleet adds 5 feet of Speed', () => {
    expect(speedNow(hero(['Fleet'], { speed: '25 ft' }))).toEqual({ text: '30 ft', changed: true })
    expect(speedNow(hero([], { speed: '25 ft' })).changed).toBe(false)
  })
})

describe('pf2e extra damage dice', () => {
  const dagger = { traits: 'Agile, Finesse, Thrown 10 ft', ranged: false }
  const club = { traits: '', ranged: false }

  it('adds sneak attack against an off-guard target with an agile, finesse or ranged weapon', () => {
    const s = hero(['Sneak Attack'])
    expect(extraDice(s, 1, dagger, { offGuard: true })).toEqual([
      { dice: '1d6', label: 'sneak attack' },
    ])
    expect(extraDice(s, 5, dagger, { offGuard: true })[0]?.dice).toBe('2d6')
    expect(extraDice(s, 1, dagger, { offGuard: false })).toEqual([])
    expect(extraDice(s, 1, club, { offGuard: true })).toEqual([])
    expect(extraDice(s, 1, { traits: '', ranged: true }, { offGuard: true })).toHaveLength(1)
  })

  it('adds the Precision edge on the first hit on hunted prey', () => {
    const s = hero(['Precision'])
    expect(extraDice(s, 11, club, { huntedPrey: true })[0]?.dice).toBe('2d8')
    expect(extraDice(s, 11, club, {})).toEqual([])
  })
})

describe('pf2e Diehard and Toughness (pp. 254, 263)', () => {
  it('Diehard dies at dying 5', () => {
    const s = hero(['Diehard'], { hp: 0, dying: 3 })
    expect(baseDeathAt(s)).toBe(5)
    expect(deathAt({ ...s, doomed: 1 })).toBe(4)
    takeDamage(s, 1)
    expect(s.dying).toBe(4)
    expect(takeDamage(s, 1)).toContain('dies')
  })

  it('Toughness lowers the recovery check DC by 1', () => {
    const s = hero(['Toughness'], { hp: 0, dying: 1 })
    expect(recoveryDcChange(s)).toBe(-1)
    expect(recoveryCheck(s, 10)).toContain('vs DC 10, success')
  })
})

describe('pf2e effects, second wave', () => {
  const dex = (DEX: number, STR = 0) => ({ ...defaultSheet('pf2e').attrs, DEX, STR })

  it('applies the ranger’s edges only while hunting prey (Player Core p. 154)', () => {
    const s = hero(['Hunt Prey', 'Flurry', 'Outwit'])
    expect(mapPenalties(s, false)).toEqual([0, 5, 10])
    expect(adjusted(s, 5, { kind: 'skill', attr: 'CHA', skill: 'Deception' }).value).toBe(5)
    toggleEffect(s, 'Hunt Prey', 1)
    expect(mapPenalties(s, false)).toEqual([0, 3, 6])
    expect(mapPenalties(s, true)).toEqual([0, 2, 4])
    expect(adjusted(s, 5, { kind: 'skill', attr: 'CHA', skill: 'Deception' }).value).toBe(7)
    expect(adjusted(s, 5, { kind: 'skill', attr: 'WIS', skill: 'Survival' }).value).toBe(5)
    expect(adjusted(s, 18, { kind: 'ac' }).value).toBe(19)
  })

  it('adds a thief’s DEX to finesse melee damage when it beats STR (p. 167)', () => {
    const s = hero(['Thief'], { attrs: dex(4, 1) })
    const finesse = { kind: 'damage' as const, melee: true, traits: ['finesse'] }
    expect(adjusted(s, 1, finesse).value).toBe(4)
    expect(adjusted(s, 1, { ...finesse, traits: [] }).changed).toBe(false)
    expect(adjusted(s, 0, { ...finesse, melee: false }).changed).toBe(false)
  })

  it('scales Precise Strike with level, for agile or finesse melee Strikes (PC2 p. 158)', () => {
    const s = hero(['Precise Strike'])
    const ctx = { kind: 'damage' as const, melee: true, traits: ['finesse'] }
    expect(adjusted(s, 0, { ...ctx, level: 1 }).value).toBe(2)
    expect(adjusted(s, 0, { ...ctx, level: 9 }).value).toBe(4)
    expect(adjusted(s, 0, { ...ctx, traits: [], level: 9 }).changed).toBe(false)
  })

  it('adds weapon specialization by rank; the greater one replaces it (p. 136)', () => {
    const s = hero(['Weapon Specialization'])
    expect(adjusted(s, 0, { kind: 'damage', rank: 'E' }).value).toBe(2)
    expect(adjusted(s, 0, { kind: 'damage', rank: 'M' }).value).toBe(3)
    expect(adjusted(s, 0, { kind: 'damage', rank: 'T' }).changed).toBe(false)
    s.feats.push(feat('Greater Weapon Specialization'))
    expect(adjusted(s, 0, { kind: 'damage', rank: 'E' }).value).toBe(4)
  })

  it('Mountain Stance: +4 item AC, no DEX to AC, −5 feet (PC2 p. 118)', () => {
    const s = hero(['Mountain Stance'], { attrs: dex(2), speed: '25 ft' })
    toggleEffect(s, 'Mountain Stance', 1)
    expect(adjusted(s, 15, { kind: 'ac' }).value).toBe(17)
    expect(speedNow(s).text).toBe('20 ft')
  })

  it('a raised shield and the Shield spell are both circumstance bonuses: +2, not +3', () => {
    const s = hero(['Shield'], {
      shield: { name: 'Steel Shield', hardness: 5, hp: 20, hpMax: 20, bt: 10, raised: true },
    })
    expect(adjusted(s, 16, { kind: 'ac' }).value).toBe(18)
    toggleEffect(s, 'Shield', 1)
    expect(adjusted(s, 16, { kind: 'ac' }).value).toBe(18)
    s.shield.raised = false
    expect(adjusted(s, 16, { kind: 'ac' }).value).toBe(17)
  })

  it('Enlarge gives clumsy 1 and melee damage; Haste gives quickened (pp. 329, 335)', () => {
    const s = hero()
    setGiven(s, 'Enlarge', true, 4)
    expect(conditionValue(s, 'Clumsy')).toBe(1)
    expect(adjusted(s, 18, { kind: 'ac' }).value).toBe(17)
    expect(adjusted(s, 0, { kind: 'damage', melee: true }).value).toBe(4)
    expect(adjusted(s, 0, { kind: 'damage', melee: false }).changed).toBe(false)
    setGiven(s, 'Haste', true)
    expect(activeConditions(s).has('Quickened')).toBe(true)
  })

  it('adds strategic strike’s dice to a Strike using Devise a Stratagem (PC2 p. 100)', () => {
    const s = hero(['Strategic Strike'])
    const rapier = { traits: 'Finesse', ranged: false }
    expect(extraDice(s, 5, rapier, { stratagem: true })).toEqual([
      { dice: '2d6', label: 'strategic strike' },
    ])
    expect(extraDice(s, 5, rapier, {})).toEqual([])
  })
})
