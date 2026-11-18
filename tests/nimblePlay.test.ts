import { describe, expect, it } from 'vitest'
import { ANCESTRIES } from '../data/nimble/ancestries'
import { BACKGROUNDS } from '../data/nimble/backgrounds'
import { NIMBLE_CLASSES } from '../data/nimble/classes'
import type { NimbleSheet } from '../types/sheets'
import { rollNimble } from '../utils/dice'
import {
  abilityArmor,
  abilityBaseName,
  abilityModifiers,
  sheetResource,
} from '../utils/nimbleBuild'
import {
  abilityCounters,
  actionsLeft,
  actionPips,
  endEncounter,
  gainAction,
  newRound,
  toggleActionPip,
  castingBlocks,
  castSpell,
  counterCost,
  dyingAttackSave,
  payCost,
  encounterMana,
  fieldRest,
  fieldRestDice,
  heal,
  hitDiceLeft,
  abilityTrigger,
  afterAttack,
  attackBonus,
  manaCost,
  noteMiss,
  selfGains,
  stealActions,
  woundCharges,
  zealotMax,
  spellshape,
  spellshapeCost,
  initiativeRecharges,
  inventorySlots,
  isBloodied,
  isDead,
  isHollowOne,
  endTurn,
  expendJudgment,
  isMishap,
  newEncounter,
  beginEncounter,
  rollInitiative,
  usedUpLabel,
  startTurn,
  resourceOnAttack,
  rollJudgment,
  spendPower,
  spendResourceMove,
  payBloodCast,
  payShadowExploit,
  rage,
  safeRest,
  spendFury,
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

describe('spent limits', () => {
  it('say when they come back', () => {
    expect(usedUpLabel({ label: 'per turn' })).toBe('Used this turn')
    expect(usedUpLabel({ label: 'per round' })).toBe('Used this round')
    expect(usedUpLabel({ label: 'per Safe Rest' })).toBe('Used this Safe Rest')
    expect(usedUpLabel({ label: 'per day' })).toBe('Used today')
    expect(usedUpLabel({ label: 'pool' })).toBe('None left')
  })
})

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
    safeRest(sheet, 1)
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
  it('steps New encounter → Start turn → End turn → New round → Start turn', () => {
    const sheet = hero()
    const step = () => [sheet.inEncounter, sheet.turnActive, sheet.turnDone]
    expect(step()).toEqual([false, false, false])
    newEncounter(sheet, 1, () => 0.5, 12)
    expect(step()).toEqual([true, false, false])
    startTurn(sheet, 1)
    expect(step()).toEqual([true, true, false])
    endTurn(sheet, 1)
    expect(step()).toEqual([true, false, true])
    newRound(sheet, 1)
    expect(step()).toEqual([true, false, false])
    startTurn(sheet, 1)
    expect(step()).toEqual([true, true, false])
    endTurn(sheet, 1)
    expect(endEncounter(sheet, 1)).toBe('Encounter over.')
    expect(step()).toEqual([false, false, false])
    newEncounter(sheet, 1, () => 0.5, 12)
    safeRest(sheet, 1)
    expect(step()).toEqual([false, false, false])
  })

  it('holds extra actions an ally grants until the turn ends', () => {
    const sheet = hero({ actionsSpent: 2 })
    expect(gainAction(sheet, 2)).toBe('Gained 2 actions: 3 left.')
    expect(gainAction(sheet, 2)).toBe('Gained 2 actions: 5 left.')
    expect(actionPips(sheet)).toBe(5)
    toggleActionPip(sheet, 5)
    expect(actionsLeft(sheet)).toBe(4)
    expect(actionPips(sheet)).toBe(4)
    spendActions(sheet, 5)
    expect(actionsLeft(sheet)).toBe(0)
    toggleActionPip(sheet, 1)
    expect(actionsLeft(sheet)).toBe(1)
    gainAction(sheet, 20)
    expect(actionsLeft(sheet)).toBe(9)
    endTurn(sheet, 1)
    expect(actionsLeft(sheet)).toBe(3)
    expect(sheet.turnActive).toBe(false)
  })

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

  it('gives actions, Rushed Attacks and reactions back at the end of the turn, not the start', () => {
    const sheet = hero({ rushed: 2, reactionsUsed: ['Defend', 'Help'] })
    spendActions(sheet, 5)
    expect(actionsLeft(sheet)).toBe(0)
    expect(endTurn(sheet, 1)).toBe('End of turn: all 3 actions back, reactions ready.')
    expect(sheet).toMatchObject({ actionsSpent: 0, rushed: 0, reactionsUsed: [] })
    spendActions(sheet, 1)
    expect(startTurn(sheet, 1)).toBe('Your turn: 2 actions.')
    expect(actionsLeft(sheet)).toBe(2)
  })

  it('waits for Initiative after New encounter, then rolls it or takes the entered total', () => {
    const sheet = hero({ initMod: 2 })
    expect(beginEncounter(sheet)).toMatch(/^New encounter: .*Roll Initiative\./)
    expect(sheet.awaitingInitiative).toBe(true)
    expect(rollInitiative(sheet, 1, () => 0.5, 21)).toMatch(
      /^Initiative 21 \(as you rolled it\): you start with 3 actions/,
    )
    expect(sheet.awaitingInitiative).toBe(false)
    expect(sheet.initiative).toBe(21)
    expect(actionsLeft(sheet)).toBe(3)
    beginEncounter(sheet)
    expect(sheet.initiative).toBeNull()
  })

  it('starts combat with 1, 2 or all actions by the Initiative roll', () => {
    const roll = (value: number) => () => (value - 0.5) / 20
    const sheet = hero({ initMod: 2 })
    expect(newEncounter(sheet, 1, roll(5))).toMatch(
      /Initiative 7 \(d20 5 \+2\): you start with 1 action\./,
    )
    expect(actionsLeft(sheet)).toBe(1)
    newEncounter(sheet, 1, roll(12))
    expect(actionsLeft(sheet)).toBe(2)
    newEncounter(sheet, 1, roll(18))
    expect(actionsLeft(sheet)).toBe(3)
    const elf = hero({
      abilities: [{ name: 'Lithe', src: 'Elf', desc: 'Advantage on Initiative, +1 Speed.' }],
    })
    let i = 0
    const rolls = [3, 20]
    expect(newEncounter(elf, 1, () => (rolls[i++]! - 0.5) / 20)).toMatch(/d20 20 with advantage/)
    expect(actionsLeft(elf)).toBe(3)
  })

  it('plays Rage by the book: a Fury Die set aside per Rage, capped at KEY, added to STR attacks', () => {
    const rager = (...extra: string[]) =>
      hero({
        classSlug: 'berserker',
        stats: { STR: 2, DEX: 1, INT: 0, WIL: 0 },
        abilities: [
          { name: 'Rage', src: 'Berserker', desc: '(1/turn) Action: Roll a Fury Die.' },
          ...extra.map((name) => ({ name, src: 'Berserker', desc: '' })),
        ],
      })
    const sheet = rager()
    expect(rage(sheet, 1, false, faces(4, 3))).toMatch(/^Rage: rolled 3 \(d4\); Fury 3/)
    expect(rage(sheet, 1)).toBe('Rage: already used this turn.')
    startTurn(sheet, 1)
    expect(sheet.resource.rolls).toEqual([3])
    rage(sheet, 1, false, faces(4, 4))
    startTurn(sheet, 1)
    expect(rage(sheet, 1, false, faces(4, 1))).toMatch(/kept the best 2; Fury 7/)
    expect(sheet.resource.rolls).toEqual([4, 3])
    sheet.abilities.push(
      {
        name: 'That all you got?!',
        src: 'Berserker',
        desc: 'When you are attacked, you may expend 1 or more Fury Dice to reduce the damage taken by STR+DEX for each die spent.',
      },
      {
        name: 'Stone’s Resilience',
        src: 'Mountainheart',
        desc: 'Whenever you expend Fury Dice to reduce incoming damage, add the value of the die to the amount reduced.',
      },
    )
    expect(spendFury(sheet, 0)).toBe('Spent a Fury Die (4): reduce the damage by 7. 1 left.')
    expect(newEncounter(sheet, 1)).toBeTruthy()
    expect(sheet.resource).toMatchObject({ active: false, rolls: [] })

    const fury = rager('Intensifying Fury', 'Boundless Rage')
    rage(fury, 1, false, faces(4, 2))
    expect(fury.resource.rolls).toEqual([6])
    expect(startTurn(fury, 1)).toMatch(/Intensifying Fury: rolled 6/)
    takeDamage(fury, 99)
    expect(fury.resource.active).toBe(false)

    const deep = rager('Deep Rage')
    rage(deep, 1)
    takeDamage(deep, 99)
    expect(deep.resource.active).toBe(true)

    const enduring = rager('Enduring Rage')
    enduring.hp = 0
    enduring.dying = true
    expect(startTurn(enduring, 1)).toMatch(/Enduring Rage: Rage: rolled/)
    expect(enduring.uses['Rage@turn']).toBeUndefined()
  })

  it('drops the highest die for each Rushed Attack', () => {
    // 2 dice rolled for a 1d8 with one disadvantage: 7 is dropped, 3 is kept.
    const result = rollNimble({ count: 1, sides: 8, mod: 2 }, null, faces(8, 7, 3), 1)
    expect(result).toEqual({ miss: false, crit: false, total: 5, bonus: 0, dice: [3] })
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
    expect(castSpell(sheet, 'Fiery Embrace', 2, 1)).toMatch(/1 more action/)
    expect(actionsLeft(sheet)).toBe(0)
    expect(sheet.concentration).toBe('')
    expect(sheet.casting).toEqual({ spell: 'Fiery Embrace', actions: 1 })
    endTurn(sheet, 1)
    expect(startTurn(sheet, 1)).toMatch(/Fiery Embrace takes effect/)
    expect(actionsLeft(sheet)).toBe(2)
    expect(sheet.concentration).toBe('Fiery Embrace')
    expect(sheet.casting).toEqual({ spell: '', actions: 0 })
  })

  it('spreads a long cast over as many turns as it needs', () => {
    const sheet = hero()
    castSpell(sheet, 'Ritual', 5, 1)
    expect(sheet.casting.actions).toBe(2)
    endTurn(sheet, 1)
    startTurn(sheet, 1)
    expect(actionsLeft(sheet)).toBe(1)
    expect(sheet.casting.actions).toBe(0)
  })

  it('will not start another spell over one still being cast', () => {
    const sheet = hero()
    castSpell(sheet, 'Fiery Embrace', 5, 1)
    expect(castingBlocks(sheet, 2)).toBe(true)
    expect(castingBlocks(sheet, 0)).toBe(false)
    expect(castSpell(sheet, 'Ignite', 2, 1)).toMatch(/Still casting Fiery Embrace/)
    expect(sheet.casting).toEqual({ spell: 'Fiery Embrace', actions: 2 })
    expect(stopCasting(sheet)).toBe('Stopped casting Fiery Embrace.')
    expect(castingBlocks(sheet, 2)).toBe(false)
  })

  it('casts at once when the turn has the actions', () => {
    const sheet = hero()
    expect(castSpell(sheet, 'Fiery Embrace', 2, 1)).toBe(' Concentrating.')
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
    newEncounter(sheet, 1)
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

  it('fixes older saves’ Unarmed Strike to 1d4 to hit for 1+STR, unless they have Swift Fists', () => {
    const fist = { name: 'Unarmed Strike', props: '', dmg: '1d4+2', melee: true }
    const plain = normalizeSheet('nimble', { rulesVersion: 2, attacks: [fist] })
    expect(plain.attacks[0]).toMatchObject({ dmg: '1d4', flat: 3 })
    const swift = normalizeSheet('nimble', {
      rulesVersion: 2,
      attacks: [fist],
      abilities: [{ name: 'Swift Fists', src: 'Zephyr', desc: '' }],
    })
    expect(swift.attacks[0]).toEqual(fist)
  })

  it('adds permanent ability armor to older saves once', () => {
    const save = {
      rulesVersion: 3,
      ac: 12,
      stats: { STR: 1, DEX: 3, INT: 2, WIL: 0 },
      abilities: [
        { name: 'Misdirection', src: 'Cheat', desc: 'Gain INT armor. Whenever you Defend…' },
        { name: 'Scurry', src: 'Ancestry', desc: 'Gain +2 armor if you moved on your last turn.' },
      ],
    }
    const sheet = normalizeSheet('nimble', save)
    expect(sheet.ac).toBe(14)
    expect(normalizeSheet('nimble', sheet).ac).toBe(14)
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

  it('gives older Zephyr saves the Swift Feet Initiative and doubled Armor', () => {
    const old = {
      classSlug: 'zephyr',
      rulesVersion: 1,
      level: '13',
      initMod: 4,
      ac: 12,
      choices: {},
      levelHistory: [
        { level: 13, before: { classSlug: 'zephyr', choices: {}, initMod: 4, ac: 12 } },
        { level: 2, before: { classSlug: 'zephyr', choices: {}, initMod: 3, ac: 5 } },
      ],
    }
    const sheet = normalizeSheet('nimble', old)
    expect(sheet).toMatchObject({ initMod: 17, ac: 24 })
    // Level 12 (not doubled yet) and level 1 (no Swift Feet yet).
    expect(sheet.levelHistory?.map((e) => [e.before.initMod, e.before.ac])).toEqual([
      [16, 12],
      [3, 5],
    ])
    expect(normalizeSheet('nimble', JSON.parse(JSON.stringify(sheet)))).toMatchObject({
      initMod: 17,
      ac: 24,
    })
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
      'artificer',
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
  it('reads what a use costs from its text', () => {
    expect(counterCost('(1/encounter) Action: Grant all friendly Dying creatures 1 HP.')).toEqual({
      actions: 1,
    })
    expect(counterCost('(1/encounter) 2 actions: Expend your Judgment Dice.')).toEqual({
      actions: 2,
    })
    expect(counterCost('(1/encounter) Whenever you Defend, the attack misses.')).toEqual({
      actions: 1,
      reaction: 'Defend',
    })
    expect(
      counterCost('(1/encounter) Reaction (when an ally drops to 0 HP): set it to 3.'),
    ).toEqual({ actions: 1 })
    expect(counterCost('Action: Attack a target. It is Taunted by you.')).toEqual({
      actions: 1,
      attack: true,
    })
    expect(counterCost('(1/encounter) Free Reaction: Give all party members 1 action.')).toBe(
      undefined,
    )
    expect(counterCost('(1/encounter) Mark a target for free.')).toBe(undefined)
    expect(counterCost('(1/encounter) The first spell costs 1 action less.')).toBe(undefined)
    expect(counterCost('(1/turn) While Dying, suffer 1 Wound to gain 1 action.')).toBe(undefined)
  })

  it('names each option of an ability, with its own cost and text', () => {
    const sheet = withAbilities([
      [
        'Small Companion',
        'Keen Eyes: (1/encounter) Mark a target for free (L7: 2/encounter). Protect Me!: (1/encounter) Whenever you Defend, your companion distracts the attacker. Go for the Throat!: (1/encounter; L11: 1/round) Costs 1 TotH charge, action: your companion attacks.',
      ],
    ])
    const list = abilityCounters(sheet, 11)[0]!.counters
    expect(list.map((c) => [c.name, c.label, c.cost])).toEqual([
      ['Keen Eyes', 'per encounter', undefined],
      ['Protect Me!', 'per encounter', { actions: 1, reaction: 'Defend' }],
      ['Go for the Throat!', 'per encounter', { actions: 1 }],
      ['Go for the Throat!', 'per round', { actions: 1 }],
    ])
    expect(list[0]!.text).toBe('Mark a target for free.')
    expect(list[1]!.text).toBe('Whenever you Defend, your companion distracts the attacker.')
  })

  it('refills 1/round uses on a new round, not when your turn starts', () => {
    const sheet = withAbilities([['Weapon Mastery', 'Swap weapons 1/round for free.']])
    sheet.uses = { 'Weapon Mastery@turn': { used: 1 } }
    startTurn(sheet, 1)
    expect(sheet.uses['Weapon Mastery@turn']!.used).toBe(1)
    newRound(sheet, 1)
    expect(sheet.uses['Weapon Mastery@turn']!.used).toBe(0)
  })

  it('refills 1/turn uses when your turn ends, but not 1/round ones', () => {
    const sheet = withAbilities([
      ['Rampage', '(1/turn) After you land a hit, reuse the roll.'],
      ['Weapon Mastery', 'Swap weapons 1/round for free.'],
    ])
    sheet.uses = { 'Rampage@turn': { used: 1 }, 'Weapon Mastery@turn': { used: 1 } }
    endTurn(sheet, 1)
    expect(sheet.uses['Rampage@turn']!.used).toBe(0)
    expect(sheet.uses['Weapon Mastery@turn']!.used).toBe(1)
  })

  it('gives back a spent use of Coordinated Strike! on Initiative', () => {
    const sheet = withAbilities([
      [
        'Coordinated Strike!',
        '(1/round) Free action: you and an ally attack. You can do this INT times/Safe Rest.',
      ],
      ['Survey the Battlefield', 'Regain 1 use of Coordinated Strike when you roll Initiative.'],
    ])
    sheet.uses = { 'Coordinated Strike!@rest': { used: 2 } }
    newEncounter(sheet, 5, () => 0.5, 10)
    expect(sheet.uses['Coordinated Strike!@rest']!.used).toBe(1)
  })

  it('spends the actions a use costs, sharing one Defend', () => {
    const sheet = hero({ actionsSpent: 0 })
    expect(payCost(sheet, { actions: 1, reaction: 'Defend' })).toBe(' Defend: spent 1 action.')
    expect(sheet.reactionsUsed).toEqual(['Defend'])
    expect(payCost(sheet, { actions: 1, reaction: 'Defend' })).toBe('')
    expect(payCost(sheet, { actions: 2 })).toBe(' Spent 2 actions.')
    expect(actionsLeft(sheet)).toBe(0)
    expect(payCost(sheet, { actions: 1 })).toBe(null)
  })

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

  it('starts a limit at the level the text names when there is none before it', () => {
    const sheet = withAbilities([
      [
        'Small Companion',
        'Go for the Throat!: (1/encounter; L11: 2/encounter, L11: 1/round; L15: 3/encounter) Attack.',
      ],
    ])
    expect(counters(sheet, 10)).toEqual(['Small Companion@encounter 1'])
    expect(counters(sheet, 11)).toEqual(['Small Companion@encounter 2', 'Small Companion@turn 1'])
    expect(counters(sheet, 15)).toEqual(['Small Companion@encounter 3', 'Small Companion@turn 1'])
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
    startTurn(turn, 1)
    expect(used(turn)).toEqual([0, 1, 1, 3])
    const encounter = hero({ uses: spent(), actionsSpent: 2, reactionsUsed: ['Defend'] })
    newEncounter(encounter, 1, () => 0.99)
    expect(used(encounter)).toEqual([0, 0, 0, 3])
    expect(encounter).toMatchObject({ actionsSpent: 0, reactionsUsed: [] })
    const rest = hero({ uses: spent() })
    safeRest(rest, 1)
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
    const line = newEncounter(sheet, 1)
    expect(sheet.uses['Veilwalker’s Blessing@rest']?.used).toBe(0)
    expect(sheet.uses['Searing Light@rest']?.used).toBe(0) // nothing spent, nothing to give back
    expect(line).toContain('Veilwalker’s Blessing recharged')
  })

  it('gives a Spellblade INT mana on Initiative', () => {
    const sheet = hero({ classSlug: 'commander', subclassSlug: 'spellblade' })
    sheet.stats.INT = 3
    expect(encounterMana(sheet)).toBe(3)
    newEncounter(sheet, 1)
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

describe('class resource dice', () => {
  const ability = (name: string, desc = '') => ({ name, src: 'Class', desc })
  const hit = (dice: number[], crit = false) => ({ miss: false, crit, total: 10, bonus: 0, dice })
  const miss = { miss: true, crit: false, total: 0, bonus: 0, dice: [1] }
  const gauntlets = {
    name: 'Thunder Gauntlets',
    melee: true,
    props: 'Reach 4, + Mana Dice (push 1 space per die)',
  }

  function artificer(STR = 3) {
    return hero({
      classSlug: 'artificer',
      stats: { STR, DEX: 0, INT: 2, WIL: 0 },
      abilities: [ability('Mana Accumulator')],
    })
  }

  it('recharges Mana Dice at the end of the turn, on Initiative and after a Safe Rest', () => {
    const sheet = artificer()
    expect(sheetResource(sheet, 2)).toMatchObject({ kind: 'power', max: 3, die: 4 })
    sheet.resource.count = 1
    startTurn(sheet, 2)
    expect(sheet.resource.count).toBe(1)
    expect(endTurn(sheet, 2)).toBe(
      'End of turn: all 3 actions back, reactions ready. Mana Dice: 3d4 ready.',
    )
    expect(sheet.resource.count).toBe(3)
    expect(endTurn(sheet, 2)).toBe('End of turn: all 3 actions back, reactions ready.')
    sheet.resource.count = 0
    newEncounter(sheet, 2)
    expect(sheet.resource.count).toBe(3)
    sheet.resource.count = 1
    safeRest(sheet, 2)
    expect(sheet.resource.count).toBe(3)
    expect(sheetResource(sheet, 13)).toMatchObject({ max: 4, die: 8 })
  })

  it('overloads when any die rolls at or below the number of Mana Dice spent', () => {
    expect(isMishap([4, 3], 2)).toBe(false)
    expect(isMishap([4, 2], 2)).toBe(true)
    expect(isMishap([1], 0)).toBe(false)
    const sheet = artificer()
    sheet.resource.count = 3
    expect(spendPower(sheet, 2, 2, faces(4, 4, 2))).toMatch(
      /2 Mana Dice: 4, 2 = 6\. Mishap!.* 1 left/,
    )
    expect(sheet.resource.count).toBe(1)
    expect(spendPower(sheet, 2, 5, faces(4, 4))).toMatch(/1 Mana Die: 4 = 4\. 0 left/)
    expect(spendPower(sheet, 2, 1)).toBe('')
  })

  it('adds readied Mana Dice to a powered weapon and checks the weapon die for a mishap', () => {
    const sheet = artificer()
    sheet.resource.count = 3
    const plain = resourceOnAttack(
      sheet,
      2,
      { name: 'Dagger', melee: true, props: 'Reach 1' },
      hit([5]),
      2,
    )
    expect(plain).toEqual({ extra: 0, note: '' })
    const safe = resourceOnAttack(sheet, 2, gauntlets, hit([5]), 2, faces(4, 3, 4))
    expect(safe).toEqual({ extra: 7, note: ' 2 Mana Dice (3, 4) +7.' })
    expect(sheet.resource.count).toBe(1)
    const risky = resourceOnAttack(sheet, 2, gauntlets, hit([1, 6]), 2, faces(4, 4))
    expect(risky.extra).toBe(4)
    expect(risky.note).toMatch(/1 Mana Die \(4\) \+4\. Mishap!/)
    expect(sheet.resource.count).toBe(0)
  })

  it('gains Combat Dice on Initiative, with picks and loses them after combat', () => {
    const sheet = hero({
      classSlug: 'commander',
      stats: { STR: 2, DEX: 0, INT: 1, WIL: 0 },
      abilities: [
        ability('Fit for Any Battlefield'),
        ability('+1 max Combat Dice'),
        ability('+1 max Combat Dice'),
        ability(
          'Heavy Strike',
          'When you hit, push them and deal extra damage equal to a roll of your Combat Die.',
        ),
        ability(
          'Lunging Strike',
          'Gain +1 Reach on an attack and deal extra damage equal to 2× a roll of your Combat Die.',
        ),
        ability('Commanding Presence', 'Action: Shout a command up to 2 words long at an enemy.'),
      ],
    })
    const r = sheetResource(sheet, 4)
    expect(r).toMatchObject({ max: 4, refill: 'initiative' })
    expect(r?.moves.map((m) => m.name)).toEqual([
      'Heavy Strike',
      'Lunging Strike',
      'Commanding Presence',
    ])
    startTurn(sheet, 4)
    expect(sheet.resource.count).toBe(0)
    newEncounter(sheet, 4)
    expect(sheet.resource.count).toBe(4)
    expect(spendResourceMove(sheet, 4, 'Heavy Strike', faces(6, 5))).toBe(
      'Heavy Strike: Combat Die rolled 5 (d6). 3 left.',
    )
    expect(spendResourceMove(sheet, 4, 'Lunging Strike', faces(6, 4))).toBe(
      'Lunging Strike: Combat Die rolled 4 × 2 = 8 (d6). 2 left.',
    )
    const before = sheet.actionsSpent
    expect(spendResourceMove(sheet, 4, 'Commanding Presence')).toBe(
      'Commanding Presence: spent 1 Combat Die. 1 left. Spent 1 action.',
    )
    expect(sheet.actionsSpent).toBe(before + 1)
    safeRest(sheet, 4)
    expect(sheet.resource.count).toBe(0)
  })

  it('holds rolled Judgment Dice for the next melee attack, spent hit or miss', () => {
    const sheet = hero({
      classSlug: 'oathsworn',
      abilities: [ability('Radiant Judgment', 'Whenever an enemy attacks you…')],
    })
    expect(rollJudgment(sheet, 1, faces(6, 4, 5))).toMatch(/2d6 → 4, 5 = 9/)
    expect(rollJudgment(sheet, 1)).toBe('')
    const ranged = { name: 'Dagger', melee: false, props: 'Range 12' }
    expect(resourceOnAttack(sheet, 1, ranged, hit([3]), 0).extra).toBe(0)
    expect(
      resourceOnAttack(sheet, 1, { name: 'Dagger', melee: true, props: '' }, hit([3]), 0),
    ).toEqual({
      extra: 9,
      note: ' Judgment Dice +9 radiant.',
    })
    expect(sheet.resource.rolls).toEqual([])
    rollJudgment(sheet, 1, faces(6, 2, 2))
    expect(
      resourceOnAttack(sheet, 1, { name: 'Dagger', melee: true, props: '' }, miss, 0).extra,
    ).toBe(0)
    expect(sheet.resource.rolls).toEqual([])
    rollJudgment(sheet, 1, faces(6, 2, 2))
    expect(expendJudgment(sheet)).toBe('Judgment Dice expended: 4.')
    rollJudgment(sheet, 1, faces(6, 2, 2))
    newEncounter(sheet, 1)
    expect(sheet.resource.rolls).toEqual([])
  })

  it('rolls more Judgment Dice and keeps the best with the abilities that say so', () => {
    const sheet = hero({
      classSlug: 'oathsworn',
      abilities: [
        ability(
          'Radiant Judgment',
          'Dice.\nLevel 14: Whenever you roll Judgment Dice, roll 1 more.',
        ),
        ability('Aura of Zeal', 'Whenever you roll Judgment Dice, roll 1 more. Gain an aura.'),
        ability('Reliable Justice', 'Whenever you roll Judgment Dice, roll with advantage.'),
      ],
    })
    expect(sheetResource(sheet, 14)).toMatchObject({ roll: 4, advantage: true, die: 20 })
    rollJudgment(sheet, 14, faces(20, 1, 9, 9, 9, 9))
    expect(sheet.resource.rolls).toEqual([9, 9, 9, 9])
  })

  it('adds Sneak Attack to the first crit each turn', () => {
    const sheet = hero({ classSlug: 'cheat', abilities: [ability('Sneak Attack')] })
    const weapon = { name: 'Dagger', melee: true, props: '' }
    expect(resourceOnAttack(sheet, 1, weapon, hit([4]), 0).extra).toBe(0)
    expect(resourceOnAttack(sheet, 1, weapon, hit([6], true), 0, faces(6, 5))).toEqual({
      extra: 5,
      note: ' Sneak Attack +5 (5).',
    })
    expect(resourceOnAttack(sheet, 1, weapon, hit([6], true), 0).extra).toBe(0)
    startTurn(sheet, 1)
    expect(sheet.resource.count).toBe(0)
    expect(sheetResource(sheet, 7)).toMatchObject({ roll: 2, die: 8 })
    expect(sheetResource(sheet, 17)).toMatchObject({ roll: 3, die: 20 })
  })
})

describe('resources on Initiative and each turn', () => {
  const ability = (name: string, desc = '') => ({ name, src: 'Class', desc })
  const d20 = () => 0.99

  it('fills Zephyr Bursts of Speed to DEX on Initiative', () => {
    const sheet = hero({
      classSlug: 'zephyr',
      stats: { STR: 0, DEX: 3, INT: 0, WIL: 0 },
      abilities: [ability('Burst of Speed')],
    })
    newEncounter(sheet, 3, d20)
    expect(sheet.resource.count).toBe(3)
  })

  it('loses Thrill of the Hunt charges when combat ends; Apex Predator and Wild Endurance add them', () => {
    const sheet = hero({ classSlug: 'hunter', abilities: [ability('Thrill of the Hunt')] })
    sheet.resource.count = 3
    newEncounter(sheet, 3, d20)
    expect(sheet.resource.count).toBe(0)
    sheet.abilities.push(ability('Apex Predator'), ability('Wild Endurance'))
    newEncounter(sheet, 18, d20)
    expect(sheet.resource.count).toBe(1)
    expect(startTurn(sheet, 18)).toMatch(/\+1 Thrill of the Hunt charge/)
    expect(sheet.resource.count).toBe(2)
  })

  it('gives back spent uses that the text regains on Initiative, however it words it', () => {
    const sheet = hero({
      classSlug: 'songweaver',
      abilities: [
        ability('Songweaver’s Inspiration', '(2×WIL times/Safe Rest) Inspire an ally.'),
        ability(
          'Quick Wit',
          'When you roll Initiative, you may regain 2 spent uses of your Songweaver’s Inspiration (these expire at the end of combat if left unused).',
        ),
      ],
      uses: { 'Songweaver’s Inspiration@rest': { used: 3 } },
    })
    newEncounter(sheet, 5, d20)
    expect(sheet.uses['Songweaver’s Inspiration@rest']?.used).toBe(1)
    const commander = hero({
      abilities: [
        ability('Coordinated Strike!', 'You can do this INT times/Safe Rest.'),
        ability(
          'Master Commander',
          'When you roll Initiative, regain 1 spent use of Coordinated Strike (it is lost if not spent during that encounter).',
        ),
      ],
    })
    expect(initiativeRecharges(commander)).toEqual([
      { name: 'Coordinated Strike', count: 1, expires: true },
    ])
  })

  it('rolls Elemental Surge as temporary mana on Initiative', () => {
    const sheet = hero({
      stats: { STR: 0, DEX: 0, INT: 0, WIL: 3 },
      abilities: [
        ability(
          'Elemental Surge',
          'When you roll Initiative, regain WIL mana.\nLevel 10: Your Elemental Surge now regains WIL+1d4 mana.',
        ),
      ],
      mana: { current: 0, max: 10, temp: 9 },
    })
    const rolls: [number, number][] = [
      [4, 2],
      [20, 20],
    ]
    let i = 0
    newEncounter(sheet, 10, () => {
      const [sides, value] = rolls[i++]!
      return (value - 0.5) / sides
    })
    expect(sheet.mana.temp).toBe(5)
  })
})

describe('class wiring', () => {
  const ability = (name: string, desc: string, src = 'Class') => ({ name, src, desc })

  it('reads Action/Reaction as a 1-action cost', () => {
    expect(
      counterCost('Action/Reaction (on an ally’s turn): Command 1 ally to move for free.'),
    ).toEqual({ actions: 1 })
  })

  it('turns Zephyr maneuvers into moves limited to 1 per turn', () => {
    const zephyr = NIMBLE_CLASSES.find((c) => c.slug === 'zephyr')!
    const burst = Object.values(zephyr.levels)
      .flatMap((l) => l?.abilities ?? [])
      .find((a) => a.name === 'Burst of Speed')!
    const sheet = hero({ classSlug: 'zephyr', abilities: [ability(burst.name, burst.desc)] })
    sheet.resource.count = 3
    const moves = sheetResource(sheet, 2)!.moves
    expect(moves.map((m) => m.name)).toEqual([
      'Slipstream',
      'Whirling Defense',
      'Swiftstrike',
      'Windstep',
    ])
    expect(spendResourceMove(sheet, 2, 'Slipstream')).toMatch(/spent 1/)
    expect(sheet.reactionsUsed).toContain('Defend')
    expect(sheet.resource.count).toBe(2)
    expect(spendResourceMove(sheet, 2, 'Windstep')).toMatch(/already used a maneuver/)
    expect(sheet.resource.count).toBe(2)
  })

  it('counts abilities that spend a class charge as its moves', () => {
    const sheet = hero({
      classSlug: 'hunter',
      abilities: [
        ability('Thrill of the Hunt', 'Gain a charge.'),
        ability(
          'Final Takedown',
          'Action: Spend 1 Thrill of the Hunt charge to make a melee attack.',
        ),
      ],
    })
    expect(sheetResource(sheet, 7)!.moves.map((m) => m.name)).toContain('Final Takedown')
  })

  it('links upgrades to abilities whose name ends in punctuation, and plurals', () => {
    const sheet = hero({
      abilities: [
        ability('Coordinated Strike!', '(1/round) Free action: attack.'),
        ability('Juggernaut', 'When you use Coordinated Strike, you deal extra damage.'),
        ability(
          'Master Commander',
          'Attacks made from your Coordinated Strikes ignore disadvantage.',
        ),
      ],
    })
    expect(abilityModifiers(sheet, 'Coordinated Strike!').map((m) => m.name)).toEqual([
      'Juggernaut',
      'Master Commander',
    ])
  })

  it('reads mana costs and what an ability does to the hero', () => {
    expect(manaCost('(1/encounter) Action: Spend 3 mana to shift.')).toBe(3)
    expect(manaCost('Spend 1 or more mana')).toBe(0)
    const sheet = hero({ woundsMax: 6 })
    expect(
      selfGains(sheet, 5, '(1/turn) While Dying, you may suffer 1 Wound to gain 1 action.'),
    ).toMatch(/Took 1 Wound\. Gained 1 action/)
    expect(sheet.wounds).toBe(1)
    expect(actionsLeft(sheet)).toBe(turnActions(sheet) + 1)
    selfGains(sheet, 5, 'Attacks you make this round don’t miss, and you gain LVL temp HP.')
    expect(sheet.tempHp).toBe(5)
  })

  it('spends Spellshaper mana once per turn', () => {
    expect(spellshapeCost('(1 or more mana) +4 range.')).toMatchObject({ min: 1, more: true })
    expect(spellshapeCost('(2×mana, min. 1 mana) Copy it.')).toMatchObject({ min: 1, more: true })
    expect(
      spellshapeCost('(–2 mana) Spend 1 additional action to reduce the mana cost by 2.'),
    ).toMatchObject({
      min: 0,
      refund: 2,
      actions: 1,
    })
    const sheet = hero({
      mana: { current: 6, max: 10, temp: 0 },
      abilities: [
        ability('Spellshaper', 'Enhance your spells by spending additional mana (1/turn).'),
        ability(
          'Dimensional Compression',
          '(1 or more mana) +4 range to a spell for each additional mana spent.',
        ),
        ability('Stretch Time', '(2 mana) Reduce the action cost of a spell by 1 (min 1).'),
      ],
    })
    expect(spellshape(sheet, 5, 'Dimensional Compression', 3)).toMatch(/spent 3 mana/)
    expect(sheet.mana.current).toBe(3)
    expect(spellshape(sheet, 5, 'Stretch Time')).toMatch(/already used Spellshaper/)
    expect(sheet.mana.current).toBe(3)
  })

  it('counts permanent armor from abilities, not conditional armor', () => {
    const sheet = hero({
      stats: { STR: 1, DEX: 2, INT: 3, WIL: 2 },
      abilities: [
        ability('Misdirection', 'Gain INT armor. Whenever you Defend, you may halve the damage.'),
        ability('Unparalleled Survivalist', 'Gain +WIL armor. When you attack…'),
        ability('Scurry', 'Gain +2 armor if you moved on your last turn.'),
      ],
    })
    expect(abilityArmor(sheet)).toBe(5)
  })

  it('adds damage bonuses from abilities to attacks', () => {
    const sheet = hero({
      stats: { STR: 3, DEX: 2, INT: 0, WIL: 2 },
      abilities: [
        ability('Keen Eye, Steady Hand', 'Add WIL to your ranged weapon damage.'),
        ability(
          'Unending Judgment',
          'While you have no Judgment Dice, gain +5 damage to melee attacks.',
        ),
        ability(
          'Kinetic Barrage',
          'Whenever you miss an attack, gain a cumulative +STR bonus to all damage you do for the rest of this encounter.',
        ),
      ],
    })
    expect(attackBonus(sheet, 5, { melee: false }, 0).flat).toBe(2)
    expect(attackBonus(sheet, 5, { melee: true }, 0).flat).toBe(5)
    expect(attackBonus(sheet, 5, { melee: true }, 4).flat).toBe(0)
    noteMiss(sheet)
    noteMiss(sheet)
    expect(attackBonus(sheet, 5, { melee: true }, 4)).toEqual({
      flat: 6,
      notes: ['Kinetic Barrage +6'],
    })
  })

  it('caps Zealot mana at the highest spell tier and the mana left', () => {
    const sheet = hero({
      mana: { current: 2, max: 8, temp: 0 },
      abilities: [
        ability(
          'Zealot',
          'Whenever you attack with a melee weapon, you may spend mana (up to your highest unlocked spell tier) to choose one for each mana spent.',
        ),
      ],
    })
    sheet.spells.tier = 3
    expect(zealotMax(sheet)).toBe(2)
  })

  it('steals actions from the next turn, then waits a turn', () => {
    const sheet = hero({
      stats: { STR: 0, DEX: 2, INT: 2, WIL: 0 },
      abilities: [
        ability(
          '“Creative” Accounting',
          'Steal up to INT actions from your next turn (gain up to INT actions now). You cannot use this 2 turns in a row.',
        ),
      ],
    })
    expect(stealActions(sheet)).toMatch(/Gained 2 actions/)
    expect(actionsLeft(sheet)).toBe(5)
    expect(stealActions(sheet)).toMatch(/already stole/)
    expect(endTurn(sheet, 5)).toMatch(/1 of 3 actions back/)
    expect(stealActions(sheet)).toMatch(/2 turns in a row/)
    endTurn(sheet, 5)
    expect(stealActions(sheet)).toMatch(/Gained 2 actions/)
  })

  it('reacts to Wounds: Kinetic Momentum, Unyielding Resolve, Exploding Soul', () => {
    const sheet = hero({
      classSlug: 'zephyr',
      woundsMax: 6,
      inEncounter: true,
      stats: { STR: 2, DEX: 3, INT: 0, WIL: 0 },
      abilities: [
        ability('Burst of Speed', 'When you roll Initiative, gain DEX Bursts of Speed.'),
        ability('Kinetic Momentum', 'Whenever you gain a Wound, gain a Burst of Speed.'),
        ability(
          'Unyielding Resolve',
          '(1/encounter) Ignore the first Wound you would suffer each encounter (when-Wounded abilities, such as Kinetic Momentum, still trigger).',
        ),
      ],
    })
    sheet.hp = 0
    sheet.dying = true
    expect(takeDamage(sheet, 1, 5)).toMatch(/1 Wound ignored.*Kinetic Momentum: \+2/)
    expect(sheet.wounds).toBe(1)
    expect(sheet.resource.count).toBe(2)
    sheet.abilities.push(
      ability(
        'Exploding Soul',
        'Whenever you gain a Wound, deal STR+Wounds damage to any creatures.',
      ),
    )
    expect(woundCharges(sheet, 1, 5)).toMatch(/Exploding Soul: deal 3 damage/)
  })

  it('applies crits taken and Glorious Reprieve', () => {
    const sheet = hero({
      woundsMax: 6,
      abilities: [
        ability(
          'Glorious Reprieve',
          'You and allies in your aura cannot drop below 1 HP. Whenever this triggers, they gain 1 Wound instead.',
        ),
      ],
    })
    sheet.hp = 4
    expect(takeDamage(sheet, 10, 5)).toMatch(/Glorious Reprieve/)
    expect(sheet).toMatchObject({ hp: 1, wounds: 1, dying: false })
    const dying = hero({ woundsMax: 6 })
    dying.hp = 0
    dying.dying = true
    expect(takeDamage(dying, 3, 5, true)).toMatch(/\+3 Wounds/)
  })

  it('takes back unspent Initiative uses when combat ends', () => {
    const sheet = hero({
      classSlug: 'commander',
      abilities: [
        ability(
          'Coordinated Strike!',
          '(1/round) Free action. You can do this INT times/Safe Rest.',
        ),
        ability(
          'Master Commander',
          'When you roll Initiative, regain 1 spent use of Coordinated Strike (it is lost if not spent during that encounter).',
        ),
      ],
    })
    sheet.uses['Coordinated Strike!@rest'] = { used: 2 }
    newEncounter(sheet, 5, faces(20, 10))
    expect(sheet.uses['Coordinated Strike!@rest']?.used).toBe(1)
    expect(endEncounter(sheet, 5)).toMatch(/Unspent Initiative uses lost: Coordinated Strike/)
    expect(sheet.uses['Coordinated Strike!@rest']?.used).toBe(2)
  })

  it('reacts to attack results: Titan’s Fury, Steal Tempo, quarry charges', () => {
    const berserker = hero({
      classSlug: 'berserker',
      inEncounter: true,
      stats: { STR: 3, DEX: 2, INT: 0, WIL: 0 },
      abilities: [
        ability('Rage', '(1/turn) Action: Roll a Fury Die.'),
        ability('Titan’s Fury', 'After you miss an attack or are crit by an enemy, Rage for free.'),
      ],
    })
    const out = { melee: true, miss: true, crit: false, quarry: false }
    expect(afterAttack(berserker, 3, out)).toMatch(/Titan’s Fury: Rage/)
    expect(berserker.resource.active).toBe(true)

    const cheat = hero({
      abilities: [
        ability(
          'Steal Tempo',
          'When you land a critical hit for the second time on a turn, your target loses 1 action and you gain 1 action.',
        ),
      ],
    })
    const crit = { melee: true, miss: false, crit: true, quarry: false }
    expect(afterAttack(cheat, 5, crit)).toBe('')
    expect(afterAttack(cheat, 5, crit)).toMatch(/Gained 1 action/)

    const hunter = hero({
      classSlug: 'hunter',
      inEncounter: true,
      abilities: [
        ability(
          'Thrill of the Hunt',
          'Gain a charge to use your Thrill of the Hunt abilities during an encounter whenever: your quarry dies, or you hit your quarry in melee or crit your quarry at range.',
        ),
      ],
    })
    afterAttack(hunter, 5, { melee: false, miss: false, crit: false, quarry: true })
    expect(hunter.resource.count).toBe(0)
    afterAttack(hunter, 5, { melee: true, miss: false, crit: false, quarry: true })
    expect(hunter.resource.count).toBe(1)
  })

  it('counts extra max Combat Dice from other abilities', () => {
    const sheet = hero({
      classSlug: 'commander',
      stats: { STR: 3, DEX: 0, INT: 2, WIL: 0 },
      abilities: [
        ability('Fit for Any Battlefield', 'When you roll Initiative, gain STR Combat Dice.'),
        ability(
          'Survey the Battlefield',
          'When you roll Initiative, regain 1 use of Coordinated Strike. +1 max Combat Dice.',
        ),
      ],
    })
    expect(sheetResource(sheet, 11)?.max).toBe(4)
  })

  it('sets a Judgment Die to max when attacked with Maximum Judgment', () => {
    const sheet = hero({
      classSlug: 'oathsworn',
      abilities: [
        ability(
          'Radiant Judgment',
          'Whenever an enemy attacks you, roll your Judgment Dice (2d6).',
        ),
        ability('Maximum Judgment', 'Whenever you are attacked, set a Judgment Die to its max.'),
      ],
    })
    expect(rollJudgment(sheet, 1, faces(6, 2, 3))).toMatch(/Maximum Judgment: a die set to 6/)
    expect(sheet.resource.rolls).toEqual([6, 3])
    expect(rollJudgment(sheet, 1)).toMatch(/a die set to 6 \(6, 6/)
  })

  it('reminds of Initiative choices and lifts the Cheat to 10', () => {
    const sheet = hero({
      initMod: 0,
      abilities: [
        ability(
          'Cheat',
          '(1/round) Move or Hide. If you roll less than 10 on Initiative, you may change it to 10 instead.',
        ),
        ability('Firebrand', 'When you roll Initiative you may cast Enchant Weapon for free.'),
      ],
    })
    const message = newEncounter(sheet, 5, faces(20, 3))
    expect(message).toMatch(/Initiative 10/)
    expect(message).toMatch(/Cheat: 3 raised to 10/)
    expect(message).toMatch(/You may: Firebrand: cast Enchant Weapon for free/)
  })

  it('turns what an ability grants into a trigger button', () => {
    const sheet = hero({ stats: { STR: 0, DEX: 1, INT: 4, WIL: 0 } })
    const frost = abilityTrigger(
      sheet,
      7,
      'Your Shadow Blast and minions can deal cold or necrotic damage, and whenever they would crit, you gain INT+LVL temp HP.',
    )
    expect(frost?.label).toBe('Gain 11 temp HP')
    frost?.fire()
    expect(sheet.tempHp).toBe(11)
    expect(abilityTrigger(sheet, 7, '(1/encounter) When crit, gain 1 action.')?.label).toBe(
      'Gain 1 action',
    )
    expect(
      abilityTrigger(sheet, 7, 'Your allies within 12 spaces who can hear you gain WIL temp HP.'),
    ).toBeNull()
  })
})
