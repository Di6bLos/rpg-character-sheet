import { describe, expect, it } from 'vitest'
import { ANCESTRIES } from '../data/nimble/ancestries'
import { BACKGROUNDS } from '../data/nimble/backgrounds'
import { NIMBLE_CLASSES } from '../data/nimble/classes'
import type { NimbleSheet } from '../types/sheets'
import { rollNimble } from '../utils/dice'
import { abilityBaseName, sheetResource } from '../utils/nimbleBuild'
import {
  abilityCounters,
  actionsLeft,
  castingBlocks,
  castSpell,
  dyingAttackSave,
  encounterMana,
  fieldRest,
  fieldRestDice,
  heal,
  hitDiceLeft,
  inventorySlots,
  isBloodied,
  isDead,
  isHollowOne,
  newEncounter,
  newTurn,
  payBloodCast,
  payShadowExploit,
  safeRest,
  shadowExploitCost,
  spellActions,
  spendActions,
  spendMana,
  stopCasting,
  takeDamage,
  turnActions,
} from '../utils/nimblePlay'
import {
  NIMBLE_RULES_VERSION,
  defaultSheet,
  normalizeSheet,
  parseLegacyGold,
} from '../utils/sheetDefaults'

/** Deterministic rng that yields the given die faces for a die of `sides`. */
function faces(sides: number, ...values: number[]) {
  let i = 0
  return () => ((values[i++ % values.length] ?? 1) - 1) / sides + 0.0001
}

function hero(patch: Partial<NimbleSheet> = {}): NimbleSheet {
  return { ...defaultSheet('nimble'), hp: 20, hpMax: 20, hitDice: 3, hitDie: 8, ...patch }
}

describe('nimble damage and healing', () => {
  it('lets temp HP absorb damage first', () => {
    const sheet = hero({ tempHp: 3 })
    expect(takeDamage(sheet, 5)).toBe('')
    expect(sheet.tempHp).toBe(0)
    expect(sheet.hp).toBe(18)
  })

  it('goes Dying with a Wound at 0 HP and breaks concentration', () => {
    const sheet = hero({ hp: 2, concentration: 'Shadow Trap' })
    const message = takeDamage(sheet, 9)
    expect(sheet.hp).toBe(0)
    expect(sheet.dying).toBe(true)
    expect(sheet.wounds).toBe(1)
    expect(sheet.concentration).toBe('')
    expect(message).toContain('Concentration broken')
  })

  it('adds 2 Wounds for damage while Dying, up to the maximum', () => {
    const sheet = hero({ hp: 0, dying: true, wounds: 5, woundsMax: 6 })
    takeDamage(sheet, 1)
    expect(sheet.wounds).toBe(6)
    expect(isDead(sheet)).toBe(true)
  })

  it('stops Dying when healed and never passes max HP', () => {
    const sheet = hero({ hp: 0, dying: true })
    heal(sheet, 50)
    expect(sheet.hp).toBe(20)
    expect(sheet.dying).toBe(false)
  })

  it('is Bloodied at half HP or less, but not at 0', () => {
    expect(isBloodied(hero({ hp: 10 }))).toBe(true)
    expect(isBloodied(hero({ hp: 11 }))).toBe(false)
    expect(isBloodied(hero({ hp: 0 }))).toBe(false)
  })
})

describe('nimble mana', () => {
  it('spends temporary mana before the pool', () => {
    const sheet = hero({ mana: { current: 5, max: 8, temp: 2 } })
    expect(spendMana(sheet, 3)).toBe(true)
    expect(sheet.mana).toEqual({ current: 4, max: 8, temp: 0 })
  })

  it('refuses a cost it cannot pay', () => {
    const sheet = hero({ mana: { current: 1, max: 8, temp: 1 } })
    expect(spendMana(sheet, 3)).toBe(false)
    expect(sheet.mana).toEqual({ current: 1, max: 8, temp: 1 })
  })

  it('reads the actions a spell takes from its cast line', () => {
    expect(spellActions('1 Action, Single Target')).toBe(1)
    expect(spellActions('3 Actions, AoE')).toBe(3)
    expect(spellActions('Casting Time: 1 min')).toBe(0)
  })
})

describe('nimble rests', () => {
  it('rolls each Hit Die plus STR when catching breath', () => {
    const sheet = hero({ hp: 1, stats: { STR: 2, DEX: 0, INT: 0, WIL: 0 } })
    const message = fieldRest(sheet, { dice: 2, camp: false }, faces(8, 6, 3))
    expect(sheet.hp).toBe(14)
    expect(hitDiceLeft(sheet)).toBe(1)
    expect(message).toBe('Catch Breath: 2 Hit Dice (rolled 6, 3, +2 STR each), +13 HP.')
  })

  it('takes the maximum of each die when making camp', () => {
    const sheet = hero({ hp: 5, stats: { STR: -1, DEX: 0, INT: 0, WIL: 0 } })
    fieldRest(sheet, { dice: 1, camp: true })
    expect(sheet.hp).toBe(12)
    expect(hitDiceLeft(sheet)).toBe(2)
  })

  it('never lets negative STR take HP away', () => {
    const sheet = hero({ hp: 5, stats: { STR: -3, DEX: 0, INT: 0, WIL: 0 } })
    fieldRest(sheet, { dice: 1, camp: false }, faces(8, 1))
    expect(sheet.hp).toBe(5)
  })

  it('reports healing lost over max HP', () => {
    const sheet = hero({ hp: 18 })
    expect(fieldRest(sheet, { dice: 1, camp: true })).toBe(
      'Make Camp: 1 Hit Die (took 8, +0 STR each), +2 HP (6 lost over max).',
    )
    expect(sheet.hp).toBe(20)
  })

  it('spends nothing at full HP or without Hit Dice left', () => {
    const full = hero()
    expect(fieldRest(full, { dice: 1, camp: true })).toBe('')
    expect(full.hitDiceUsed).toBe(0)
    const spent = hero({ hp: 5, hitDiceUsed: 3 })
    expect(fieldRest(spent, { dice: 1, camp: false })).toBe('')
    expect(spent.hp).toBe(5)
  })

  it('clamps the dice spent to the dice left', () => {
    const sheet = hero({ hp: 1, hitDiceUsed: 2 })
    fieldRest(sheet, { dice: 5, camp: true })
    expect(hitDiceLeft(sheet)).toBe(0)
    expect(sheet.hp).toBe(9)
  })

  it('suggests the Hit Dice needed to reach full HP', () => {
    // 15 missing: d8 max 8 → 2 dice; average 4.5 → 4 dice, capped at the 3 left.
    expect(fieldRestDice(hero({ hp: 5 }), true)).toBe(2)
    expect(fieldRestDice(hero({ hp: 5 }), false)).toBe(3)
    expect(fieldRestDice(hero({ hp: 19 }), false)).toBe(1)
    expect(fieldRestDice(hero(), true)).toBe(0)
    expect(fieldRestDice(hero({ hp: 5, hitDiceUsed: 3 }), true)).toBe(0)
  })

  it('restores everything on a Safe Rest and heals one Wound', () => {
    const sheet = hero({
      hp: 0,
      dying: true,
      tempHp: 4,
      wounds: 3,
      hitDiceUsed: 2,
      mana: { current: 1, max: 9, temp: 2 },
      uses: { 'Searing Light': { max: 3, used: 3 } },
      actionsSpent: 2,
      reactionsUsed: ['Defend'],
    })
    sheet.resource.count = 2
    safeRest(sheet)
    expect(sheet).toMatchObject({
      hp: 20,
      dying: false,
      tempHp: 0,
      wounds: 2,
      hitDiceUsed: 0,
      mana: { current: 9, max: 9, temp: 0 },
      actionsSpent: 0,
      reactionsUsed: [],
    })
    expect(sheet.uses['Searing Light']).toEqual({ max: 3, used: 0 })
    expect(sheet.resource.count).toBe(0)
  })
})

describe('nimble turn tracker', () => {
  it('gives 3 actions, or 1 while Dying', () => {
    expect(actionsLeft(hero())).toBe(3)
    expect(actionsLeft(hero({ hp: 0, dying: true }))).toBe(1)
  })

  it('counts Enduring Rage and Windborne in the action limit and the Dying save', () => {
    const rage = [{ name: 'Enduring Rage', src: 'Berserker', desc: '', level: 4 }]
    const wind = [{ name: 'Windborne', src: 'Zephyr', desc: '', level: 20 }]
    expect(turnActions(hero({ abilities: rage }))).toBe(3)
    expect(turnActions(hero({ hp: 0, dying: true, abilities: rage }))).toBe(2)
    expect(turnActions(hero({ abilities: wind }))).toBe(4)
    expect(turnActions(hero({ hp: 0, dying: true, abilities: wind }))).toBe(2)
    expect(dyingAttackSave(hero({ hp: 0, dying: true }))).toBe(true)
    expect(dyingAttackSave(hero({ hp: 0, dying: true, abilities: rage }))).toBe(false)
    expect(dyingAttackSave(hero({ hp: 0, dying: true, abilities: wind }))).toBe(true)
  })

  it('resets actions, Rushed Attacks and reactions on a new turn', () => {
    const sheet = hero({ rushed: 2, reactionsUsed: ['Defend', 'Help'] })
    spendActions(sheet, 5)
    expect(actionsLeft(sheet)).toBe(0)
    newTurn(sheet)
    expect(sheet).toMatchObject({ actionsSpent: 0, rushed: 0, reactionsUsed: [] })
  })

  it('grows an active Rage by one Fury die each turn', () => {
    const sheet = hero()
    sheet.resource = { ...sheet.resource, name: 'Rage', active: true, dice: 1 }
    newTurn(sheet)
    expect(sheet.resource.dice).toBe(2)
  })

  it('drops the highest die for each Rushed Attack', () => {
    // 2 dice rolled for a 1d8 with one disadvantage: 7 is dropped, 3 is kept.
    const result = rollNimble({ count: 1, sides: 8, mod: 2 }, null, faces(8, 7, 3), 1)
    expect(result).toEqual({ miss: false, crit: false, total: 5, bonus: 0 })
    // The kept die is a 1: a miss.
    expect(rollNimble({ count: 1, sides: 8, mod: 2 }, null, faces(8, 1, 6), 1).miss).toBe(true)
  })
})

describe('nimble inventory', () => {
  it('counts slots: small items share one, potions pair up, weapons each take theirs', () => {
    const sheet = hero({
      stats: { STR: 2, DEX: 0, INT: 0, WIL: 0 },
      coins: { gp: 1200, sp: 0 },
      inventory: [
        { name: 'Staff', qty: '1' }, // two-handed: 2
        { name: 'Dagger', qty: '2' }, // 2
        { name: 'Javelins', qty: '4' }, // a stack: 1
        { name: 'Healing Potion', qty: '3' }, // 2
        { name: 'Chalk', qty: '1', slots: 0 },
        { name: 'Soap', qty: '5', slots: 0 }, // small items: 1 together
        { name: 'Rope', qty: '1' }, // 1
      ],
    })
    // + 2 for 1200 gp
    expect(inventorySlots(sheet)).toEqual({ used: 11, max: 12 })
  })
})

describe('casting over several turns', () => {
  it('carries unpaid actions to the next turn and concentrates once cast', () => {
    const sheet = hero()
    spendActions(sheet, 2)
    expect(castSpell(sheet, 'Fiery Embrace', 2)).toMatch(/1 more action/)
    expect(actionsLeft(sheet)).toBe(0)
    expect(sheet.concentration).toBe('')
    expect(sheet.casting).toEqual({ spell: 'Fiery Embrace', actions: 1 })
    expect(newTurn(sheet)).toMatch(/Fiery Embrace takes effect/)
    expect(actionsLeft(sheet)).toBe(2)
    expect(sheet.concentration).toBe('Fiery Embrace')
    expect(sheet.casting).toEqual({ spell: '', actions: 0 })
  })

  it('spreads a long cast over as many turns as it needs', () => {
    const sheet = hero()
    castSpell(sheet, 'Ritual', 5)
    expect(sheet.casting.actions).toBe(2)
    newTurn(sheet)
    expect(actionsLeft(sheet)).toBe(1)
    expect(sheet.casting.actions).toBe(0)
  })

  it('will not start another spell over one still being cast', () => {
    const sheet = hero()
    castSpell(sheet, 'Fiery Embrace', 5)
    expect(castingBlocks(sheet, 2)).toBe(true)
    expect(castingBlocks(sheet, 0)).toBe(false)
    expect(castSpell(sheet, 'Ignite', 2)).toMatch(/Still casting Fiery Embrace/)
    expect(sheet.casting).toEqual({ spell: 'Fiery Embrace', actions: 2 })
    expect(stopCasting(sheet)).toBe('Stopped casting Fiery Embrace.')
    expect(castingBlocks(sheet, 2)).toBe(false)
  })

  it('casts at once when the turn has the actions', () => {
    const sheet = hero()
    expect(castSpell(sheet, 'Fiery Embrace', 2)).toBe(' Concentrating.')
    expect(actionsLeft(sheet)).toBe(1)
  })
})

describe('Reaver casting', () => {
  const reaver = () =>
    hero({ abilities: [{ name: 'Hollow One', src: 'Reaver', desc: '', level: 3 }] })

  it('costs one more minion for each Shadow Exploit this encounter', () => {
    const sheet = reaver()
    expect(isHollowOne(sheet)).toBe(true)
    expect(isHollowOne(hero())).toBe(false)
    expect(payShadowExploit(sheet)).toBe(1)
    expect(payShadowExploit(sheet)).toBe(2)
    expect(shadowExploitCost(sheet)).toBe(3)
    newEncounter(sheet)
    expect(shadowExploitCost(sheet)).toBe(1)
  })

  it('pays My Blood, My Power with a Wound', () => {
    const sheet = reaver()
    payBloodCast(sheet)
    expect(sheet.wounds).toBe(1)
  })
})

describe('nimble sheet upgrades', () => {
  it('fills the new fields on an older save and moves gold to coins', () => {
    const old = { hp: 7, hpMax: 9, gold: '12 gp', mana: { current: 2, max: 4 } }
    const sheet = normalizeSheet('nimble', old)
    expect(sheet.coins).toEqual({ gp: 12, sp: 0 })
    expect('gold' in sheet).toBe(false)
    expect(sheet.mana).toEqual({ current: 2, max: 4, temp: 0 })
    expect(sheet).toMatchObject({ tempHp: 0, dying: false, hitDiceUsed: 0, conditions: [] })
    expect(sheet.resource.kind).toBe('rage')
  })

  it('gives older Berserker saves the Mighty Endurance Wounds once', () => {
    const picked = { 'L4:savage-arsenal': ['Mighty Endurance'] }
    const old = {
      classSlug: 'berserker',
      choices: picked,
      woundsMax: 7, // 6 + a hand edit, which stays
      levelHistory: [
        { level: 5, before: { classSlug: 'berserker', choices: picked, woundsMax: 6 } },
        { level: 4, before: { classSlug: 'berserker', choices: {}, woundsMax: 6 } },
      ],
    }
    const sheet = normalizeSheet('nimble', old)
    expect(sheet.woundsMax).toBe(11)
    expect(sheet.rulesVersion).toBe(NIMBLE_RULES_VERSION)
    expect(sheet.levelHistory?.map((e) => e.before.woundsMax)).toEqual([10, 6])
    expect(old.woundsMax).toBe(7) // the stored object isn't mutated
    expect(old.levelHistory[0]!.before.woundsMax).toBe(6)

    // Loading the upgraded save again adds nothing.
    const again = normalizeSheet('nimble', JSON.parse(JSON.stringify(sheet)))
    expect(again.woundsMax).toBe(11)
    expect(again.levelHistory?.map((e) => e.before.woundsMax)).toEqual([10, 6])
    // New sheets are already current.
    expect(defaultSheet('nimble').rulesVersion).toBe(NIMBLE_RULES_VERSION)
  })

  it('gives older saves the speed and Hit Dice of picked pool options', () => {
    const sheet = normalizeSheet('nimble', {
      classSlug: 'oathsworn',
      rulesVersion: 1,
      speed: '6',
      choices: { 'L3:sacred-decree': ['Unstoppable Protector'] },
    })
    expect(sheet.speed).toBe('7')
    const boon = normalizeSheet('nimble', {
      classSlug: 'shadowmancer',
      rulesVersion: 1,
      hitDice: 5,
      choices: { 'L4:greater-invocations': ['Fiendish Boon'] },
    })
    expect(boon.hitDice).toBe(4)
    expect(normalizeSheet('nimble', JSON.parse(JSON.stringify(boon))).hitDice).toBe(4)
  })

  it('keeps coins that were already saved', () => {
    const sheet = normalizeSheet('nimble', { gold: '99 gp', coins: { gp: 3, sp: 4 } })
    expect(sheet.coins).toEqual({ gp: 3, sp: 4 })
  })

  it('reads the old gold text without partial matches', () => {
    expect(parseLegacyGold('15 gold')).toEqual({ gp: 15, sp: 0, rest: '' })
    expect(parseLegacyGold('1,200')).toEqual({ gp: 1200, sp: 0, rest: '' })
    expect(parseLegacyGold('12 gp, 3 sp')).toEqual({ gp: 12, sp: 3, rest: '' })
    expect(parseLegacyGold('1.5 gp')).toMatchObject({ gp: 0, sp: 0 })
    expect(parseLegacyGold('1.5 gp').rest).not.toBe('')
    expect(parseLegacyGold('30 gp, 4 cp')).toEqual({ gp: 30, sp: 0, rest: '4cp' })
  })

  it('keeps old gold text it cannot convert in the notes', () => {
    const sheet = normalizeSheet('nimble', { gold: '30 gp, 4 cp', notes: 'Owes Bram' })
    expect(sheet.coins).toEqual({ gp: 30, sp: 0 })
    expect(sheet.notes).toBe('Owes Bram\n\nOld Gold field: 30 gp, 4 cp')
    expect(normalizeSheet('nimble', { gold: '12 gp' }).notes).toBe('')
  })

  it('marks an older save at 0 HP as Dying', () => {
    expect(normalizeSheet('nimble', { hp: 0, hpMax: 12 }).dying).toBe(true)
    expect(normalizeSheet('nimble', { hp: 0, hpMax: 12, dying: false }).dying).toBe(false)
    expect(normalizeSheet('nimble', { hp: 5, hpMax: 12 }).dying).toBe(false)
  })
})

describe('class resources', () => {
  const withResource = NIMBLE_CLASSES.filter((c) => c.resource)

  it('covers the classes that track one', () => {
    expect(withResource.map((c) => c.slug).sort()).toEqual([
      'berserker',
      'cheat',
      'commander',
      'hunter',
      'oathsworn',
      'shadowmancer',
      'zephyr',
    ])
  })

  it.each(withResource.map((c) => [c.slug, c] as const))(
    '%s names an ability from its own level table',
    (_slug, cls) => {
      const granted = Object.values(cls.levels).flatMap((l) => l?.abilities ?? [])
      expect(granted.map((a) => abilityBaseName(a.name))).toContain(cls.resource!.ability)
      if (cls.resource!.movesPool)
        expect(cls.pools.map((p) => p.id)).toContain(cls.resource!.movesPool)
    },
  )

  it('shows up once the hero has the ability, with the upgraded die', () => {
    const sheet = hero({ classSlug: 'commander' })
    expect(sheetResource(sheet, 3)).toBeNull()
    sheet.abilities.push({ name: 'Fit for Any Battlefield', src: 'Commander', desc: 'Dice.' })
    expect(sheetResource(sheet, 4)).toMatchObject({ name: 'Combat Dice', kind: 'dice', die: 6 })
    expect(sheetResource(sheet, 9)?.die).toBe(10)
  })

  it('uses the typed-in resource on a hand-made sheet', () => {
    const sheet = hero()
    expect(sheetResource(sheet, 1)).toBeNull()
    sheet.resource.name = 'Focus'
    sheet.resource.kind = 'counter'
    expect(sheetResource(sheet, 1)).toMatchObject({ name: 'Focus', kind: 'counter' })
  })
})

/** A hero with the given abilities, as [name, text] pairs. */
function withAbilities(abilities: [string, string][], patch: Partial<NimbleSheet> = {}) {
  return hero({
    stats: { STR: 1, DEX: 2, INT: 3, WIL: 4 },
    abilities: abilities.map(([name, desc]) => ({ name, desc, src: 'Test' })),
    ...patch,
  })
}

/** "name id max" for every counter, to compare at a glance. */
function counters(sheet: NimbleSheet, level = 1) {
  return abilityCounters(sheet, level).flatMap((e) => e.counters.map((c) => `${c.id} ${c.max}`))
}

describe('limited-use abilities', () => {
  it('reads a limit per turn, round, encounter, day and Safe Rest', () => {
    const sheet = withAbilities([
      ['Reflective Aura', 'When you Defend, gain KEY armor. 1/encounter.'],
      ['Rampage', '(1/turn) After you land a hit, reuse the roll.'],
      ['Weapon Mastery', 'You may sheathe a weapon and draw a different one 2×/round for free.'],
      ['Blood Sight', '(1/day) You may reroll an Examination check.'],
      ['Elusive', 'If you fail a save, you can succeed instead, 1/Safe Rest.'],
    ])
    expect(counters(sheet)).toEqual([
      'Reflective Aura@encounter 1',
      'Rampage@turn 1',
      'Weapon Mastery@turn 2',
      'Blood Sight@rest 1',
      'Elusive@rest 1',
    ])
  })

  it('leaves out abilities the rules do not limit', () => {
    const sheet = withAbilities([
      ['Elemental Spellcasting', 'You know Fire, Ice, and Lightning cantrips.'],
      ['Into the Fray', 'Action: Leap up to 2×DEX spaces toward an enemy.'],
      [
        'Mana and Unlock Tier 1 Spells',
        'You gain a mana pool to cast them. Its maximum is always (INT×3)+LVL and it recharges on a Safe Rest.',
      ],
      ['Master Commander', '+1 use of Coordinated Strike/Safe Rest.'],
      ['Sneak Attack', 'When you crit, deal +1d6 damage per round of combat.'],
    ])
    expect(counters(sheet)).toEqual([])
  })

  it('works out stat and level based limits and pools', () => {
    const sheet = withAbilities([
      [
        'Lay on Hands',
        'Gain a magical pool of healing power. Its maximum is always 5×LVL and it recharges on a Safe Rest.',
      ],
      ['Searing Light', '(WIL times/Safe Rest) Action: Heal WIL d8 HP.'],
      ['Songweaver’s Inspiration', '(2×WIL times/Safe Rest) Free Reaction: reroll a die.'],
      ['Illuminate Soul', 'Action: A creature glows. You may do this WIL times per Safe Rest.'],
      [
        'Beastshift',
        'Action: Transform. You have DEX Beastshift charges; they reset on a Safe Rest.',
      ],
      ['Draconic Heritage', 'Deal LVL+KEY damage; recharges when you Safe Rest or gain a Wound.'],
    ])
    expect(counters(sheet, 3)).toEqual([
      'Lay on Hands@rest 15',
      'Searing Light@rest 4',
      'Songweaver’s Inspiration@rest 8',
      'Illuminate Soul@rest 4',
      'Beastshift@rest 2',
      'Draconic Heritage@rest 1',
    ])
  })

  it('gives an ability with several limits a counter for each', () => {
    const sheet = withAbilities([
      [
        'Cheat',
        '(1/round) You may either Move or Hide for free. (1/day) You may change any skill check to 10+INT.',
      ],
      [
        'Coordinated Strike!',
        '(1/round) Free action: attack. You can do this INT times/Safe Rest.',
      ],
      [
        'Small Companion',
        'Keen Eyes: (1/encounter) Mark a target for free. Protect Me!: (1/encounter) Distract.',
      ],
    ])
    expect(counters(sheet)).toEqual([
      'Cheat@turn 1',
      'Cheat@rest 1',
      'Coordinated Strike!@turn 1',
      'Coordinated Strike!@rest 3',
      'Small Companion@encounter 1',
      'Small Companion@encounter#2 1',
    ])
    expect(abilityCounters(sheet, 1)[0]?.counters.map((c) => c.hint)).toEqual([
      'You may either Move or Hide for free',
      'You may change any skill check to 10+INT',
    ])
  })

  it('raises a limit at the levels the text names', () => {
    const sheet = withAbilities([
      [
        'Small Companion',
        'Keen Eyes: (1/encounter) Mark a target for free (L7: 2/encounter, L11: 3/encounter).',
      ],
    ])
    expect(counters(sheet, 6)).toEqual(['Small Companion@encounter 1'])
    expect(counters(sheet, 7)).toEqual(['Small Companion@encounter 2'])
    expect(counters(sheet, 12)).toEqual(['Small Companion@encounter 3'])
  })

  it('adds the extra uses other abilities grant', () => {
    const sheet = withAbilities([
      ['Coordinated Strike!', '(1/round) Free action. You can do this INT times/Safe Rest.'],
      [
        'Master Commander (3)',
        'Regain 1 spent use of Coordinated Strike.\nLevel 9: +1 use of Coordinated Strike/Safe Rest.\nLevel 13: +1 use of Coordinated Strike/Safe Rest.',
      ],
      ['Songweaver’s Inspiration', '(2×WIL times/Safe Rest) Free Reaction: reroll.'],
      ['Heroic Ballad', '+2 max Songweaver’s Inspiration charges.'],
      ['Beastshift', 'You have DEX Beastshift charges; they reset on a Safe Rest.'],
      ['Expert Shifter', 'Gain 1 additional use of Beastshift per Safe Rest.'],
      ['Master of Forms (2)', 'You can Beastshift 2 additional times per Safe Rest.'],
    ])
    expect(counters(sheet)).toEqual([
      'Coordinated Strike!@turn 1',
      'Coordinated Strike!@rest 5',
      'Songweaver’s Inspiration@rest 10',
      'Beastshift@rest 5',
    ])
  })

  it('keeps the player’s own maximum and the uses spent', () => {
    const sheet = withAbilities([['Searing Light', '(WIL times/Safe Rest) Action: Heal.']], {
      uses: { 'Searing Light@rest': { max: 6, used: 2 } },
    })
    expect(abilityCounters(sheet, 1)[0]?.counters[0]).toMatchObject({ rule: 4, max: 6, used: 2 })
  })

  it('refills by period: turn, encounter, Safe Rest', () => {
    const spent = () => ({
      'A@turn': { used: 1 },
      'B@encounter': { used: 1 },
      'B@encounter#2': { used: 1 },
      'C@rest': { used: 3 },
    })
    const used = (sheet: NimbleSheet) => Object.values(sheet.uses).map((u) => u.used)
    const turn = hero({ uses: spent() })
    newTurn(turn)
    expect(used(turn)).toEqual([0, 1, 1, 3])
    const encounter = hero({ uses: spent(), actionsSpent: 2, reactionsUsed: ['Defend'] })
    newEncounter(encounter)
    expect(used(encounter)).toEqual([0, 0, 0, 3])
    expect(encounter).toMatchObject({ actionsSpent: 0, reactionsUsed: [] })
    const rest = hero({ uses: spent() })
    safeRest(rest)
    expect(used(rest)).toEqual([0, 0, 0, 0])
  })

  it('gives back a spent use of abilities that recharge on Initiative', () => {
    const sheet = withAbilities(
      [
        ['Veilwalker’s Blessing', '(1/Safe Rest) Action: bless.'],
        ['Conduit of Death', 'Your Veilwalker’s Blessing recharges when you roll Initiative.'],
        ['Searing Light', '(WIL times/Safe Rest) Action: Heal.'],
        ['Light Bearer', 'Regain 1 use of Searing Light when you roll Initiative.'],
      ],
      {
        uses: {
          'Veilwalker’s Blessing@rest': { used: 1 },
          'Searing Light@rest': { used: 0 },
        },
      },
    )
    const line = newEncounter(sheet)
    expect(sheet.uses['Veilwalker’s Blessing@rest']?.used).toBe(0)
    expect(sheet.uses['Searing Light@rest']?.used).toBe(0) // nothing spent, nothing to give back
    expect(line).toContain('Veilwalker’s Blessing recharged')
  })

  it('gives a Spellblade INT mana on Initiative', () => {
    const sheet = hero({ classSlug: 'commander', subclassSlug: 'spellblade' })
    sheet.stats.INT = 3
    expect(encounterMana(sheet)).toBe(3)
    newEncounter(sheet)
    expect(sheet.mana.temp).toBe(3)
    expect(encounterMana(hero({ classSlug: 'commander', subclassSlug: 'bulwark' }))).toBe(0)
  })

  it('finds a counter for every limit written in the rules data', () => {
    const written =
      /\d\s*×?\s*\/\s*(?:Safe Rest|day|encounter|turn|round)|(?<!additional )times (?:\/|per )\s*Safe Rest/
    const all = [
      ...NIMBLE_CLASSES.flatMap((c) => [
        ...Object.values(c.levels).flatMap((l) => l?.abilities ?? []),
        ...c.pools.flatMap((p) => p.options),
        ...c.subclasses.flatMap((s) => [
          ...(s.intro ?? []),
          ...Object.values(s.levels).flatMap((l) => l?.abilities ?? []),
        ]),
      ]),
      ...ANCESTRIES.map((a) => a.trait),
      ...BACKGROUNDS,
    ]
    const missed = all
      .filter((a) => written.test(a.desc))
      .filter((a) => counters(withAbilities([[a.name, a.desc]]), 20).length === 0)
      .map((a) => a.name)
    expect(missed).toEqual([])
    // Mana is counted in its own panel, never as an ability.
    const mana = all.filter((a) => /mana pool/i.test(a.desc))
    expect(mana.length).toBeGreaterThan(0)
    for (const a of mana) expect(counters(withAbilities([[a.name, a.desc]]), 5)).toEqual([])
  })
})
