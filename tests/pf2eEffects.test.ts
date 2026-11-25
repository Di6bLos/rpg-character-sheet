import { describe, expect, it } from 'vitest'
import { PF2E_EFFECTS } from '../data/pf2e/effects'
import type { Pf2eFeat, Pf2eSheet } from '../types/sheets'
import {
  activeEffects,
  baseDeathAt,
  damageConditions,
  extraDice,
  mapPenalties,
  ownEffects,
  recoveryDcChange,
  setGiven,
  speedNow,
  stratagemAttacked,
  stratagemDamaged,
  stratagemUsesInt,
  toggleEffect,
} from '../utils/pf2eEffects'
import {
  activeConditions,
  adjusted,
  conditionValue,
  deathAt,
  recoveryCheck,
  recoveryDc,
  takeDamage,
} from '../utils/pf2ePlay'
import { endPf2eEncounter, endPf2eTurn, startPf2eTurn } from '../utils/pf2eActions'
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
    for (const e of PF2E_EFFECTS)
      expect(names, e.name).toContain(e.has?.name ?? e.name.replace(' (ally)', ''))
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
    expect(speedNow(hero(['Fleet'], { speed: '25 ft' }))).toMatchObject({
      text: '30 ft',
      changed: true,
    })
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
    const s = hero(['Hunt Prey', 'Precision'])
    expect(extraDice(s, 11, club, { huntedPrey: true })).toEqual([])
    expect(damageConditions(s)).toEqual([])
    toggleEffect(s, 'Hunt Prey', 11)
    expect(damageConditions(s)).toEqual(['huntedPrey'])
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

  it("stacks the raised shield's own bonus (Buckler +1, Fortress +3), and none once broken", () => {
    const shield = { name: 'Buckler', hardness: 3, hp: 6, hpMax: 6, bt: 3, raised: true, ac: 1 }
    const s = hero([], { shield })
    expect(adjusted(s, 16, { kind: 'ac' }).value).toBe(17)
    s.shield = { ...shield, name: 'Fortress Shield', ac: 3 }
    expect(adjusted(s, 16, { kind: 'ac' }).value).toBe(19)
    s.shield.hp = 3
    expect(adjusted(s, 16, { kind: 'ac' }).changed).toBe(false)
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

  it('Mountain Stance’s +4 item AC adds to Mystic Armor’s +1, as its text says (PC2 p. 118)', () => {
    const s = hero(['Mountain Stance', 'Mystic Armor'])
    toggleEffect(s, 'Mountain Stance', 1)
    toggleEffect(s, 'Mystic Armor', 1)
    const ac = adjusted(s, 15, { kind: 'ac' })
    expect(ac.value).toBe(20)
    expect(ac.note).toBe('+5 Mountain Stance + Mystic Armor')
    toggleEffect(s, 'Mountain Stance', 1)
    expect(adjusted(s, 15, { kind: 'ac' }).value).toBe(16)
  })

  it('notes that Flurry and Outwit count only against the hunted prey (Player Core p. 154)', () => {
    const notes = (name: string) => PF2E_EFFECTS.find((e) => e.name === name)?.note ?? ''
    expect(notes('Flurry')).toMatch(/only for attacks against your hunted prey/i)
    expect(notes('Outwit')).toMatch(/only against your prey/i)
  })
})

describe('pf2e Devise a Stratagem (Player Core 2 p. 103)', () => {
  const int = (INT: number, DEX = 0) => ({ ...defaultSheet('pf2e').attrs, INT, DEX })

  it('uses INT for agile, finesse and ranged Strikes, not thrown or plain melee ones', () => {
    const s = hero([], { attrs: int(4, 2) })
    expect(stratagemUsesInt(s, { traits: 'Finesse', attr: 'DEX' })).toBe(true)
    expect(stratagemUsesInt(s, { traits: 'Deadly d10', ranged: true, attr: 'DEX' })).toBe(true)
    expect(stratagemUsesInt(s, { traits: 'Thrown 30 ft', ranged: true })).toBe(false)
    expect(stratagemUsesInt(s, { traits: 'Sweep' })).toBe(false)
  })

  it('keeps the better attribute: INT only when it is at least the usual one', () => {
    expect(stratagemUsesInt(hero([], { attrs: int(2, 4) }), { traits: 'Agile', attr: 'DEX' })).toBe(
      false,
    )
    expect(stratagemUsesInt(hero([], { attrs: int(3, 3) }), { traits: 'Agile', attr: 'DEX' })).toBe(
      true,
    )
  })

  it('covers only the next Strike: its attack spends it, its damage keeps the dice once', () => {
    const struck = stratagemAttacked({ ready: true }, 0, true)
    expect(struck).toEqual({ ready: false, struck: 0 })
    expect(stratagemAttacked(struck, 0, false)).toEqual({ ready: false, struck: undefined })
    expect(stratagemDamaged(struck, 1)).toBe(struck)
    expect(stratagemDamaged(struck, 0)).toEqual({ ready: false })
    expect(stratagemAttacked({ ready: true }, 2, false)).toEqual({
      ready: false,
      struck: undefined,
    })
  })
})

describe('pf2e effects that end by themselves (review fixes)', () => {
  it('a bard’s own anthem lasts 1 round: it ends at the start of their next turn (p. 370)', () => {
    for (const name of ['Courageous Anthem', 'Rallying Anthem']) {
      const s = hero([name])
      startPf2eTurn(s)
      toggleEffect(s, name, 1)
      endPf2eTurn(s)
      expect(s.effects?.on).toEqual([name])
      expect(startPf2eTurn(s)).toContain(`${name} ends`)
      expect(s.effects?.on).toEqual([])
    }
  })

  it('an ally’s anthem lasts through the one turn they take in that round', () => {
    for (const name of ['Courageous Anthem (ally)', 'Rallying Anthem (ally)']) {
      const s = hero()
      setGiven(s, name, true)
      startPf2eTurn(s)
      expect(s.effects?.given.map((g) => g.name)).toEqual([name])
      endPf2eTurn(s)
      expect(s.effects?.given).toEqual([])
    }
  })

  it('Rage ends with the encounter, and its temporary HP go (Player Core 2 p. 72)', () => {
    const s = hero(['Rage'], { attrs: { ...defaultSheet('pf2e').attrs, CON: 2 } })
    startPf2eTurn(s)
    toggleEffect(s, 'Rage', 1)
    expect(s.tempHp).toBe(3)
    expect(endPf2eEncounter(s)).toContain('Rage ends')
    expect(s.effects?.on).toEqual([])
    expect(s.tempHp).toBe(0)
  })
})
