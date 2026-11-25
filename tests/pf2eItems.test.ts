import { describe, expect, it } from 'vitest'
import type { Pf2eSheet } from '../types/sheets'
import { endPf2eEncounter, startPf2eTurn, timePasses } from '../utils/pf2eActions'
import { runeDamageNotes, traitsInHands, versatileType } from '../utils/pf2eDamage'
import { activeEffects, durationRounds, speedNow } from '../utils/pf2eEffects'
import {
  INVEST_LIMIT,
  bulkState,
  etchRune,
  itemFromDef,
  itemsDailyPrep,
  prepareStaff,
  runeCost,
  runeFamily,
  runeProblem,
  runedName,
  setInvested,
  spendStaff,
  strikeRunes,
  syncEncumbered,
  totalBulk,
  useWand,
} from '../utils/pf2eInventory'
import { castFromItem, pay, useConsumable } from '../utils/pf2eItemUse'
import { adjusted, degreeOf } from '../utils/pf2ePlay'
import { dailyPreparations, slotsFor } from '../utils/pf2eSpells'
import { defaultSheet } from '../utils/sheetDefaults'
import { loadSet, named } from './helpers/pf2e'

const consumables = loadSet('consumables')
const runes = loadSet('runes')
const gear = loadSet('gear')
const magic = loadSet('magicItems')
const staves = loadSet('staves')
const wands = loadSet('wands')
const weapons = loadSet('weapons')
const armor = loadSet('armor')
const spells = loadSet('spells')

/** A die that always lands on its top face, or its lowest. */
const high = () => 0.999
const low = () => 0

function hero(over: Partial<Pf2eSheet> = {}): Pf2eSheet {
  return {
    ...defaultSheet('pf2e'),
    hp: 10,
    hpMax: 20,
    inventory: [],
    coins: { gp: 0, sp: 0, cp: 0 },
    conditions: [],
    classSlug: 'fighter',
    ...over,
  }
}
const item = (set: { name: string }[], name: string) => named(set as never[], name)

describe('pf2e Bulk (Player Core p. 269)', () => {
  it('counts ten light items as 1 Bulk, dropping fractions, and negligible ones as nothing', () => {
    const s = hero()
    s.inventory.push(itemFromDef({ set: 'item', def: item(gear, 'Rope') }, 9))
    expect(totalBulk(s).bulk).toBe(0)
    s.inventory.push(itemFromDef({ set: 'item', def: item(gear, 'Rope') }, 2))
    expect(totalBulk(s).bulk).toBe(1)
    s.inventory.push(itemFromDef({ set: 'item', def: item(consumables, 'Potency Crystal') }, 50))
    expect(totalBulk(s).bulk).toBe(1)
  })

  it('makes carried armor 1 Bulk more than worn (p. 271) and counts 1,000 coins as 1 Bulk', () => {
    const s = hero()
    const mail = itemFromDef({ set: 'armor', def: item(armor, 'Chain Mail') })
    s.inventory.push(mail)
    expect(totalBulk(s).bulk).toBe(2)
    mail.pf2e!.carry = 'stowed'
    expect(totalBulk(s).bulk).toBe(3)
    s.coins = { gp: 999, sp: 0, cp: 0 }
    expect(totalBulk(s).bulk).toBe(3)
    s.coins = { gp: 1999, sp: 0, cp: 0 }
    expect(totalBulk(s).bulk).toBe(4)
  })

  it('is encumbered over 5 + STR and overloaded over 10 + STR, and gives the condition', () => {
    const s = hero({ attrs: { STR: 1, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 } })
    const greatsword = item(weapons, 'Greatsword')
    for (let i = 0; i < 3; i++) s.inventory.push(itemFromDef({ set: 'weapons', def: greatsword }))
    expect(bulkState(s)).toMatchObject({ bulk: 6, limit: 6, max: 11, encumbered: false })
    expect(syncEncumbered(s)).toBeUndefined()
    s.inventory.push(itemFromDef({ set: 'weapons', def: greatsword }))
    expect(bulkState(s).encumbered).toBe(true)
    expect(syncEncumbered(s)).toMatch(/encumbered/)
    expect(s.conditions).toContain('Encumbered')
    // Encumbered is clumsy 1 on AC (p. 443).
    expect(adjusted(s, 18, { kind: 'ac' }).value).toBe(17)
    for (let i = 0; i < 2; i++) s.inventory.push(itemFromDef({ set: 'weapons', def: greatsword }))
    expect(bulkState(s).overloaded).toBe(true)
    s.inventory.splice(0, 4)
    expect(syncEncumbered(s)).toMatch(/no longer/)
    expect(s.conditions).not.toContain('Encumbered')
  })

  // Player Core p. 287: a worn backpack is negligible and its first 2 Bulk don't count.
  it('takes the first 2 Bulk of stowed items off while a backpack is worn', () => {
    const s = hero()
    const pack = itemFromDef({ set: 'item', def: item(gear, 'Backpack') })
    expect(pack.pf2e?.carry).toBe('worn')
    const sword = itemFromDef({ set: 'weapons', def: item(weapons, 'Greatsword') }, 2)
    sword.pf2e!.carry = 'stowed'
    s.inventory.push(sword, itemFromDef({ set: 'item', def: item(gear, 'Rope') }, 5))
    expect(totalBulk(s).bulk).toBe(4)
    s.inventory.push(pack)
    expect(totalBulk(s)).toMatchObject({ bulk: 2, backpack: 2 })
    // Held items don't go in the pack; carried, the pack itself is light.
    sword.pf2e!.carry = 'held'
    expect(totalBulk(s)).toMatchObject({ bulk: 4, backpack: 0.5 })
    pack.pf2e!.carry = 'stowed'
    expect(totalBulk(s).bulk).toBe(4)
    expect(totalBulk(s).light).toBe(6)
  })

  it("leaves an encumbered the player set when the Bulk wasn't what gave it", () => {
    const s = hero({ conditions: ['Encumbered'] })
    expect(syncEncumbered(s)).toBeUndefined()
    expect(s.conditions).toContain('Encumbered')
  })
})

describe('pf2e investing (GM Core p. 219)', () => {
  it('invests worn items with the invested trait, at most 10 a day', () => {
    const s = hero()
    const boots = item(magic, 'Boots of Bounding')
    for (let i = 0; i < INVEST_LIMIT + 1; i++)
      s.inventory.push(itemFromDef({ set: 'item', def: boots }))
    for (let i = 0; i < INVEST_LIMIT; i++) expect(setInvested(s, i, true)).toMatch(/^Invested/)
    expect(setInvested(s, INVEST_LIMIT, true)).toMatch(/already invested 10 items today/)
    expect(s.inventory[INVEST_LIMIT]!.pf2e!.invested).toBeFalsy()
    // Taking one off doesn't give the investment back until daily preparations.
    expect(setInvested(s, 0, false)).toMatch(/no longer invested; it still counts today/)
    expect(setInvested(s, INVEST_LIMIT, true)).toMatch(/already invested 10/)
    expect(setInvested(s, 0, true)).toMatch(/^Invested/)
    setInvested(s, 0, false)
    itemsDailyPrep(s)
    expect(setInvested(s, INVEST_LIMIT, true)).toMatch(/^Invested .*\(10\/10\)/)
  })

  it('applies an invested item’s bonuses only while invested (boots of bounding, p. 286)', () => {
    const s = hero({ speed: '25 ft' })
    s.inventory.push(itemFromDef({ set: 'item', def: item(magic, 'Boots of Bounding') }))
    expect(speedNow(s).text).toBe('25 ft')
    setInvested(s, 0, true)
    expect(speedNow(s).text).toBe('30 ft')
    s.inventory[0]!.pf2e!.carry = 'stowed'
    expect(setInvested(s, 0, false)).toMatch(/no longer/)
    expect(setInvested(s, 0, true)).toMatch(/^Wear/)
  })
})

describe('pf2e runes (GM Core pp. 224–237)', () => {
  const longsword = () => itemFromDef({ set: 'weapons', def: item(weapons, 'Longsword') })

  it('adds weapon potency to the Strike’s attack and striking’s dice', () => {
    const s = hero()
    const sword = longsword()
    s.inventory.push(sword)
    expect(etchRune(sword, item(runes, 'Weapon Potency (+1)'))).toMatch(/\+1 longsword/i)
    expect(etchRune(sword, item(runes, 'Striking'))).toMatch(/\+1 striking Longsword/)
    const atk = adjusted(s, 7, { kind: 'attack', attr: 'STR', weapon: 'Longsword' })
    expect(atk).toMatchObject({ value: 8, changed: true, note: '+1 weapon potency' })
    expect(adjusted(s, 7, { kind: 'attack', attr: 'STR', weapon: 'Dagger' }).value).toBe(7)
    expect(strikeRunes(s, 'Longsword')).toMatchObject({ potency: 1, striking: 1 })
  })

  it('holds as many property runes as its potency, the stronger rune replacing the lesser', () => {
    const sword = longsword()
    expect(runeProblem(sword.pf2e!, item(runes, 'Flaming'))).toMatch(/potency rune first/)
    etchRune(sword, item(runes, 'Weapon Potency (+1)'))
    expect(etchRune(sword, item(runes, 'Flaming'))).toMatch(/Etched/)
    expect(runeProblem(sword.pf2e!, item(runes, 'Frost'))).toMatch(/holds 1 property rune/)
    expect(runeProblem(sword.pf2e!, item(runes, 'Weapon Potency (+1)'))).toMatch(/already/)
    etchRune(sword, item(runes, 'Flaming (Greater)'))
    expect(sword.pf2e!.runes!.property.map((p) => p.name)).toEqual(['Flaming (Greater)'])
    expect(runedName(sword)).toBe('+1 flaming Longsword')
    expect(runeProblem(sword.pf2e!, item(runes, 'Resilient'))).toMatch(/Armor runes/)
  })

  it('gives the flaming rune’s 1d6 fire on a hit to the Strike', () => {
    const s = hero()
    const sword = longsword()
    s.inventory.push(sword)
    etchRune(sword, item(runes, 'Weapon Potency (+1)'))
    etchRune(sword, item(runes, 'Flaming'))
    expect(strikeRunes(s, 'Longsword')?.property[0]).toMatchObject({
      damage: { dice: '1d6', type: 'fire' },
    })
  })

  // GM Core p. 223: upgrading costs the difference in Price; one rune of a family at a time.
  it('charges the price difference to upgrade a rune, whichever way its grade is named', () => {
    const sword = longsword()
    const plus1 = named(runes, 'Weapon Potency (+1)')
    const plus2 = named(runes, 'Weapon Potency (+2)')
    expect(runeCost(sword.pf2e!, plus1, runes)).toBe(plus1.price)
    etchRune(sword, plus1)
    expect(runeCost(sword.pf2e!, plus2, runes)).toBe(plus2.price - plus1.price)
    etchRune(sword, plus2)
    const impactful = named(runes, 'Impactful')
    const greater = named(runes, 'Greater Impactful')
    expect(runeFamily(greater.name)).toBe(runeFamily(impactful.name))
    etchRune(sword, impactful)
    expect(runeCost(sword.pf2e!, greater, runes)).toBe(greater.price - impactful.price)
    etchRune(sword, greater)
    expect(sword.pf2e!.runes!.property.map((p) => p.name)).toEqual(['Greater Impactful'])
  })

  // GM Core p. 278: a staff is a staff weapon that takes fundamental runes, not property runes.
  it('etches fundamental runes on a staff, and its Strike uses them', () => {
    const s = hero()
    const staff = itemFromDef({ set: 'item', def: item(staves, 'Staff of Fire') })
    staff.pf2e!.carry = 'held'
    s.inventory.push(staff)
    expect(etchRune(staff, item(runes, 'Weapon Potency (+1)'))).toMatch(/Etched/)
    expect(etchRune(staff, item(runes, 'Striking'))).toMatch(/Etched/)
    expect(runeProblem(staff.pf2e!, item(runes, 'Flaming'))).toMatch(/fundamental runes only/)
    expect(strikeRunes(s, 'Staff of Fire')).toMatchObject({ potency: 1, striking: 1 })
  })

  it('carries a rune’s persistent damage, its damage against some foes and keen to the Strike', () => {
    const s = hero()
    const sword = longsword()
    s.inventory.push(sword)
    etchRune(sword, item(runes, 'Weapon Potency (+2)'))
    etchRune(sword, item(runes, 'Wounding'))
    etchRune(sword, item(runes, 'Keen'))
    const property = strikeRunes(s, 'Longsword')!.property
    expect(property.find((p) => p.name === 'Keen')?.keen).toBe(true)
    expect(runeDamageNotes(property)).toEqual(['+1d6 persistent bleed (Wounding)'])
    expect(
      runeDamageNotes([{ name: 'Vitalizing', vs: named(runes, 'Vitalizing').rune!.vs }]),
    ).toEqual(['+1d6 persistent vitality against undead (Vitalizing)'])
    expect(runeDamageNotes([{ name: 'Holy', vs: named(runes, 'Holy').rune!.vs }])).toEqual([
      '2d4 spirit against an unholy target instead (Holy)',
    ])
    // Keen (GM Core p. 237): a natural 19 that hits is a critical hit; a miss stays a miss.
    expect(degreeOf(20, 19, 18, true)).toBe('critical success')
    expect(degreeOf(20, 19, 18)).toBe('success')
    expect(degreeOf(17, 19, 18, true)).toBe('failure')
  })

  // Player Core pp. 282–283; Guns & Gears (Remastered) p. 158.
  it('reads two-hand, fatal aim and versatile off the weapon’s traits', () => {
    expect(traitsInHands(['Concussive', 'Fatal Aim d12'], true)).toContain('Fatal d12')
    expect(traitsInHands(['Concussive', 'Fatal Aim d12'], false)).not.toContain('Fatal d12')
    expect(versatileType(named(weapons, 'Gladius').traits)).toBe('Slashing')
    expect(versatileType(named(weapons, 'Club').traits)).toBeUndefined()
  })

  it('adds armor potency to AC, and resilient to saves only while invested', () => {
    const s = hero()
    const mail = itemFromDef({ set: 'armor', def: item(armor, 'Chain Mail') })
    s.inventory.push(mail)
    etchRune(mail, item(runes, 'Armor Potency (+1)'))
    etchRune(mail, item(runes, 'Resilient'))
    expect(adjusted(s, 18, { kind: 'ac' }).value).toBe(19)
    expect(adjusted(s, 5, { kind: 'save', save: 'Fortitude' }).value).toBe(5)
    expect(setInvested(s, 0, true)).toMatch(/^Invested/)
    expect(adjusted(s, 5, { kind: 'save', save: 'Fortitude' }).value).toBe(6)
    mail.pf2e!.carry = 'stowed'
    expect(adjusted(s, 18, { kind: 'ac' }).value).toBe(18)
  })
})

describe('pf2e consumables (GM Core pp. 244–262)', () => {
  it('heals with a healing potion (minor: 1d8) and spends it', () => {
    const s = hero()
    s.inventory.push(
      itemFromDef({ set: 'item', def: item(consumables, 'Healing Potion (Minor)') }, 2),
    )
    expect(useConsumable(s, 0, { level: 1, rng: high })).toMatch(/Healed 8: 18\/20 HP/)
    expect(s.inventory[0]!.pf2e!.count).toBe(1)
    useConsumable(s, 0, { level: 1, rng: low })
    expect(s.hp).toBe(19)
    expect(s.inventory).toHaveLength(0)
  })

  it('pays its action on your turn', () => {
    const s = hero({
      turn: { active: true, actions: 0, reaction: true, attacks: 0, round: 1 },
    })
    s.inventory.push(itemFromDef({ set: 'item', def: item(consumables, 'Healing Potion (Minor)') }))
    expect(useConsumable(s, 0, { level: 1 })).toMatch(/takes 1 action/)
    expect(s.inventory).toHaveLength(1)
  })

  it('turns an elixir’s bonus on as an effect (eagle-eye: +1 Perception for an hour)', () => {
    const s = hero()
    s.inventory.push(
      itemFromDef({ set: 'item', def: item(consumables, 'Eagle-Eye Elixir (Lesser)') }),
    )
    expect(useConsumable(s, 0, { level: 1 })).toMatch(/is on/)
    expect(s.effects?.on).toContain('Eagle-Eye Elixir (Lesser)')
    expect(activeEffects(s).map((a) => a.def.name)).toContain('Eagle-Eye Elixir (Lesser)')
    expect(adjusted(s, 5, { kind: 'perception', attr: 'WIS' }).value).toBe(6)
  })

  // Any listed duration ends by itself, counted in rounds (10 a minute).
  it('ends a consumable’s effect when its duration runs out, and a new dose starts it over', () => {
    expect(durationRounds('3 rounds')).toBe(3)
    expect(durationRounds('10 minutes')).toBe(100)
    expect(durationRounds('24 hours')).toBe(14400)
    const s = hero()
    const elixir = item(consumables, 'Eagle-Eye Elixir (Lesser)')
    s.inventory.push(itemFromDef({ set: 'item', def: elixir }, 2))
    useConsumable(s, 0, { level: 1 })
    expect(timePasses(s, '10min')).not.toMatch(/Eagle-Eye Elixir \(Lesser\) ends/)
    for (let i = 0; i < 4; i++) timePasses(s, '10min')
    expect(s.effects?.items?.[0]?.rounds).toBe(100)
    expect(useConsumable(s, 0, { level: 1 })).toMatch(
      /new dose starts its duration over \(1 hour\)/,
    )
    expect(s.effects?.items?.[0]?.rounds).toBe(600)
    for (let i = 0; i < 5; i++) timePasses(s, '10min')
    expect(timePasses(s, '10min')).toMatch(/Eagle-Eye Elixir \(Lesser\) ends/)
    expect(s.effects?.on).not.toContain('Eagle-Eye Elixir (Lesser)')
  })

  it('counts a round per turn, a minute for an encounter, and ends all at daily preparations', () => {
    const s = hero()
    const three = itemFromDef({ set: 'item', def: item(consumables, 'Eagle-Eye Elixir (Lesser)') })
    three.name = 'Quick Draught'
    three.pf2e!.duration = '3 rounds'
    s.inventory.push(three)
    useConsumable(s, 0, { level: 1 })
    startPf2eTurn(s)
    startPf2eTurn(s)
    startPf2eTurn(s)
    expect(s.effects?.on).toContain('Quick Draught')
    expect(startPf2eTurn(s)).toMatch(/Quick Draught ends/)
    const minute = itemFromDef({ set: 'item', def: item(consumables, 'Eagle-Eye Elixir (Lesser)') })
    minute.pf2e!.duration = '1 minute'
    s.inventory.push(minute)
    useConsumable(s, 0, { level: 1 })
    expect(endPf2eEncounter(s)).toMatch(/Eagle-Eye Elixir \(Lesser\) ends/)
    const day = itemFromDef({ set: 'item', def: item(consumables, 'Eagle-Eye Elixir (Lesser)') })
    day.pf2e!.duration = '24 hours'
    s.inventory.push(day)
    useConsumable(s, 0, { level: 1 })
    expect(dailyPreparations(s)).toMatch(/ends/)
    expect(s.effects?.on).toEqual([])
  })

  // An item bonus doesn't stack with another item bonus (Player Core p. 400).
  it('stacks a bomb’s item bonus with the hero’s other item bonuses, the highest counting', () => {
    const s = hero({ attrs: { STR: 0, DEX: 3, CON: 0, INT: 0, WIS: 0, CHA: 0 } })
    s.inventory.push(
      itemFromDef({ set: 'item', def: item(consumables, "Alchemist's Fire (Moderate)") }),
      {
        name: 'Lucky Charm',
        qty: '—',
        pf2e: {
          count: 1,
          bulk: 0,
          carry: 'held',
          bonuses: [{ value: 2, type: 'item', selector: 'attack' }],
        },
      },
    )
    // Trained at 3rd level (+5) and DEX +3: +8, then the charm's +2, not the bomb's +1 as well.
    const text = useConsumable(s, 0, { level: 3, targetAc: 15, bombRank: 'T', rng: low })
    expect(text).toMatch(/\(attack 1, \+10\)/)
  })

  it('throws a bomb as a Strike: lesser alchemist’s fire 1d8 fire plus 1 splash on a hit', () => {
    const s = hero({ attrs: { STR: 0, DEX: 3, CON: 0, INT: 0, WIS: 0, CHA: 0 } })
    s.inventory.push(
      itemFromDef({ set: 'item', def: item(consumables, "Alchemist's Fire (Lesser)") }),
    )
    // A 20 on the d20 against AC 15: +6 (trained +3, DEX +3), a critical hit doubling the 8.
    const text = useConsumable(s, 0, { level: 1, targetAc: 15, bombRank: 'T', rng: high })
    expect(text).toMatch(/\(attack 1, \+6\): 26, natural 20 vs AC 15: Critical hit: 16 fire/)
    expect(text).toMatch(/\+ 1 fire splash/)
    expect(text).toMatch(/2 persistent fire/)
  })

  it('buys with coins, making change', () => {
    const s = hero({ coins: { gp: 15, sp: 0, cp: 0 } })
    expect(pay(s, 1234)).toBe(true)
    expect(s.coins).toEqual({ gp: 2, sp: 6, cp: 6 })
    expect(pay(s, 1000)).toBe(false)
  })
})

describe('pf2e scrolls, wands and staves (GM Core pp. 262, 278, 282)', () => {
  const wizard = (): Pf2eSheet =>
    hero({
      spellcasting: {
        tradition: 'Arcane',
        kind: 'prepared',
        attr: 'INT',
        rank: 'T',
        cantrips: [],
        spells: [],
        slots: slotsFor([2, 2, 0, 0, 0, 0, 0, 0, 0, 0], 'prepared'),
      },
      attrs: { STR: 0, DEX: 0, CON: 0, INT: 4, WIS: 0, CHA: 0 },
    })
  const sorcerer = (): Pf2eSheet => ({
    ...wizard(),
    spellcasting: {
      ...wizard().spellcasting!,
      kind: 'spontaneous',
      slots: slotsFor([3, 3, 0, 0, 0, 0, 0, 0, 0, 0], 'spontaneous'),
    },
  })

  it('casts a scroll’s spell at its rank and uses the scroll up', () => {
    const s = wizard()
    const forceBarrage = item(spells, 'Force Barrage') as (typeof spells)[number]
    s.inventory.push(
      itemFromDef({ set: 'item', def: item(consumables, '1st-rank Scroll') }, 1, forceBarrage),
    )
    expect(s.inventory[0]!.name).toBe('Scroll of Force Barrage (rank 1)')
    const text = castFromItem(s, 0, forceBarrage, { level: 3, rng: high })
    expect(text).toMatch(/^Scroll of Force Barrage/)
    expect(s.inventory).toHaveLength(0)
  })

  it("won't cast a spell that isn't on the hero's list", () => {
    const s = wizard()
    const heal = item(spells, 'Heal') as (typeof spells)[number]
    s.inventory.push(
      itemFromDef({ set: 'item', def: item(consumables, '1st-rank Scroll') }, 1, heal),
    )
    expect(castFromItem(s, 0, heal, { level: 3 })).toMatch(/isn't on the arcane spell list/)
    expect(s.inventory).toHaveLength(1)
  })

  it('casts from a wand once a day, then overcharges it at a DC 10 flat check', () => {
    const s = wizard()
    s.inventory.push(itemFromDef({ set: 'item', def: item(wands, 'Magic Wand (1st-rank Spell)') }))
    expect(useWand(s, 0, 15)).toMatchObject({ cast: true, destroyed: false })
    expect(useWand(s, 0, 15)).toMatchObject({ cast: true, destroyed: false })
    expect(s.inventory[0]!.pf2e!.wand).toMatchObject({ overcharged: true, broken: true })
    expect(useWand(s, 0, 15).text).toMatch(/broken/)
    const forceBarrage = item(spells, 'Force Barrage') as (typeof spells)[number]
    expect(castFromItem(s, 0, forceBarrage, { level: 3 })).toMatch(/broken until it's Repaired/)
    const t = hero()
    t.inventory.push(itemFromDef({ set: 'item', def: item(wands, 'Magic Wand (1st-rank Spell)') }))
    useWand(t, 0, 15)
    expect(useWand(t, 0, 3)).toMatchObject({ cast: true, destroyed: true })
    expect(t.inventory).toHaveLength(0)
    const u = hero()
    u.inventory.push(itemFromDef({ set: 'item', def: item(wands, 'Magic Wand (1st-rank Spell)') }))
    useWand(u, 0, 15)
    dailyPreparations(u)
    expect(useWand(u, 0, 15).text).toMatch(/its use for today/)
  })

  it('charges a staff with the highest slot’s rank, plus an expended slot for a prepared caster', () => {
    const s = wizard()
    s.inventory.push(itemFromDef({ set: 'item', def: item(staves, 'Staff of Fire') }))
    expect(prepareStaff(s, 0)).toMatch(/2 charges/)
    expect(prepareStaff(s, 0, { rank: 1 })).toMatch(/3 charges \(2 \+ 1 from a rank 1 slot\)/)
    expect(s.spellcasting!.slots[0]!.prepared![0]!.cast).toBe(true)
    expect(spendStaff(s, 0, 1)).toMatchObject({ ok: true, text: expect.stringMatching(/2 left/) })
    expect(spendStaff(s, 0, 0).text).toMatch(/cantrip, no charge/)
    expect(spendStaff(s, 0, 3)).toMatchObject({ ok: false })
    itemsDailyPrep(s)
    expect(s.inventory[0]!.pf2e!.charges).toBe(0)
  })

  it('lets a spontaneous caster pay 1 charge and a slot instead', () => {
    const s = sorcerer()
    s.inventory.push(itemFromDef({ set: 'item', def: item(staves, 'Staff of Fire') }))
    prepareStaff(s, 0)
    expect(spendStaff(s, 0, 1, 2).text).toMatch(/1 charge and a rank 2 slot \(1 left\)/)
    expect(s.spellcasting!.slots[1]!.used).toBe(1)
  })

  it('casts a staff spell through the spell rules, spending charges by rank', () => {
    const s = wizard()
    s.inventory.push(itemFromDef({ set: 'item', def: item(staves, 'Staff of Fire') }))
    prepareStaff(s, 0)
    const breatheFire = item(spells, 'Breathe Fire') as (typeof spells)[number]
    const text = castFromItem(s, 0, breatheFire, { level: 3, rank: 1, rng: high })
    expect(text).toMatch(/^Staff of Fire: 1 charge \(1 left\)/)
    expect(text).toMatch(/Reflex/)
  })
})
