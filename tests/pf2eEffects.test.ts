import { describe, expect, it } from 'vitest'
import { PF2E_EFFECTS } from '../data/pf2e/effects'
import type { Pf2eFeat, Pf2eSheet } from '../types/sheets'
import {
  activeEffects,
  baseDeathAt,
  extraDice,
  ownEffects,
  recoveryDcChange,
  setGiven,
  speedNow,
  toggleEffect,
} from '../utils/pf2eEffects'
import { adjusted, deathAt, recoveryCheck, recoveryDc, takeDamage } from '../utils/pf2ePlay'
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
    expect(toggleEffect(s, 'Rage', 1)).toBe(
      'Rage ends: you lose its 4 remaining temporary Hit Points.',
    )
    expect(adjusted(s, 4, { kind: 'damage', attr: 'STR', melee: true }).value).toBe(4)
  })

  it('halves Rage for a Strike whose traits say agile, even without the agile flag', () => {
    const s = hero(['Rage'])
    toggleEffect(s, 'Rage', 1)
    const ctx = { kind: 'damage' as const, melee: true, traits: ['agile', 'finesse'] }
    expect(adjusted(s, 0, ctx).value).toBe(1)
    expect(adjusted(s, 0, { ...ctx, traits: ['finesse'] }).value).toBe(2)
  })

  it('takes Rage’s remaining temp HP away when it ends, not temp HP from elsewhere', () => {
    const s = hero(['Rage'], { attrs: { ...defaultSheet('pf2e').attrs, CON: 3 } })
    toggleEffect(s, 'Rage', 2)
    takeDamage(s, 2)
    expect(s.tempHp).toBe(3)
    expect(toggleEffect(s, 'Rage', 2)).toContain('lose its 3 remaining temporary Hit Points')
    expect(s.tempHp).toBe(0)
    s.tempHp = 9
    toggleEffect(s, 'Rage', 2)
    expect(toggleEffect(s, 'Rage', 2)).toBe('Rage ends.')
    expect(s.tempHp).toBe(9)
  })

  it('ends Rage when the hero is knocked out (Player Core 2 p. 72)', () => {
    const s = hero(['Rage'], { hp: 3 })
    toggleEffect(s, 'Rage', 1)
    expect(takeDamage(s, 10)).toContain('Rage ends')
    expect(s.effects?.on).toEqual([])
    expect(adjusted(s, 4, { kind: 'damage', melee: true }).value).toBe(4)
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
    expect(recoveryDc(s)).toBe(10)
    expect(recoveryDc({ ...s, feats: [] })).toBe(11)
    expect(recoveryCheck(s, 10)).toContain('vs DC 10, success')
  })
})
