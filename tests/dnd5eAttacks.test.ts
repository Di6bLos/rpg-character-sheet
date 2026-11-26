// 5e (2024) weapon attacks: ability and proficiency, fighting styles, Versatile and off-hand,
// Rage and Sneak Attack, crits and masteries (utils/dnd5eAttacks.ts).
import { describe, expect, it } from 'vitest'
import type { Dnd5eSheet } from '../types/sheets'
import {
  damageText,
  hitChance,
  rollAttack5e,
  unarmedAttack,
  weaponAttack,
  weaponDef,
} from '../utils/dnd5eAttacks'
import { addEffect, hasEffect } from '../utils/dnd5eEffects'
import { beginEncounter, startTurn } from '../utils/dnd5ePlay'
import { defaultSheet } from '../utils/sheetDefaults'
import { data } from './helpers/dnd5e'

const def = (slug: string) => data.weapons.find((w) => w.slug === slug)!

function hero(patch: Partial<Dnd5eSheet> = {}): Dnd5eSheet {
  return {
    ...defaultSheet('dnd5e'),
    classSlug: 'fighter',
    profBonus: 2,
    abilities: { STR: 16, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: 10 },
    proficiencies: {
      skills: [],
      expertise: [],
      tools: [],
      languages: [],
      weapons: ['Simple weapons', 'Martial weapons'],
      armor: [],
    },
    ...patch,
  }
}

const weapon = (slug: string) => ({
  name: def(slug).name,
  atk: 0,
  dmg: '',
  type: '',
  range: '',
  slug,
})

describe('weapon attacks', () => {
  it('adds the ability and PB, and Finesse takes the better of STR and DEX', () => {
    const s = hero({ abilities: { STR: 10, DEX: 18, CON: 10, INT: 10, WIS: 10, CHA: 10 } })
    const p = weaponAttack(s, 1, weapon('rapier'), def('rapier'), { key: 'w' })
    expect(p.ability).toBe('DEX')
    expect(p.test.bonus).toBe(6)
    expect(damageText(p)).toBe('1d8+4 Piercing')
  })

  it('takes the Versatile die in two hands, and Dueling only in one', () => {
    const s = hero({ featsTaken: [{ slug: 'dueling', name: 'Dueling', level: 1 }] })
    const one = weaponAttack(s, 1, weapon('longsword'), def('longsword'), { key: 'w' })
    expect(damageText(one)).toBe('1d8+5 Slashing')
    const two = weaponAttack(s, 1, weapon('longsword'), def('longsword'), {
      key: 'w',
      grip: { twoHands: true },
    })
    expect(damageText(two)).toBe('1d10+3 Slashing')
  })

  it('gives Archery +2 to ranged attacks', () => {
    const s = hero({ featsTaken: [{ slug: 'archery', name: 'Archery', level: 1 }] })
    expect(weaponAttack(s, 1, weapon('longbow'), def('longbow'), { key: 'w' }).test.bonus).toBe(6)
  })

  it('leaves the modifier off the off-hand attack, which takes the Bonus Action', () => {
    const s = hero()
    const p = weaponAttack(s, 1, weapon('handaxe'), def('handaxe'), {
      key: 'w',
      grip: { offhand: true },
    })
    expect(p.mod).toBe(0)
    expect(p.cost).toBe('bonus')
    const nick = weaponAttack({ ...s, masteries: ['dagger'] }, 1, weapon('dagger'), def('dagger'), {
      key: 'w',
      grip: { offhand: true },
    })
    expect(nick.cost).toBe('attack')
  })

  it('gives Disadvantage with a Heavy weapon below 13', () => {
    const s = hero({ abilities: { STR: 12, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 } })
    expect(
      weaponAttack(s, 1, weapon('greatsword'), def('greatsword'), { key: 'w' }).test.dis,
    ).toContain('Heavy, Strength under 13')
  })

  it('adds Rage Damage to Strength attacks and Hunter’s Mark’s die', () => {
    const s = hero()
    addEffect(s, 'rage')
    addEffect(s, 'hunters-mark')
    const p = weaponAttack(s, 1, weapon('greataxe'), def('greataxe'), {
      key: 'w',
      columns: { 'Rage Damage': '+2' },
    })
    expect(damageText(p)).toBe('1d12+5 Slashing + 1d6 Force (Hunter’s Mark)')
  })

  it('rolls Sneak Attack once a turn and doubles dice on a crit', () => {
    const s = hero()
    beginEncounter(s)
    startTurn(s)
    const cols = { 'Sneak Attack': '2d6' }
    const p = weaponAttack(s, 3, weapon('shortsword'), def('shortsword'), {
      key: 'w',
      columns: cols,
    })
    const r = rollAttack5e(s, p, { target: { ac: 30 }, sneak: true, d20: [20] })
    expect(r.crit).toBe(true)
    expect(r.line).toMatch(/Sneak Attack 4d6/)
    const again = weaponAttack(s, 3, weapon('shortsword'), def('shortsword'), {
      key: 'w',
      columns: cols,
    })
    expect(again.extras.some((e) => e.label === 'Sneak Attack')).toBe(false)
  })

  it('crits on 19 with Improved Critical', () => {
    const s = hero({ features: [{ name: 'Improved Critical', desc: '' }] })
    const p = weaponAttack(s, 3, weapon('longsword'), def('longsword'), { key: 'w' })
    expect(rollAttack5e(s, p, { target: { ac: 25 }, d20: [19] }).crit).toBe(true)
  })

  it('misses against the AC, but Graze still deals the modifier', () => {
    const s = hero({ masteries: ['greatsword'] })
    const p = weaponAttack(s, 1, weapon('greatsword'), def('greatsword'), { key: 'w' })
    const r = rollAttack5e(s, p, { target: { ac: 20 }, d20: [5] })
    expect(r.hit).toBe(false)
    expect(r.damage).toBe(3)
  })

  it('Vex gives the next attack Advantage, which that attack spends', () => {
    const s = hero({ masteries: ['shortsword'] })
    const p = weaponAttack(s, 1, weapon('shortsword'), def('shortsword'), { key: 'w' })
    rollAttack5e(s, p, { target: { ac: 5 }, d20: [15] })
    expect(hasEffect(s, 'vex')).toBe(true)
    const next = weaponAttack(s, 1, weapon('shortsword'), def('shortsword'), { key: 'w' })
    expect(next.test.adv).toContain('Vex')
    rollAttack5e(s, next, { target: { ac: 5 }, d20: [15, 3] })
    expect(s.effects?.some((e) => e.key === 'vex')).toBe(true)
  })

  it('halves damage for a resisting target', () => {
    const s = hero()
    const p = weaponAttack(s, 1, weapon('club'), def('club'), { key: 'w' })
    const r = rollAttack5e(s, p, { target: { ac: 5, immune: true }, d20: [12] })
    expect(r.damage).toBe(0)
  })

  it('uses the Martial Arts die and Dexterity for an Unarmed Strike', () => {
    const s = hero({
      abilities: { STR: 10, DEX: 16, CON: 10, INT: 10, WIS: 10, CHA: 10 },
      features: [{ name: 'Martial Arts', desc: '' }],
    })
    const p = unarmedAttack(s, 1, { columns: { 'Martial Arts': '1d6' } })
    expect(damageText(p)).toBe('1d6+3 Bludgeoning')
    expect(unarmedAttack(hero(), 1).mod).toBe(4)
  })

  it('keeps a hand-made sheet’s typed attack and damage, with the data’s properties', () => {
    const s = { ...hero(), classSlug: '' }
    const w = { name: 'Longsword', atk: 6, dmg: '1d8+4', type: 'Slashing', range: '5 ft' }
    const p = weaponAttack(s, 1, w, def('longsword'), { key: 'w', grip: { twoHands: true } })
    expect(p.test.bonus).toBe(6)
    expect(damageText(p)).toBe('1d10+4 Slashing')
  })

  it('finds a weapon by slug or name', () => {
    expect(weaponDef({ name: 'Longbow' }, data.weapons)?.slug).toBe('longbow')
  })

  it('works out the chance to hit with Advantage', () => {
    expect(hitChance(5, 15, 'normal')).toEqual({ hit: 55, crit: 5 })
    expect(hitChance(5, 15, 'adv').hit).toBe(80)
  })
})
