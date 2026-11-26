import { describe, expect, it } from 'vitest'
import { NIMBLE_CLASSES } from '../data/nimble/classes'
import { WEAPONS } from '../data/nimble/core'
import type { InventoryItem, NimbleSheet } from '../types/sheets'
import { ancestryBySlug } from '../data/nimble/ancestries'
import { build, levelTo } from '../utils/nimbleAutoBuild'
import { restoreLevel } from '../utils/levelHistory'
import {
  SPELL_SCROLL,
  armorPiece,
  armorValue,
  bookItem,
  catalog,
  customItem,
  itemAttack,
  itemStat,
  itemSummary,
  rollRiders,
  wearItem,
  wornArmor,
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

describe('equipping armor', () => {
  it('starts every class wearing its starting armor, which gives the Armor the builder sets', () => {
    for (const cls of NIMBLE_CLASSES) {
      const sheet = build(cls)
      expect({ cls: cls.slug, ac: wornArmor(sheet, 1).value }).toEqual({
        cls: cls.slug,
        ac: sheet.ac,
      })
    }
  })

  it('wears one armor and one shield, and works the Armor out from them', () => {
    const sheet: NimbleSheet = {
      ...hero(),
      classSlug: 'commander',
      // Everything taken off: `worn: false` records it (a sheet from before Equip has no flag).
      inventory: [
        { name: 'Rusty Mail', qty: '1', worn: false },
        { name: 'Chain Shirt', qty: '1', worn: false },
        { name: 'Iron Shield', qty: '1', worn: false },
        { name: 'Rope', qty: '1' },
      ],
    }
    const [mail, chain, shield, rope] = sheet.inventory as [
      InventoryItem,
      InventoryItem,
      InventoryItem,
      InventoryItem,
    ]
    expect(armorPiece(sheet, rope)).toBeNull()
    expect(wearItem(sheet, mail, 1)).toBe('Wearing Rusty Mail: Armor 8 (Rusty Mail 8).')
    expect(wearItem(sheet, sheet.inventory[2]!, 1)).toBe(
      'Wearing Iron Shield: Armor 12 (Rusty Mail 8, Iron Shield +4).',
    )
    wearItem(sheet, sheet.inventory[1]!, 1)
    expect(sheet.inventory.map((i) => !!i.worn)).toEqual([false, true, true, false])
    expect(sheet.ac).toBe(11 + 4)
    expect(wearItem(sheet, sheet.inventory[1]!, 1)).toBe(
      'Took off Chain Shirt: Armor 6 (unarmored 2, Iron Shield +4).',
    )
    expect([chain.name, shield.name]).toEqual(['Chain Shirt', 'Iron Shield'])
  })

  it('notes an unmet STR requirement and armor the class is not trained in', () => {
    const sheet: NimbleSheet = {
      ...hero(),
      classSlug: 'mage',
      stats: { STR: 1, DEX: 2, INT: 3, WIL: 0 },
      inventory: [{ name: 'Half Plate', qty: '1', worn: true }],
    }
    expect(wornArmor(sheet, 1)).toEqual({
      value: 14,
      parts: ['Half Plate 14'],
      notes: ['Half Plate needs 3 STR.', 'Not trained in Half Plate: Defend costs 1 more action.'],
    })
  })

  it('uses DEX+STR unarmored for a Zephyr, doubled by Iron Defense', () => {
    const sheet: NimbleSheet = { ...hero(), classSlug: 'zephyr', inventory: [] }
    expect(wornArmor(sheet, 1).value).toBe(5)
    expect(wornArmor(sheet, 13).value).toBe(10)
  })
})

describe('equipped Armor stays in step (PR #56 review)', () => {
  const cls = (slug: string) => NIMBLE_CLASSES.find((c) => c.slug === slug)!

  it('works Armor out from worn gear again after level-ups', () => {
    const s = build(cls('hunter'))
    s.inventory.push({ name: 'Rusty Plate', qty: '1', worn: false })
    wearItem(s, s.inventory.at(-1)!, 1)
    levelTo(s, 13, 'shadowpath')
    expect(s.ac).toBe(wornArmor(s, 13).value)
    expect(s.ac).toBe(10)
  })

  it('doubles a Zephyr’s whole unarmored Armor at Iron Defense, built or levelled the same way', () => {
    const s = build(cls('zephyr'), ancestryBySlug('turtlefolk')!)
    levelTo(s, 13, 'pain')
    expect(s.ac).toBe(wornArmor(s, 13).value)
  })

  it('keeps Armor on worn gear when a level is undone', () => {
    const s = build(cls('mage'))
    levelTo(s, 5, 'control')
    s.inventory.push({ name: 'Half Plate', qty: '1', worn: false })
    wearItem(s, s.inventory.at(-1)!, 5)
    restoreLevel(s, 4)
    expect(s.ac).toBe(wornArmor(s, 4).value)
  })

  it('does not ask for STR when the armor has no requirement', () => {
    const s = build(cls('mage'))
    expect(s.stats.STR).toBeLessThan(0)
    expect(wornArmor(s, 1).notes).toEqual([])
  })

  it('keeps the starting armor on when a sheet from before Equip puts on its shield first', () => {
    const s = build(cls('oathsworn'))
    const before = s.ac
    s.inventory = s.inventory.map(({ worn: _worn, ...i }) => i)
    const shield = s.inventory.find((i) => armorPiece(s, i)?.shield)!
    expect(wearItem(s, shield, 1)).toMatch(/^Wearing/)
    expect(s.ac).toBe(before)
    expect(s.inventory.filter((i) => i.worn).length).toBe(2)
  })

  it('gives custom armor no training note and flags a formula it can’t read', () => {
    const s = build(cls('mage'))
    s.inventory.push({
      name: 'Odd Coat',
      qty: '1',
      worn: false,
      custom: { kind: 'armor', armor: '5 + DEX/2' } as InventoryItem['custom'],
    })
    wearItem(s, s.inventory.at(-1)!, 1)
    const notes = wornArmor(s, 1).notes
    expect(notes.some((n) => n.startsWith('Not trained'))).toBe(false)
    expect(notes.some((n) => n.startsWith("Can't read Odd Coat"))).toBe(true)
  })
})
