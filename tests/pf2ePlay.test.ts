import { describe, expect, it } from 'vitest'
import type { Pf2eSheet } from '../types/sheets'
import {
  adjusted,
  conditionMods,
  deathAt,
  degreeOf,
  heal,
  heroicRecovery,
  initiativeCheck,
  isDead,
  raisedShieldBonus,
  recoveryCheck,
  shieldBlockProblem,
  shieldBroken,
  stackMods,
  strikeDamage,
  takeDamage,
} from '../utils/pf2ePlay'
import { defaultSheet } from '../utils/sheetDefaults'

function hero(over: Partial<Pf2eSheet> = {}): Pf2eSheet {
  return { ...defaultSheet('pf2e'), hp: 20, hpMax: 20, ...over }
}
const SHIELD_BLOCK = { type: 'General', level: '1', action: '↺', name: 'Shield Block', desc: '' }

describe('pf2e degrees of success (Player Core p. 401)', () => {
  it('beats the DC by 10 for a critical success, misses by 10 for a critical failure', () => {
    expect(degreeOf(25, 12, 15)).toBe('critical success')
    expect(degreeOf(15, 8, 15)).toBe('success')
    expect(degreeOf(14, 8, 15)).toBe('failure')
    expect(degreeOf(5, 3, 15)).toBe('critical failure')
  })

  it('moves one degree on a natural 20 or 1', () => {
    expect(degreeOf(16, 20, 15)).toBe('critical success')
    expect(degreeOf(12, 20, 15)).toBe('success')
    expect(degreeOf(16, 1, 15)).toBe('failure')
    expect(degreeOf(26, 1, 15)).toBe('success')
  })
})

describe('pf2e bonuses and penalties (p. 400)', () => {
  it('keeps only the worst penalty and best bonus of each type; untyped all apply', () => {
    const { total } = stackMods([
      { value: -2, type: 'status', source: 'Frightened 2' },
      { value: -1, type: 'status', source: 'Sickened 1' },
      { value: -2, type: 'circumstance', source: 'Off-guard' },
      { value: 1, type: 'status', source: 'Heroism' },
      { value: -1, type: 'untyped', source: 'A' },
      { value: -1, type: 'untyped', source: 'B' },
    ])
    expect(total).toBe(-2 + 1 - 2 - 1 - 1)
  })
})

describe('pf2e conditions on numbers (pp. 442–447)', () => {
  it('frightened and sickened hit every check and DC but not damage, and do not stack', () => {
    const s = hero({
      conditions: ['Frightened', 'Sickened'],
      conditionValues: { Frightened: 2, Sickened: 1 },
    })
    expect(adjusted(s, 20, { kind: 'ac' }).value).toBe(18)
    expect(adjusted(s, 7, { kind: 'save', attr: 'CON', save: 'Fortitude' }).value).toBe(5)
    expect(adjusted(s, 5, { kind: 'damage', attr: 'STR' }).changed).toBe(false)
  })

  it('clumsy lowers AC, Reflex and DEX skills, not Strength', () => {
    const s = hero({ conditions: ['Clumsy'], conditionValues: { Clumsy: 2 } })
    expect(adjusted(s, 18, { kind: 'ac' }).value).toBe(16)
    expect(adjusted(s, 6, { kind: 'save', attr: 'DEX', save: 'Reflex' }).value).toBe(4)
    expect(adjusted(s, 5, { kind: 'skill', attr: 'DEX' }).value).toBe(3)
    expect(adjusted(s, 9, { kind: 'attack', attr: 'STR' }).changed).toBe(false)
  })

  it('enfeebled lowers Strength attacks and their damage', () => {
    const s = hero({ conditions: ['Enfeebled'], conditionValues: { Enfeebled: 1 } })
    expect(adjusted(s, 9, { kind: 'attack', attr: 'STR' }).value).toBe(8)
    expect(adjusted(s, 4, { kind: 'damage', attr: 'STR' }).value).toBe(3)
    expect(adjusted(s, 9, { kind: 'attack', attr: 'DEX' }).changed).toBe(false)
  })

  it('prone means off-guard (−2 AC) and −2 to attack rolls', () => {
    const s = hero({ conditions: ['Prone'] })
    expect(adjusted(s, 18, { kind: 'ac' }).value).toBe(16)
    expect(adjusted(s, 9, { kind: 'attack', attr: 'STR' }).value).toBe(7)
  })

  it('unconscious: −4 status to AC, Perception and Reflex, plus off-guard', () => {
    const s = hero({ conditions: ['Unconscious'] })
    expect(adjusted(s, 18, { kind: 'ac' }).value).toBe(12)
    expect(adjusted(s, 7, { kind: 'perception', attr: 'WIS' }).value).toBe(3)
    expect(adjusted(s, 7, { kind: 'save', attr: 'CON', save: 'Fortitude' }).changed).toBe(false)
  })

  it('encumbered is clumsy 1 unless clumsy is already worse', () => {
    expect(adjusted(hero({ conditions: ['Encumbered'] }), 18, { kind: 'ac' }).value).toBe(17)
    const both = hero({ conditions: ['Encumbered', 'Clumsy'], conditionValues: { Clumsy: 3 } })
    expect(adjusted(both, 18, { kind: 'ac' }).value).toBe(15)
  })

  it('names what changed a number', () => {
    const s = hero({ conditions: ['Frightened', 'Prone'], conditionValues: { Frightened: 1 } })
    expect(adjusted(s, 18, { kind: 'ac' }).note).toBe('−1 Frightened 1, −2 Off-guard')
    expect(conditionMods(hero(), { kind: 'ac' })).toEqual([])
  })
})

describe('pf2e damage and dying (pp. 410–411)', () => {
  it('uses temp HP first', () => {
    const s = hero({ tempHp: 5 })
    takeDamage(s, 8)
    expect([s.tempHp, s.hp]).toEqual([0, 17])
  })

  it('knocks out at 0 HP with dying 1, or 2 on a crit, plus wounded', () => {
    const s = hero({ wounded: 1 })
    const msg = takeDamage(s, 30, { crit: true })
    expect(s.hp).toBe(0)
    expect(s.dying).toBe(3)
    expect(s.conditions).toContain('Unconscious')
    expect(msg).toContain('Knocked out')
  })

  it('raises dying by 1 (2 on a crit) for damage while dying, and dies at 4 less doomed', () => {
    const s = hero({ hp: 0, dying: 1, doomed: 1, conditions: ['Unconscious'] })
    expect(deathAt(s)).toBe(3)
    takeDamage(s, 3)
    expect(s.dying).toBe(2)
    expect(isDead(s)).toBe(false)
    expect(takeDamage(s, 3)).toContain('dies')
    expect(isDead(s)).toBe(true)
  })

  it('Shield Block takes up to the Hardness, then shield and hero share the rest', () => {
    const s = hero({
      feats: [SHIELD_BLOCK],
      shield: { name: 'Steel Shield', hardness: 5, hp: 20, hpMax: 20, bt: 10, raised: true },
    })
    const msg = takeDamage(s, 12, { shieldBlock: true })
    expect(s.shield.hp).toBe(13)
    expect(s.hp).toBe(13)
    expect(msg).toContain('blocks 5')
    takeDamage(s, 9, { shieldBlock: true })
    expect(s.shield.hp).toBe(9)
    expect(s.shield.raised).toBe(false)
  })

  it('healing from 0 ends dying, adds wounded and wakes the hero', () => {
    const s = hero({ hp: 0, dying: 2, wounded: 0, conditions: ['Unconscious'] })
    heal(s, 5)
    expect(s).toMatchObject({ hp: 5, dying: 0, wounded: 1 })
    expect(s.conditions).not.toContain('Unconscious')
  })

  it('recovery checks against DC 10 + dying', () => {
    const s = hero({ hp: 0, dying: 2, conditions: ['Unconscious'] })
    expect(recoveryCheck(s, 20)).toContain('critical success')
    expect(s.dying).toBe(0)
    expect(s.wounded).toBe(1)
    const t = hero({ hp: 0, dying: 1 })
    recoveryCheck(t, 5)
    expect(t.dying).toBe(2)
    recoveryCheck(t, 1)
    expect(t.dying).toBe(4)
    expect(isDead(t)).toBe(true)
  })

  it('Heroic Recovery spends every Hero Point and leaves wounded alone', () => {
    const s = hero({ hp: 0, dying: 3, wounded: 1, heroPoints: 2 })
    heroicRecovery(s)
    expect(s).toMatchObject({ dying: 0, wounded: 1, heroPoints: 0, hp: 0 })
    expect(heroicRecovery(hero({ dying: 1, heroPoints: 0 }))).toBe('No Hero Points left.')
  })

  it('massive damage: one blow of double max HP or more kills outright (p. 412)', () => {
    const s = hero({ tempHp: 5 })
    const msg = takeDamage(s, 40)
    expect(isDead(s)).toBe(true)
    expect(s).toMatchObject({ hp: 0, tempHp: 0 })
    expect(msg).toContain('dies instantly')
    const t = hero()
    takeDamage(t, 39)
    expect(isDead(t)).toBe(false)
    expect(t.dying).toBe(1)
  })

  it('massive damage counts what gets past Shield Block, and respects doomed', () => {
    const s = hero({
      feats: [SHIELD_BLOCK],
      shield: { name: 'Steel Shield', hardness: 5, hp: 20, hpMax: 20, bt: 10, raised: true },
    })
    takeDamage(s, 44, { shieldBlock: true })
    expect(isDead(s)).toBe(false)
    const t = hero({ doomed: 2 })
    takeDamage(t, 40)
    expect(t.dying).toBe(2)
    expect(isDead(t)).toBe(true)
  })

  // Player Core p. 411: damage while dying raises dying, but temporary HP take it first.
  it('while dying, temporary HP take the damage first; dying rises only if some gets through', () => {
    const s = hero({ hp: 0, dying: 1, tempHp: 6, conditions: ['Unconscious'] })
    expect(takeDamage(s, 4)).toContain('Temporary HP took 4')
    expect(s).toMatchObject({ dying: 1, tempHp: 2 })
    takeDamage(s, 5)
    expect(s).toMatchObject({ dying: 2, tempHp: 0 })
  })

  it('the dead are not healed and roll no recovery checks or Heroic Recovery', () => {
    const s = hero({ hp: 0, dying: 4, wounded: 1, heroPoints: 2, conditions: ['Unconscious'] })
    expect(heal(s, 10)).toContain('died')
    expect(recoveryCheck(s, 20)).toContain('died')
    expect(heroicRecovery(s)).toContain('died')
    expect(s).toMatchObject({ hp: 0, dying: 4, wounded: 1, heroPoints: 2 })
    expect(s.conditions).toContain('Unconscious')
  })
})

describe('pf2e shields (Player Core pp. 269, 274)', () => {
  const shield = (over: Partial<Pf2eSheet['shield']> = {}) => ({
    name: 'Steel Shield',
    hardness: 5,
    hp: 20,
    hpMax: 20,
    bt: 10,
    raised: true,
    ...over,
  })

  it('a raised shield gives its own AC bonus, +2 when the sheet has none', () => {
    expect(raisedShieldBonus(hero({ shield: shield({ name: 'Buckler', ac: 1 }) }))).toBe(1)
    expect(raisedShieldBonus(hero({ shield: shield({ name: 'Fortress Shield', ac: 3 }) }))).toBe(3)
    expect(raisedShieldBonus(hero({ shield: shield() }))).toBe(2)
    expect(raisedShieldBonus(hero({ shield: shield({ raised: false }) }))).toBe(0)
  })

  // Player Core p. 262: the feat, physical damage from an attack, and the reaction.
  it('Shield Block needs the feat, physical damage and an unspent reaction, and spends it', () => {
    expect(shieldBlockProblem(hero({ shield: shield() }))).toMatch(/Shield Block feat/)
    const s = hero({ shield: shield(), feats: [SHIELD_BLOCK] })
    expect(shieldBlockProblem(s, ['slashing'])).toBe('')
    expect(shieldBlockProblem(s, [''])).toBe('')
    expect(shieldBlockProblem(s, ['fire'])).toMatch(/physical/)
    const fire = takeDamage(s, 8, { shieldBlock: true, type: 'fire' })
    expect(fire).toMatch(/No Shield Block/)
    expect([s.shield.hp, s.hp]).toEqual([20, 12])
    s.turn = { active: false, actions: 0, reaction: true, attacks: 0, round: 1 }
    expect(takeDamage(s, 8, { shieldBlock: true, type: 'piercing' })).toContain('blocks 5')
    expect(s.turn.reaction).toBe(false)
    expect(shieldBlockProblem(s, ['piercing'])).toMatch(/reaction is spent/)
    expect(takeDamage(s, 8, { shieldBlock: true })).toMatch(/No Shield Block/)
    const held = hero({ shield: shield() })
    held.inventory = [
      { name: 'Shield', qty: '1', pf2e: { count: 1, bulk: 1, carry: 'held', shieldBlock: true } },
    ]
    expect(shieldBlockProblem(held)).toBe('')
  })

  it('is broken at or below its Broken Threshold: no AC bonus and no Shield Block', () => {
    const s = hero({ shield: shield({ hp: 10 }), feats: [SHIELD_BLOCK] })
    expect(shieldBroken(s)).toBe(true)
    expect(raisedShieldBonus(s)).toBe(0)
    const msg = takeDamage(s, 8, { shieldBlock: true })
    expect(msg).not.toContain('blocks')
    expect([s.shield.hp, s.hp]).toEqual([10, 12])
    expect(shieldBroken(hero({ shield: shield({ hp: 11 }) }))).toBe(false)
  })
})

describe('pf2e damage rolls (Player Core p. 406)', () => {
  it('never deal less than 1, and a critical hit doubles after that', () => {
    expect(strikeDamage(-2)).toBe(1)
    expect(strikeDamage(0, true)).toBe(2)
    expect(strikeDamage(7, true)).toBe(14)
    expect(strikeDamage(7)).toBe(7)
  })
})

describe('pf2e initiative (Player Core p. 436)', () => {
  it('rolls Perception after conditions, as the sheet and the battle board both use it', () => {
    const s = hero({
      saves: [{ label: 'Perception', rank: 'T', value: 7 }],
      conditions: ['Frightened'],
      conditionValues: { Frightened: 2 },
    })
    expect(initiativeCheck(s).value).toBe(5)
    expect(initiativeCheck(hero({ saves: [] })).value).toBe(0)
  })
})
