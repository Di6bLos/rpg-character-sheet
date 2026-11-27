// 5e (2024) defences: damage reactions, AC reactions, save-for-half with Evasion, the features
// that keep a hero up at 0 HP, the Arcane Ward, standing modifiers, and the turn, rest and
// Initiative hooks (utils/dnd5eDefense.ts, utils/dnd5eModifiers.ts, utils/dnd5ePlay.ts).
import { describe, expect, it } from 'vitest'
import type { Dnd5eSheet } from '../types/sheets'
import {
  acReactions,
  damageGuards,
  evasionOf,
  guardHit,
  saveDamage,
  useAcReaction,
} from '../utils/dnd5eDefense'
import { addEffect } from '../utils/dnd5eEffects'
import {
  acNow,
  beginEncounter,
  damageAfter,
  deathSave,
  defensesNow,
  initiativeTest,
  longRest,
  onInitiative,
  saveRow,
  shortRest,
  skillRow,
  speedNow,
  startTurn,
  takeDamage,
  usesLeft,
} from '../utils/dnd5ePlay'
import { defaultSheet } from '../utils/sheetDefaults'

const max = () => 0.999
const d20 = (n: number) => (n - 0.5) / 20

function hero(features: string[], patch: Partial<Dnd5eSheet> = {}): Dnd5eSheet {
  return {
    ...defaultSheet('dnd5e'),
    classSlug: 'fighter',
    profBonus: 4,
    hp: 40,
    hpMax: 40,
    ac: 15,
    abilities: { STR: 18, DEX: 16, CON: 14, INT: 14, WIS: 14, CHA: 14 },
    features: features.map((name) => ({ name, desc: '', from: 'Test 9' })),
    ...patch,
  }
}

describe('damage reactions', () => {
  it('halves with Uncanny Dodge and pays the Reaction', () => {
    const s = hero(['Uncanny Dodge'])
    beginEncounter(s)
    const hit = { amount: 20, type: 'Slashing', level: 5 }
    expect(guardHit(s, 5, hit, ['uncanny-dodge'])).toEqual(['Uncanny Dodge'])
    expect(takeDamage(s, hit).taken).toBe(10)
    expect(s.turn?.reaction).toBe(false)
    expect(damageGuards(s, 5)[0]!.why).toBe('Reaction used')
  })

  it('cuts B, P and S with Deflect Attacks, any type with Deflect Energy', () => {
    const s = hero(['Deflect Attacks'])
    expect(damageGuards(s, 5, 'Fire')[0]!.why).toBe('Not against Fire')
    s.features.push({ name: 'Deflect Energy', desc: '', from: 'Monk 13' })
    expect(damageGuards(s, 13, 'Fire')[0]!.why).toBe('')
    const hit = { amount: 30, type: 'Fire' }
    guardHit(s, 13, hit, ['deflect-attacks'], max)
    expect(hit.reduce?.[0]?.amount).toBe(10 + 3 + 13)
  })

  it('spends a Superiority Die on Parry: die + STR or DEX', () => {
    const s = hero(['Parry'], {
      resources: [
        { name: 'Combat Superiority', from: 'BM', max: 4, recharge: 'short', dice: '1d8' },
      ],
    })
    const hit = { amount: 15 }
    guardHit(s, 3, hit, ['parry'], max)
    expect(hit.reduce?.[0]?.amount).toBe(8 + 4)
    expect(usesLeft(s, 'Combat Superiority')).toBe(3)
  })

  it('spends a slot on Song of Defense only during Bladesong', () => {
    const s = hero(['Song of Defense'], {
      castingStats: {
        ability: 'INT',
        kind: 'full',
        list: 'wizard',
        saveDc: 14,
        attack: 6,
        slots: [4, 3, 2, 0, 0, 0, 0, 0, 0],
        cantrips: 3,
        prepared: 8,
      },
    })
    expect(damageGuards(s, 10)[0]!.why).toBe('Not active')
    addEffect(s, 'bladesong', { value: 2 })
    const hit = { amount: 12 }
    guardHit(s, 10, hit, ['song-of-defense'])
    expect(hit.reduce?.[0]?.amount).toBe(15)
    expect(s.slotsUsed?.[2]).toBe(1)
  })

  it('resists with Warding Maneuver after the AC die', () => {
    const s = hero(['Warding Maneuver'], {
      resources: [
        { name: 'Combat Superiority', from: 'BM', max: 4, recharge: 'short', dice: '1d8' },
      ],
    })
    const hit = { amount: 21, type: 'Piercing' }
    guardHit(s, 3, hit, ['warding-maneuver'])
    expect(damageAfter(s, hit).taken).toBe(10)
  })

  it('raises AC against one attack: Defensive Duelist, Combat Inspiration, a Luck Point', () => {
    const s = hero([], {
      featsTaken: [
        { slug: 'defensive-duelist', name: 'Defensive Duelist', level: 4 },
        { slug: 'lucky', name: 'Lucky', level: 1 },
      ],
      resources: [{ name: 'Lucky: Luck Points', from: 'Lucky', max: 2, recharge: 'long' }],
    })
    addEffect(s, 'bardic-inspiration', { value: 8 })
    s.effects![0]!.valor = true
    const keys = acReactions(s, 5).map((r) => r.key)
    expect(keys).toEqual(['defensive-duelist', 'combat-inspiration', 'lucky'])
    expect(useAcReaction(s, 5, 'combat-inspiration', max)).toMatch(/\+8 AC/)
    expect(s.effects).toEqual([])
    expect(useAcReaction(s, 5, 'lucky')).toMatch(/Disadvantage/)
    expect(usesLeft(s, 'Lucky: Luck Points')).toBe(1)
  })
})

describe('save damage and Evasion', () => {
  it('halves on a success, full on a failure', () => {
    const s = hero([])
    expect(saveDamage(s, 5, { amount: 21, ability: 'DEX', half: true, saved: true }).taken).toBe(10)
    expect(saveDamage(s, 5, { amount: 21, ability: 'DEX', half: true, saved: false }).taken).toBe(
      21,
    )
  })

  it('takes none on a success and half on a failure with Evasion (DEX only)', () => {
    const s = hero(['Evasion'])
    expect(saveDamage(s, 7, { amount: 21, ability: 'DEX', half: true, saved: true })).toMatchObject(
      {
        taken: 0,
        line: expect.stringMatching(/Evasion: none on a success/),
      },
    )
    expect(saveDamage(s, 7, { amount: 21, ability: 'DEX', half: true, saved: false }).taken).toBe(
      10,
    )
    expect(saveDamage(s, 7, { amount: 21, ability: 'CON', half: true, saved: false }).taken).toBe(
      21,
    )
    s.conditions = ['Incapacitated']
    expect(evasionOf(s, 7, 'DEX')).toBe('')
  })

  it('rolls the save against a DC when given one', () => {
    const s = hero([])
    const r = saveDamage(s, 5, {
      amount: 30,
      ability: 'DEX',
      half: true,
      dc: 15,
      rng: () => d20(20),
    })
    expect(r.taken).toBe(15)
    expect(r.line).toMatch(/vs DC 15: success/)
  })
})

describe('staying up at 0 HP', () => {
  it('rolls Relentless Rage’s CON save while raging, the DC rising each use', () => {
    const s = hero(['Relentless Rage'])
    addEffect(s, 'rage')
    const r = takeDamage(s, { amount: 45, level: 11, rng: () => d20(15) })
    expect(r.line).toMatch(/Relentless Rage: DC 10 CON save 17, your HP becomes 22/)
    s.hp = 5
    expect(takeDamage(s, { amount: 10, level: 11, rng: () => d20(5) }).line).toMatch(
      /DC 15 CON save 7, failed/,
    )
    expect(s.hp).toBe(0)
    expect(s.conditions).toContain('Unconscious')
  })

  it('keeps an Ancients paladin at 1 + 3 × level with Undying Sentinel', () => {
    const s = hero(['Undying Sentinel'], {
      resources: [{ name: 'Undying Sentinel', from: 'Ancients', max: 1, recharge: 'long' }],
    })
    takeDamage(s, { amount: 50, level: 15 })
    expect(s.hp).toBe(40)
    expect(usesLeft(s, 'Undying Sentinel')).toBe(0)
  })

  it('takes damage on the Arcane Ward first', () => {
    const s = hero([], { arcaneWard: 8 })
    const r = takeDamage(s, { amount: 12 })
    expect(s.hp).toBe(36)
    expect(s.arcaneWard).toBe(0)
    expect(r.line).toMatch(/Arcane Ward took 8/)
  })
})

describe('standing modifiers', () => {
  it('resists Cold, Fire and Lightning while raging with Primordial Bond', () => {
    const s = hero(['Primordial Bond'])
    expect(defensesNow(s, 10).resist).not.toContain('Fire')
    addEffect(s, 'rage')
    expect(defensesNow(s, 10).resist).toEqual(
      expect.arrayContaining(['Cold', 'Fire', 'Lightning', 'Slashing']),
    )
  })

  it('resists all but Force with Superior Defense', () => {
    const s = hero([])
    addEffect(s, 'superior-defense')
    expect(defensesNow(s).resist).not.toContain('Force')
    expect(defensesNow(s).resist).toContain('Radiant')
  })

  it('adds WIS to Arcana for a Thaumaturge, and to Initiative with Dread Ambusher', () => {
    const s = hero(['Divine Order: Thaumaturge', 'Dread Ambusher'], { initMod: 3 })
    expect(skillRow(s, 3, 'Arcana').test.bonus).toBe(2 + 2)
    expect(initiativeTest(s, 3).bonus).toBe(3 + 2)
  })

  it('floors a Moon druid’s AC at 13 + WIS in Wild Shape, and adds Parrying Stance', () => {
    const s = hero(['Circle Forms'], { ac: 11 })
    addEffect(s, 'wild-shape')
    expect(acNow(s, 3).value).toBe(15)
    addEffect(s, 'parrying-stance', { value: 4 })
    expect(acNow(s, 3).value).toBe(15)
    s.ac = 14
    expect(acNow(s, 3).value).toBe(18)
  })

  it('counts a Survivor’s 18 as a 20 on a death save, with Advantage', () => {
    const s = hero(['Survivor'], { hp: 0 })
    s.conditions = ['Unconscious']
    expect(deathSave(s, 18, { rng: () => d20(18) })).toMatch(/regain 1 HP/)
  })

  it('uses the Strength score with Indomitable Might', () => {
    const s = hero(['Indomitable Might'])
    const t = saveRow(s, 18, 'STR').test
    expect(t.floor).toEqual({ value: 18, label: 'Indomitable Might' })
  })

  it('drops Fast Movement in Heavy armor', () => {
    const s = hero(['Fast Movement'], { speed: '40 ft' })
    s.inventory = [{ name: 'Plate Armor', qty: '1', tag: 'Armor', worn: true }]
    expect(speedNow(s, 5).value).toBe(30)
  })
})

describe('turn, rest and Initiative hooks', () => {
  it('gives a Champion Heroic Inspiration at the start of a turn in combat', () => {
    const s = hero(['Heroic Warrior'])
    beginEncounter(s)
    expect(startTurn(s, 10)).toMatch(/Heroic Warrior/)
    expect(s.heroicInspiration).toBe(true)
  })

  it('heals a Bloodied Survivor 5 + CON at the start of each turn', () => {
    const s = hero(['Survivor'], { hp: 10 })
    beginEncounter(s)
    startTurn(s, 18)
    expect(s.hp).toBe(17)
  })

  it('gives Bardic Inspiration back on a Short Rest with Font of Inspiration', () => {
    const s = hero(['Font of Inspiration'], {
      resources: [{ name: 'Bardic Inspiration', from: 'Bard', max: 3, recharge: 'long' }],
      used: { 'Bardic Inspiration': 3 },
    })
    expect(shortRest(s, 5)).toMatch(/Font of Inspiration/)
    expect(usesLeft(s, 'Bardic Inspiration')).toBe(3)
  })

  it('foretells two d20s after a Long Rest with Portent', () => {
    const s = hero(['Portent'])
    longRest(s, 3)
    expect(s.portent).toHaveLength(2)
  })

  it('tops up Rage, Bardic Inspiration and Focus on Initiative', () => {
    const s = hero(['Persistent Rage', 'Superior Inspiration', 'Perfect Focus'], {
      resources: [
        { name: 'Rage', from: 'Barbarian', max: 5, recharge: 'long' },
        { name: 'Persistent Rage', from: 'Barbarian', max: 1, recharge: 'long' },
        { name: 'Bardic Inspiration', from: 'Bard', max: 5, recharge: 'long' },
        { name: 'Monk’s Focus', from: 'Monk', max: 15, recharge: 'short' },
      ],
      used: { Rage: 4, 'Bardic Inspiration': 5, 'Monk’s Focus': 14 },
    })
    expect(onInitiative(s, 18)).toHaveLength(3)
    expect(usesLeft(s, 'Rage')).toBe(5)
    expect(usesLeft(s, 'Bardic Inspiration')).toBe(2)
    expect(usesLeft(s, 'Monk’s Focus')).toBe(4)
  })
})
