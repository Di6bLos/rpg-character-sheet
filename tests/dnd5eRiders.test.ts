// 5e (2024) attack riders: Brutal Strike, Cunning Strike, maneuvers, Arcane Shots, Divine and
// Primal Strike, subclass damage riders, and what can turn a miss into a hit
// (utils/dnd5eRiders.ts through rollAttack5e).
import { describe, expect, it } from 'vitest'
import type { Dnd5eSheet } from '../types/sheets'
import { rollAttack5e, unarmedAttack, weaponAttack } from '../utils/dnd5eAttacks'
import { addEffect, hasEffect } from '../utils/dnd5eEffects'
import { beginEncounter, startTurn, usesLeft } from '../utils/dnd5ePlay'
import {
  DND5E_RIDERS,
  attackRiders,
  defaultRiders,
  limitRiders,
  riderDamageText,
  riderPlan,
} from '../utils/dnd5eRiders'
import { defaultSheet } from '../utils/sheetDefaults'
import { build, data, levelTo } from './helpers/dnd5e'

const def = (slug: string) => data.weapons.find((w) => w.slug === slug)!
const weapon = (slug: string) => ({
  name: def(slug).name,
  atk: 0,
  dmg: '',
  type: '',
  range: '',
  slug,
})

/** A d20 of `d20`, then every other die rolling its maximum. */
const rolls = (d20: number, ...more: number[]) => {
  const seq = [(d20 - 0.5) / 20, ...more]
  let i = 0
  return () => (i < seq.length ? seq[i++]! : 0.999)
}

function hero(features: string[], patch: Partial<Dnd5eSheet> = {}): Dnd5eSheet {
  const s: Dnd5eSheet = {
    ...defaultSheet('dnd5e'),
    classSlug: 'fighter',
    profBonus: 4,
    abilities: { STR: 18, DEX: 16, CON: 14, INT: 14, WIS: 14, CHA: 14 },
    proficiencies: {
      skills: [],
      expertise: [],
      tools: [],
      languages: [],
      weapons: ['Simple weapons', 'Martial weapons'],
      armor: [],
    },
    features: features.map((name) => ({ name, desc: '', from: 'Test 9' })),
    ...patch,
  }
  beginEncounter(s)
  s.awaitingInitiative = false
  startTurn(s)
  return s
}

const plan = (s: Dnd5eSheet, level: number, slug: string, cols: Record<string, string> = {}) =>
  weaponAttack(s, level, weapon(slug), def(slug), { key: 'w', columns: cols })

describe('Brutal Strike', () => {
  it('needs Reckless Attack and a Strength attack, forgoes Advantage and adds 1d10', () => {
    const s = hero(['Brutal Strike', 'Reckless Attack'])
    const axe = plan(s, 9, 'greataxe')
    const before = attackRiders(s, 9, axe).find((o) => o.def.key === 'brutal:forceful')!
    expect(before.why).toBe('Needs Reckless Attack')
    addEffect(s, 'reckless')
    const p = plan(s, 9, 'greataxe')
    expect(p.test.adv).toContain('Reckless Attack')
    const opts = attackRiders(s, 9, p)
    const forceful = opts.find((o) => o.def.key === 'brutal:forceful')!
    expect(forceful.why).toBe('')
    expect(forceful.base).toBe('1d10')
    expect(opts.some((o) => o.def.key === 'brutal:staggering')).toBe(false)
    const rd = riderPlan(s, 9, p, [{ key: 'brutal:forceful' }])
    expect(rd.forgoAdv).toBe(true)
    const r = rollAttack5e(s, p, { riders: rd, target: { ac: 10 }, rng: rolls(15) })
    expect(r.line).toMatch(/Advantage forgone \(Brutal Strike\)/)
    expect(r.line).toMatch(/Brutal Strike 1d10: 10/)
    expect(r.line).toMatch(/Forceful Blow: The target is pushed 15 ft/)
    expect(attackRiders(s, 9, p).find((o) => o.def.key === 'brutal:forceful')!.why).toBe(
      'Used this turn',
    )
  })

  it('takes two effects and 2d10 at level 17 with Improved Brutal Strike', () => {
    const s = hero(['Brutal Strike', 'Improved Brutal Strike'])
    addEffect(s, 'reckless')
    const p = plan(s, 17, 'greataxe')
    const opts = attackRiders(s, 17, p)
    const kept = limitRiders(s, 17, opts, [
      { key: 'brutal:forceful' },
      { key: 'brutal:sundering' },
      { key: 'brutal:hamstring' },
    ])
    expect(kept.map((k) => k.key)).toEqual(['brutal:sundering', 'brutal:hamstring'])
    expect(riderDamageText(opts, kept)).toEqual(['2d10 Slashing (Brutal Strike)'])
  })

  it('can’t ride an attack with Disadvantage', () => {
    const s = hero(['Brutal Strike'])
    addEffect(s, 'reckless')
    s.conditions = ['Poisoned']
    const p = plan(s, 9, 'greataxe')
    expect(attackRiders(s, 9, p).find((o) => o.def.key === 'brutal:forceful')!.why).toBe(
      'The attack has Disadvantage',
    )
  })
})

describe('Cunning Strike', () => {
  const rogue = (lvl: number, feats: string[]) => {
    const s = hero(['Sneak Attack', 'Cunning Strike', ...feats])
    s.abilities.DEX = 18
    return { s, cols: { 'Sneak Attack': `${Math.ceil(lvl / 2)}d6` } }
  }

  it('trades Sneak Attack dice for an effect with its DC', () => {
    const { s, cols } = rogue(5, [])
    const p = plan(s, 5, 'rapier', cols)
    const opts = attackRiders(s, 5, p, { sneak: true, columns: cols })
    const trip = opts.find((o) => o.def.key === 'cun:trip')!
    expect(trip.save).toEqual({ ability: 'DEX', dc: 16 })
    expect(attackRiders(s, 5, p, { sneak: false }).find((o) => o.def.key === 'cun:trip')!.why).toBe(
      'Needs Sneak Attack',
    )
    const rd = riderPlan(s, 5, p, [{ key: 'cun:trip' }], { sneak: true })
    expect(rd.sneakCost).toBe(1)
    const r = rollAttack5e(s, p, { riders: rd, sneak: true, target: { ac: 10 }, rng: rolls(15) })
    expect(r.line).toMatch(/Sneak Attack 2d6/)
    expect(r.line).toMatch(/Trip: DC 16 DEX save/)
  })

  it('takes one effect, two with Improved Cunning Strike, within the dice', () => {
    const { s, cols } = rogue(14, ['Devious Strikes'])
    const p = plan(s, 14, 'rapier', cols)
    const opts = attackRiders(s, 14, p, { sneak: true })
    expect(limitRiders(s, 14, opts, [{ key: 'cun:poison' }, { key: 'cun:trip' }], 7)).toHaveLength(
      1,
    )
    s.features.push({ name: 'Improved Cunning Strike', desc: '', from: 'Test 11' })
    const two = limitRiders(
      s,
      14,
      attackRiders(s, 14, p, { sneak: true }),
      [{ key: 'cun:knock-out' }, { key: 'cun:obscure' }],
      7,
    )
    expect(two.map((k) => k.key)).toEqual(['cun:obscure'])
  })
})

describe('maneuvers and Arcane Shots', () => {
  it('spends a Superiority Die for Trip Attack: die to damage, STR save', () => {
    const s = hero(['Trip Attack'], {
      resources: [
        {
          name: 'Combat Superiority',
          from: 'Battle Master',
          max: 4,
          recharge: 'short',
          dice: '1d8',
        },
      ],
    })
    const p = plan(s, 3, 'longsword')
    const trip = attackRiders(s, 3, p).find((o) => o.def.key === 'man:trip')!
    expect(trip.save).toEqual({ ability: 'STR', dc: 8 + 4 + 4 })
    const r = rollAttack5e(s, p, {
      riders: riderPlan(s, 3, p, [{ key: 'man:trip' }]),
      target: { ac: 10 },
      rng: rolls(15),
    })
    expect(r.line).toMatch(/Trip Attack 1d8: 8/)
    expect(usesLeft(s, 'Combat Superiority')).toBe(3)
  })

  it('keeps the die when the attack misses, and Precision Attack can turn the miss', () => {
    const s = hero(['Trip Attack', 'Precision Attack'], {
      resources: [
        {
          name: 'Combat Superiority',
          from: 'Battle Master',
          max: 4,
          recharge: 'short',
          dice: '1d8',
        },
      ],
    })
    const p = plan(s, 3, 'longsword')
    rollAttack5e(s, p, {
      riders: riderPlan(s, 3, p, [{ key: 'man:trip' }]),
      target: { ac: 30 },
      rng: rolls(5),
    })
    expect(usesLeft(s, 'Combat Superiority')).toBe(4)
    const r = rollAttack5e(s, p, {
      riders: riderPlan(s, 3, p, [{ key: 'man:precision' }]),
      target: { ac: 17 },
      rng: rolls(5),
    })
    expect(r.line).toMatch(/Precision Attack \+8, 21, a hit/)
    expect(r.hit).toBe(true)
    expect(usesLeft(s, 'Combat Superiority')).toBe(3)
  })

  it('rolls an Arcane Shot’s dice and DC, once a turn, on an Ammunition weapon only', () => {
    const s = hero(['Banishing Shot', 'Piercing Shot'], {
      resources: [
        { name: 'Arcane Shot', from: 'Arcane Archer', max: 2, recharge: 'short', dice: '1d6' },
      ],
    })
    const bow = plan(s, 3, 'longbow')
    const opts = attackRiders(s, 3, bow)
    expect(opts.find((o) => o.def.key === 'shot:banishing')).toMatchObject({
      dice: '1d6',
      save: { ability: 'CHA', dc: 8 + 4 + 2 },
    })
    expect(attackRiders(s, 3, plan(s, 3, 'longsword')).every((o) => !o.fits)).toBe(true)
    const piercing = rollAttack5e(s, bow, {
      riders: riderPlan(s, 3, bow, [{ key: 'shot:piercing' }]),
      rng: rolls(15),
    })
    expect(piercing.line).toMatch(/Piercing Shot: DC 14 DEX save, \d+ damage on a failure/)
    expect(attackRiders(s, 3, bow).find((o) => o.def.key === 'shot:banishing')!.why).toBe(
      'Used this turn',
    )
  })
})

describe('strikes that add dice', () => {
  it('adds Divine Strike once a turn on a weapon hit, of the type picked', () => {
    const s = hero(['Blessed Strikes: Divine Strike'])
    const p = plan(s, 7, 'mace')
    const opts = attackRiders(s, 7, p)
    const picks = defaultRiders(opts)
    expect(picks).toEqual([{ key: 'divine-strike' }])
    const r = rollAttack5e(s, p, {
      riders: riderPlan(s, 7, p, [{ key: 'divine-strike', type: 'Necrotic' }]),
      target: { ac: 10 },
      rng: rolls(15),
    })
    expect(r.line).toMatch(/Divine Strike 1d8: 8 necrotic/)
    expect(attackRiders(s, 7, p)[0]!.why).toBe('Used this turn')
    expect(attackRiders(s, 14, p)[0]!.dice).toBe('2d8')
  })

  it('takes Stunning Strike’s Focus Point on a Monk weapon or Unarmed Strike', () => {
    const s = hero(['Stunning Strike', 'Martial Arts'], {
      resources: [{ name: 'Monk’s Focus', from: 'Monk', max: 5, recharge: 'short' }],
    })
    const fist = unarmedAttack(s, 5, { columns: { 'Martial Arts': '1d8' } })
    const r = rollAttack5e(s, fist, {
      riders: riderPlan(s, 5, fist, [{ key: 'stunning' }]),
      target: { ac: 10 },
      rng: rolls(15),
    })
    expect(r.line).toMatch(/Stunning Strike: DC 14 CON save/)
    expect(usesLeft(s, 'Monk’s Focus')).toBe(4)
  })

  it('rolls Frenzy as Rage Damage d6s while raging and reckless', () => {
    const s = hero(['Frenzy'])
    addEffect(s, 'rage')
    addEffect(s, 'reckless')
    const cols = { 'Rage Damage': '+2' }
    const p = plan(s, 3, 'greataxe', cols)
    const frenzy = attackRiders(s, 3, p, { columns: cols }).find((o) => o.def.key === 'frenzy')!
    expect(frenzy).toMatchObject({ why: '', dice: '2d6' })
  })

  it('spends a Psionic Energy Die for Psionic Strike, not doubled on a crit', () => {
    const s = hero(['Psionic Power'], {
      resources: [
        { name: 'Psionic Power', from: 'Psi Warrior', max: 4, recharge: 'long', dice: '1d6' },
      ],
    })
    const p = plan(s, 3, 'longsword')
    const r = rollAttack5e(s, p, {
      riders: riderPlan(s, 3, p, [{ key: 'psionic-strike' }]),
      target: { ac: 10 },
      rng: rolls(20),
    })
    expect(r.line).toMatch(/Psionic Strike 1d6: 6 \+2 force/)
    expect(usesLeft(s, 'Psionic Power')).toBe(3)
  })

  it('heals the Hollow Warden on a hit while transformed and Bloodied', () => {
    const s = hero(['Hungering Might'])
    s.hpMax = 40
    s.hp = 10
    addEffect(s, 'wrath-of-the-wild')
    const p = plan(s, 7, 'longsword')
    rollAttack5e(s, p, {
      riders: riderPlan(s, 7, p, defaultRiders(attackRiders(s, 7, p))),
      target: { ac: 10 },
      rng: rolls(15),
    })
    expect(s.hp).toBe(10 + 10 + 2)
  })

  it('puts Parrying Stance’s 1d6 on your AC', () => {
    const s = hero(['Sneak Attack', 'Cunning Strike', 'Dashing Strikes'])
    const p = plan(s, 13, 'rapier', { 'Sneak Attack': '7d6' })
    rollAttack5e(s, p, {
      sneak: true,
      riders: riderPlan(s, 13, p, [{ key: 'cun:parrying-stance' }], { sneak: true }),
      target: { ac: 10 },
      rng: rolls(15),
    })
    expect(hasEffect(s, 'parrying-stance')).toBe(true)
    expect(s.effects?.find((e) => e.key === 'parrying-stance')?.value).toBe(6)
  })
})

describe('after a miss', () => {
  it('spends Heroic Inspiration to reroll', () => {
    const s = hero([])
    s.heroicInspiration = true
    const p = plan(s, 1, 'longsword')
    const opts = attackRiders(s, 1, p)
    expect(opts.map((o) => o.def.key)).toContain('miss:heroic')
    const r = rollAttack5e(s, p, {
      riders: riderPlan(s, 1, p, [{ key: 'miss:heroic' }]),
      target: { ac: 15 },
      rng: rolls(2, (14.5 - 0.5) / 20),
    })
    expect(r.hit).toBe(true)
    expect(s.heroicInspiration).toBe(false)
  })

  it('adds an ally’s Bardic Inspiration die to a miss and spends it', () => {
    const s = hero([])
    addEffect(s, 'bardic-inspiration', { value: 8 })
    const p = plan(s, 1, 'longsword')
    const r = rollAttack5e(s, p, {
      riders: riderPlan(s, 1, p, [{ key: 'miss:bardic' }]),
      target: { ac: 18 },
      rng: rolls(8),
    })
    expect(r.line).toMatch(/Bardic Inspiration \+8/)
    expect(hasEffect(s, 'bardic-inspiration')).toBe(false)
  })

  it('makes a miss a 20 with Stroke of Luck', () => {
    const s = hero(['Stroke of Luck'], {
      resources: [{ name: 'Stroke of Luck', from: 'Rogue', max: 1, recharge: 'short' }],
    })
    const p = plan(s, 20, 'rapier')
    const r = rollAttack5e(s, p, {
      riders: riderPlan(s, 20, p, [{ key: 'miss:stroke' }]),
      target: { ac: 25 },
      rng: rolls(3),
    })
    expect(r.crit).toBe(true)
    expect(usesLeft(s, 'Stroke of Luck')).toBe(0)
  })

  it('gives Studied Attacks’ Advantage after a miss', () => {
    const s = hero(['Studied Attacks'])
    const p = plan(s, 13, 'longsword')
    rollAttack5e(s, p, { target: { ac: 30 }, rng: rolls(5) })
    expect(hasEffect(s, 'studied')).toBe(true)
    expect(plan(s, 13, 'longsword').test.adv).toContain('Studied Attacks')
  })
})

describe('built heroes', () => {
  it('finds a Battle Master’s maneuvers and dice', () => {
    const { sheet } = build('fighter')
    levelTo(sheet, 1, 3, 'battle-master')
    const w = sheet.weapons.find((x) => x.slug === 'greatsword')!
    const p = weaponAttack(sheet, 3, w, def('greatsword'), { key: 'w' })
    const keys = attackRiders(sheet, 3, p).map((o) => o.def.key)
    const known = sheet.options!.map((o) => o.name)
    for (const r of DND5E_RIDERS.filter((x) => x.group === 'maneuver'))
      expect(keys.includes(r.key)).toBe(known.includes(r.feature))
  })

  it('gives a Cleric 7 with Divine Strike its rider', () => {
    const { sheet } = build('cleric')
    levelTo(sheet, 1, 7)
    const mace = sheet.weapons[0]!
    const p = weaponAttack(
      sheet,
      7,
      mace,
      data.weapons.find((x) => x.slug === mace.slug),
      {
        key: 'w',
      },
    )
    expect(attackRiders(sheet, 7, p).map((o) => o.def.key)).toContain('divine-strike')
  })
})
