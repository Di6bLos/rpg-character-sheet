// 5e (2024) rerolls and boosts on a D20 Test (utils/dnd5eRerolls.ts) and the feature uses
// with numbers (utils/dnd5eFeatures.ts useEntry).
import { describe, expect, it } from 'vitest'
import type { Dnd5eSheet } from '../types/sheets'
import { hasEffect } from '../utils/dnd5eEffects'
import { heroEntries, useEntry } from '../utils/dnd5eFeatures'
import { acNow, beginEncounter, rollD20, saveRow, skillRow, usesLeft } from '../utils/dnd5ePlay'
import {
  type Dnd5eLastRoll,
  preRollOptions,
  rerollOptions,
  usePreRoll,
  useReroll,
} from '../utils/dnd5eRerolls'
import { defaultSheet } from '../utils/sheetDefaults'
import { build, data, levelTo } from './helpers/dnd5e'

const d20 = (n: number) => () => (n - 0.5) / 20
const max = () => 0.999

function hero(features: string[], patch: Partial<Dnd5eSheet> = {}): Dnd5eSheet {
  return {
    ...defaultSheet('dnd5e'),
    classSlug: 'fighter',
    profBonus: 4,
    hp: 40,
    hpMax: 40,
    abilities: { STR: 18, DEX: 16, CON: 14, INT: 16, WIS: 14, CHA: 14 },
    features: features.map((name) => ({ name, desc: '', from: 'Test 9' })),
    ...patch,
  }
}

function last(s: Dnd5eSheet, test = saveRow(s, 9, 'WIS').test, roll = 5): Dnd5eLastRoll {
  return { key: 'skills:x', test, result: rollD20(test, { rng: d20(roll) }), mode: 'normal' }
}

describe('rerolls', () => {
  it('rerolls a save with Indomitable, adding the Fighter level, once a Long Rest', () => {
    const s = hero(['Indomitable'], {
      resources: [{ name: 'Indomitable', from: 'Fighter', max: 1, recharge: 'long' }],
    })
    const l = last(s)
    expect(rerollOptions(s, 9, l).map((o) => o.key)).toEqual(['indomitable'])
    const r = useReroll(s, 9, l, 'indomitable', { rng: d20(10) })!
    expect(r.result.total).toBe(10 + 2 + 9)
    expect(r.line).toMatch(/Indomitable: rerolled: 21 \(with \+9\)/)
    expect(rerollOptions(s, 9, last(s))[0]!.why).toBe('No Indomitable left')
  })

  it('spends Heroic Inspiration, or an ally’s Bardic Inspiration die, on any D20 Test', () => {
    const s = hero([], { heroicInspiration: true })
    s.effects = [
      { key: 'bardic-inspiration', name: 'Bardic Inspiration', ends: 'manual', value: 10 },
    ]
    const l = last(s, skillRow(s, 9, 'Athletics').test)
    expect(rerollOptions(s, 9, l).map((o) => o.key)).toEqual(['heroic', 'bardic'])
    const r = useReroll(s, 9, l, 'bardic', { rng: max })!
    expect(r.line).toMatch(/\+10/)
    expect(hasEffect(s, 'bardic-inspiration')).toBe(false)
    expect(rerollOptions(s, 9, l).find((o) => o.key === 'bardic')).toBeUndefined()
    useReroll(s, 9, l, 'heroic', { rng: d20(18) })
    expect(s.heroicInspiration).toBe(false)
  })

  it('adds Tactical Mind’s 1d10 to a check, Flash of Genius’s INT to a save', () => {
    const s = hero(['Tactical Mind', 'Flash of Genius'], {
      resources: [
        { name: 'Second Wind', from: 'Fighter', max: 2, recharge: 'long' },
        { name: 'Flash of Genius', from: 'Artificer', max: 3, recharge: 'long' },
      ],
    })
    const check = last(s, skillRow(s, 9, 'History').test)
    const was = check.result.total
    expect(useReroll(s, 9, check, 'tactical-mind', { rng: max })!.result.total).toBe(was + 10)
    expect(usesLeft(s, 'Second Wind')).toBe(1)
    const save = last(s)
    const before = save.result.total
    expect(useReroll(s, 9, save, 'flash-of-genius')!.result.total).toBe(before + 3)
    expect(usesLeft(s, 'Flash of Genius')).toBe(2)
  })

  it('swaps in a foretold d20 with Portent, once a turn', () => {
    const s = hero(['Portent'], { portent: [17, 3] })
    beginEncounter(s)
    s.turn!.active = true
    const l = last(s)
    const r = useReroll(s, 3, l, 'portent', { portent: 0 })!
    expect(r.result.d20).toBe(17)
    expect(s.portent).toEqual([3])
    expect(rerollOptions(s, 3, last(s))[0]!.why).toBe('Used this turn')
  })

  it('adds a Superiority Die to Initiative with Ambush, only to the right checks with Commanding Presence', () => {
    const s = hero(['Ambush', 'Commanding Presence'], {
      resources: [
        { name: 'Combat Superiority', from: 'BM', max: 4, recharge: 'short', dice: '1d8' },
      ],
    })
    const persuade = last(s, skillRow(s, 3, 'Persuasion').test)
    expect(rerollOptions(s, 3, persuade).map((o) => o.key)).toEqual(['commanding-presence'])
    const history = last(s, skillRow(s, 3, 'History').test)
    expect(rerollOptions(s, 3, history)).toEqual([])
  })

  it('buys Advantage before a roll with a Luck Point', () => {
    const s = hero([], {
      featsTaken: [{ slug: 'lucky', name: 'Lucky', level: 1 }],
      resources: [{ name: 'Lucky: Luck Points', from: 'Lucky', max: 2, recharge: 'long' }],
    })
    expect(usePreRoll(s, 1, 'luck')).toMatch(/Advantage/)
    expect(skillRow(s, 1, 'Stealth').test.adv).toContain('Luck Point')
    expect(preRollOptions(s, 1)[0]!.why).toBe('On')
  })
})

describe('feature uses with numbers', () => {
  it('turns on Sacred Weapon with CHA to attack rolls, spending Channel Divinity', () => {
    const { sheet } = build('paladin')
    levelTo(sheet, 1, 3, 'oath-of-devotion')
    const sw = heroEntries(sheet, 3, data as never).find((e) => e.name === 'Sacred Weapon')!
    expect(sw).toMatchObject({ resource: 'Channel Divinity', cost: 'free' })
    expect(useEntry(sheet, 3, sw)).toMatch(/Sacred Weapon is on/)
    expect(sheet.effects?.find((e) => e.key === 'sacred-weapon')?.value).toBeGreaterThan(0)
  })

  it('gives Wild Shape its temporary HP, three times it for a Moon druid', () => {
    const { sheet } = build('druid')
    levelTo(sheet, 1, 3, 'circle-of-the-moon')
    const ws = heroEntries(sheet, 3, data as never).find((e) => e.name === 'Wild Shape')!
    useEntry(sheet, 3, ws)
    expect(sheet.tempHp).toBe(9)
  })

  it('puts Bladesong’s INT on AC and Evasive Footwork’s roll on AC', () => {
    const s = hero(['Bladesong', 'Evasive Footwork'], {
      ac: 13,
      resources: [
        { name: 'Bladesong', from: 'Bladesinger', max: 3, recharge: 'long' },
        { name: 'Combat Superiority', from: 'BM', max: 4, recharge: 'short', dice: '1d8' },
      ],
    })
    const e = heroEntries(s, 3, data as never)
    useEntry(s, 3, e.find((x) => x.name === 'Bladesong')!)
    expect(acNow(s, 3).value).toBe(16)
  })

  it('rolls Holy Bolt as a spell attack against the target, spending Channel Divinity', () => {
    const { sheet } = build('cleric')
    levelTo(sheet, 1, 3, 'discipline-domain')
    const bolt = heroEntries(sheet, 3, data as never).find((e) => e.name === 'Holy Bolt')!
    expect(bolt).toMatchObject({ attack: true, resource: 'Channel Divinity' })
    const line = useEntry(sheet, 3, bolt, { target: { ac: 5 }, rng: max })
    expect(line).toMatch(/to hit vs AC 5.*a Critical Hit.*radiant/)
    expect(usesLeft(sheet, 'Channel Divinity')).toBe(1)
  })

  it('rolls Lava Burst as Rage Damage d4s', () => {
    const { sheet } = build('barbarian')
    levelTo(sheet, 1, 3, 'path-of-the-elements')
    const cols = { 'Rage Damage': '+2' }
    const lava = heroEntries(sheet, 3, data as never, cols).find(
      (e) => e.name === 'Raging Elements: Lava Burst',
    )!
    expect(lava.dice).toBe('2d4')
  })
})
