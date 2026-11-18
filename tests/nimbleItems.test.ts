import { describe, expect, it } from 'vitest'
import { WEAPONS } from '../data/nimble/core'
import type { NimbleSheet } from '../types/sheets'
import {
  SPELL_SCROLL,
  armorValue,
  bookItem,
  catalog,
  customItem,
  itemAttack,
  itemStat,
  itemSummary,
  rollRiders,
} from '../utils/nimbleItems'
import { itemSlots } from '../utils/nimblePlay'
import { defaultSheet } from '../utils/sheetDefaults'

function hero(): NimbleSheet {
  return { ...defaultSheet('nimble'), stats: { STR: 3, DEX: 2, INT: 0, WIL: 1 } }
}

describe('equipment catalog', () => {
  it('lists every weapon from the book tables, with its cost', () => {
    const weapons = catalog()
      .find((g) => g.label === 'Weapons')!
      .items.map((i) => i.name)
    expect(weapons).toHaveLength(23)
    expect(weapons).toEqual(expect.arrayContaining(['Greatsword', 'Handheld Ballista', 'Rapier']))
    expect(weapons).not.toContain('Unarmed Strike')
    expect(WEAPONS.find((w) => w.name === 'Crossbow')).toMatchObject({ dice: '4d4', stat: 'DEX' })
  })

  it('groups armor, shields, gear, magic items and wands', () => {
    const groups = Object.fromEntries(catalog().map((g) => [g.label, g.items.length]))
    expect(groups).toMatchObject({ Armor: 16, Shields: 4, Gear: 33, Wands: 9 })
    expect(
      catalog()
        .find((g) => g.label === 'Magic items')!
        .items.map((i) => i.name),
    ).toContain(SPELL_SCROLL)
  })

  it('adds book items with the right tag, and nothing for an unknown name', () => {
    expect(bookItem('Longbow')).toEqual({ name: 'Longbow', qty: '1', tag: 'Weapon' })
    expect(bookItem('Tower Shield')?.tag).toBe('Shield')
    expect(bookItem('Grim Coronet')?.tag).toBe('Magic')
    expect(bookItem('Rope (50 ft.)')).toEqual({ name: 'Rope (50 ft.)', qty: '1' })
    expect(bookItem('Laser Rifle')).toBeNull()
  })
})

describe('custom items', () => {
  it('builds a stated weapon and turns it into an attack with the stat bonus', () => {
    const sheet = hero()
    expect(customItem('Frostbite Axe', { kind: 'weapon', dice: 'd8' })).toBeNull()
    const axe = customItem('Frostbite Axe', {
      kind: 'weapon',
      dice: '1d10',
      stat: 'STR',
      melee: true,
      damageType: 'Cold',
      props: '2-handed',
      rarity: 'Rare',
      desc: 'On a crit, the target is Slowed.',
    })!
    const plusOne = customItem('Plus One Blade', { kind: 'weapon', dice: '1d8+1', stat: 'STR' })!
    expect(itemAttack(sheet, plusOne, 5)?.dmg).toBe(`1d8+${sheet.stats.STR + 1}`)
    expect(axe.tag).toBe('Weapon')
    expect(itemSlots(axe)).toBe(2)
    expect(itemAttack(sheet, axe, 5)).toEqual({
      name: 'Frostbite Axe',
      props: 'Cold, 2-handed, Rare magic',
      dmg: '1d10+3',
      melee: true,
    })
    expect(itemSummary(sheet, axe, 5)).toBe(
      'Melee attack, 1 action: 1d10+3 damage\nCold, 2-handed, Rare magic\nOn a crit, the target is Slowed.',
    )
  })

  it('adds picked effects to the attack and rolls their extra dice', () => {
    const sheet = hero()
    const axe = customItem('Frostbite Axe', {
      kind: 'weapon',
      dice: '1d10',
      damageType: 'Slashing',
      effects: [
        { kind: 'hit', dice: '1d4', type: 'Cold' },
        { kind: 'crit', dice: 'bad', type: 'Fire' },
        { kind: 'condition', condition: 'Slowed' },
      ],
    })!
    expect(axe.custom?.effects).toEqual([
      { kind: 'hit', dice: '1d4', type: 'Cold' },
      { kind: 'condition', condition: 'Slowed' },
    ])
    expect(itemAttack(sheet, axe, 5)).toMatchObject({
      props: 'Slashing, +1d4 cold damage on a hit, On a crit, the target is Slowed',
      onHit: ['1d4 cold'],
    })
    expect(rollRiders(['1d4 cold', '2d6+1 fire'], () => 0.99)).toEqual({
      total: 4 + 13,
      note: ' (+4 cold, +13 fire)',
    })
    const cloak = customItem('Ember Cloak', {
      kind: 'gear',
      effects: [
        { kind: 'resist', type: 'Fire' },
        { kind: 'hit', dice: '1d4', type: 'Cold' },
      ],
    })!
    expect(cloak.custom?.effects).toEqual([{ kind: 'resist', type: 'Fire' }])
  })

  it('describes custom armor, magic gear, wands and book items', () => {
    const sheet = hero()
    const coat = customItem('Shadow Coat', { kind: 'armor', armor: '5+DEX', rarity: 'Uncommon' })!
    expect(itemSummary(sheet, coat, 1)).toBe('Armor: 7 (5+DEX)\nUncommon magic item')
    expect(itemStat(sheet, coat, 1)).toBe('Armor 7')
    expect(itemSummary(sheet, bookItem('Wand of Fly')!, 1)).toMatch(
      /^Uncommon magic item\nFly \(tier 3\), 2 charges.*\nWands cast without mana/,
    )
    expect(itemSummary(sheet, bookItem('Chain Shirt')!, 1)).toBe(
      'Mail armor: 11 (9+DEX (max 2))\nRequires 2 STR\nCost: 60 gp',
    )
    expect(itemSummary(sheet, bookItem('Resolute Fangs, Golden Bastion')!, 1)).toMatch(
      /^Legendary magic item · \+8 Armor/,
    )
  })
})

describe('armorValue', () => {
  it('adds stats to the base and caps them where the book says', () => {
    const stats = { STR: 1, DEX: 4, INT: 2, WIL: 0 }
    expect(armorValue('3+DEX', stats)).toBe(7)
    expect(armorValue('6+DEX (max 2)', stats)).toBe(8)
    expect(armorValue('INT+DEX', stats)).toBe(6)
    expect(armorValue('18', stats)).toBe(18)
    expect(armorValue('lots', stats)).toBeNull()
  })
})
