// The 5e (2024) play engine: D20 Tests, Speed and AC, damage, dying, Concentration, rests and
// the turn's action economy (utils/dnd5ePlay.ts, dnd5eConditions.ts, dnd5eEffects.ts).
import { describe, expect, it } from 'vitest'
import type { Dnd5eSheet } from '../types/sheets'
import { setExhaustion, toggleCondition } from '../utils/dnd5eConditions'
import { addEffect } from '../utils/dnd5eEffects'
import {
  acNow,
  attacksPerAction,
  beginEncounter,
  concentrationDc,
  concentrationSave,
  costWhy,
  d20Mode,
  deathSave,
  endEncounter,
  endTurn,
  heal,
  initiativeTest,
  isDead,
  isStable,
  longRest,
  newRound,
  payCost,
  rollD20,
  saveRow,
  setInitiative,
  shortRest,
  skillRow,
  speedNow,
  spendHitDie,
  spendUses,
  startConcentration,
  startTurn,
  takeDamage,
  usesLeft,
} from '../utils/dnd5ePlay'
import { defaultSheet } from '../utils/sheetDefaults'
import { build, levelTo } from './helpers/dnd5e'

const fixed = (...values: number[]) => {
  let i = 0
  return () => (values[i++ % values.length]! - 1) / 20 + 0.0001
}

function hand(patch: Partial<Dnd5eSheet> = {}): Dnd5eSheet {
  return { ...defaultSheet('dnd5e'), hp: 20, hpMax: 20, ...patch }
}

describe('D20 Tests', () => {
  it('cancels Advantage and Disadvantage to one d20', () => {
    expect(d20Mode({ adv: ['Rage'], dis: [] })).toBe('adv')
    expect(d20Mode({ adv: ['Rage', 'Help'], dis: ['Poisoned'] })).toBe('normal')
    expect(d20Mode({ adv: [], dis: [] }, 'dis')).toBe('dis')
  })

  it('keeps the higher d20 with Advantage and adds Bless', () => {
    const s = hand()
    addEffect(s, 'bless')
    const t = saveRow(s, 1, 'WIS').test
    t.adv.push('test')
    const r = rollD20(t, { d20: [4, 15] })
    expect(r.d20).toBe(15)
    expect(r.extra).toBeGreaterThanOrEqual(1)
    expect(r.extra).toBeLessThanOrEqual(4)
  })

  it('takes 2 per Exhaustion level off every D20 Test', () => {
    const s = hand({ abilities: { STR: 10, DEX: 14, CON: 10, INT: 10, WIS: 10, CHA: 10 } })
    setExhaustion(s, 2)
    expect(saveRow(s, 1, 'DEX').test.bonus).toBe(-2)
    expect(s.conditions).toContain('Exhaustion')
  })

  it('fails Strength and Dexterity saves while Paralyzed', () => {
    const s = hand({ conditions: ['Paralyzed'] })
    const r = rollD20(saveRow(s, 1, 'DEX').test)
    expect(r.failed).toBe(true)
    expect(r.line).toMatch(/fails/)
  })

  it('adds Expertise twice, Jack of All Trades half, and Reliable Talent makes a 10', () => {
    const s = hand({
      profBonus: 3,
      abilities: { STR: 10, DEX: 16, CON: 10, INT: 10, WIS: 10, CHA: 10 },
      proficiencies: {
        skills: ['Stealth'],
        expertise: ['Stealth'],
        tools: [],
        languages: [],
        weapons: [],
        armor: [],
      },
      features: [
        { name: 'Jack of All Trades', desc: '' },
        { name: 'Reliable Talent', desc: '' },
      ],
    })
    const stealth = skillRow(s, 5, 'Stealth')
    expect(stealth.prof).toBe(2)
    expect(stealth.test.bonus).toBe(3 + 6)
    expect(skillRow(s, 5, 'Arcana').test.bonus).toBe(1)
    expect(rollD20(stealth.test, { d20: [3] }).total).toBe(10 + 9)
  })

  it('gives Feral Instinct Advantage on Initiative, Incapacitated Disadvantage', () => {
    const s = hand({ initMod: 2, features: [{ name: 'Feral Instinct', desc: '' }] })
    expect(initiativeTest(s, 7).adv).toContain('Feral Instinct')
    toggleCondition(s, 'Stunned')
    expect(initiativeTest(s, 7).dis).toContain('Incapacitated')
  })

  it('gives Aura of Protection’s Charisma to saves, at least +1', () => {
    const s = hand({ features: [{ name: 'Aura of Protection', desc: '' }] })
    expect(saveRow(s, 6, 'WIS').test.bonus).toBe(1)
  })
})

describe('Speed and AC', () => {
  it('drops 5 ft per Exhaustion level and doubles with Haste', () => {
    const s = hand({ speed: '30 ft, climb 30 ft' })
    setExhaustion(s, 1)
    addEffect(s, 'haste')
    const v = speedNow(s)
    expect(v.value).toBe(55)
    expect(v.others).toBe('climb 30 ft')
  })

  it('is 0 while Grappled', () => {
    expect(speedNow(hand({ conditions: ['Grappled'] })).value).toBe(0)
  })

  it('adds Shield and takes Mage Armor’s base while unarmored', () => {
    const s = hand({ ac: 12, abilities: { STR: 10, DEX: 14, CON: 10, INT: 10, WIS: 10, CHA: 10 } })
    addEffect(s, 'mage-armor')
    expect(acNow(s, 1).value).toBe(15)
    addEffect(s, 'shield')
    expect(acNow(s, 1).value).toBe(20)
  })

  it('keeps Barkskin’s floor of 17', () => {
    const s = hand({ ac: 11 })
    addEffect(s, 'barkskin')
    expect(acNow(s, 1).value).toBe(17)
  })
})

describe('damage and dying', () => {
  it('halves resisted damage and ignores immune damage, then temp HP soak it', () => {
    const s = hand({
      tempHp: 2,
      defenses: { resistances: ['Fire'], immunities: ['Poison'], conditionImmunities: [] },
    })
    expect(takeDamage(s, { amount: 9, type: 'Fire' }).line).toBe(
      'Took 4 fire damage (resistance to Fire: halved): 18/20 HP.',
    )
    expect(takeDamage(s, { amount: 30, type: 'Poison' }).taken).toBe(0)
  })

  it('takes Rage’s resistance to Slashing and reductions first', () => {
    const s = hand()
    addEffect(s, 'rage')
    const r = takeDamage(s, { amount: 13, type: 'Slashing', reduce: [{ label: 'HAM', amount: 3 }] })
    expect(r.taken).toBe(5)
  })

  it('asks for a Concentration save at half the damage, 10 to 30', () => {
    expect(concentrationDc(7)).toBe(10)
    expect(concentrationDc(31)).toBe(15)
    expect(concentrationDc(90)).toBe(30)
    const s = hand({ hp: 40, hpMax: 40 })
    startConcentration(s, { slug: 'bless', name: 'Bless', level: 1 })
    expect(takeDamage(s, { amount: 24 }).concentrationDc).toBe(12)
  })

  it('drops Concentration and Rage at 0 HP', () => {
    const s = hand({ hp: 3 })
    addEffect(s, 'rage')
    startConcentration(s, { slug: 'bless', name: 'Bless', level: 1 })
    takeDamage(s, { amount: 5 })
    expect(s.conditions).toContain('Unconscious')
    expect(s.concentration).toBeUndefined()
    expect(s.effects).toEqual([])
  })

  it('holds at 1 HP with Relentless Endurance, once', () => {
    const s = hand({
      hp: 3,
      resources: [{ name: 'Relentless Endurance', from: 'Orc', max: 1, recharge: 'long' }],
    })
    expect(takeDamage(s, { amount: 5 }).line).toMatch(/Relentless Endurance/)
    expect(s.hp).toBe(1)
    takeDamage(s, { amount: 5 })
    expect(s.hp).toBe(0)
  })

  it('rolls death saves: a 20 wakes with 1 HP, a 1 is two failures, three successes Stable', () => {
    const s = hand({ hp: 0, conditions: ['Unconscious'] })
    expect(deathSave(s, 1, { d20: [1] })).toMatch(/two failures/)
    expect(s.deathSaves.failures).toBe(2)
    deathSave(s, 1, { d20: [20] })
    expect(s.hp).toBe(1)
    expect(s.conditions).not.toContain('Unconscious')
    const t = hand({ hp: 0 })
    for (let i = 0; i < 3; i++) deathSave(t, 1, { d20: [12] })
    expect(isStable(t)).toBe(true)
  })

  it('dies at Exhaustion 6', () => {
    const s = hand()
    setExhaustion(s, 6)
    expect(isDead(s)).toBe(true)
    expect(heal(s, 5)).toMatch(/no effect/)
  })

  it('keeps or loses Concentration on the save', () => {
    const s = hand({ abilities: { STR: 10, DEX: 10, CON: 14, INT: 10, WIS: 10, CHA: 10 } })
    startConcentration(s, { slug: 'bless', name: 'Bless', level: 1 })
    expect(concentrationSave(s, 1, 10, { d20: [8] })).toMatch(/keep Bless/)
    expect(concentrationSave(s, 1, 10, { d20: [2] })).toMatch(/Bless ends/)
    expect(s.concentration).toBeUndefined()
  })
})

describe('rests and uses', () => {
  it('spends Hit Point Dice for their roll + CON, at least 1', () => {
    const s = hand({
      hp: 5,
      hitDie: 10,
      abilities: { STR: 10, DEX: 10, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    })
    expect(spendHitDie(s, 3, { roll: 6 })).toMatch(/= 8/)
    expect(s.hp).toBe(13)
    expect(s.hitDiceUsed).toBe(1)
  })

  it('brings back Short Rest uses, a Long Rest use’s Short Rest part and pact slots', () => {
    const s = hand({
      resources: [
        { name: 'Action Surge', from: 'Fighter', max: 1, recharge: 'short' },
        { name: 'Second Wind', from: 'Fighter', max: 3, recharge: 'long', short: 1 },
      ],
      pactUsed: 2,
    })
    spendUses(s, 'Action Surge')
    spendUses(s, 'Second Wind', 3)
    shortRest(s)
    expect(usesLeft(s, 'Action Surge')).toBe(1)
    expect(usesLeft(s, 'Second Wind')).toBe(1)
    expect(s.pactUsed).toBe(0)
  })

  it('a Long Rest restores everything and lowers Exhaustion by 1', () => {
    const s = hand({ hp: 4, tempHp: 5, hitDiceUsed: 3, slotsUsed: [2, 1] })
    setExhaustion(s, 2)
    longRest(s, 5)
    expect(s).toMatchObject({ hp: 20, tempHp: 0, hitDiceUsed: 0, slotsUsed: [], exhaustion: 1 })
  })
})

describe('the turn', () => {
  it('runs New encounter → Initiative → Start turn → End turn → New round → End encounter', () => {
    const s = hand()
    beginEncounter(s)
    expect(s.awaitingInitiative).toBe(true)
    setInitiative(s, 14)
    expect(startTurn(s)).toMatch(/round 1/)
    expect(s.turn).toMatchObject({ active: true, actions: 1, bonus: true, reaction: true })
    endTurn(s)
    expect(s.turnDone).toBe(true)
    expect(newRound(s)).toBe('Round 2.')
    endEncounter(s)
    expect(s.inEncounter).toBe(false)
  })

  it('makes the Extra Attack inside one Attack action', () => {
    const { sheet } = build('fighter')
    levelTo(sheet, 1, 5)
    expect(attacksPerAction(sheet, 5)).toBe(2)
    beginEncounter(sheet)
    setInitiative(sheet, 10)
    startTurn(sheet)
    expect(payCost(sheet, 5, 'attack')).toBe('')
    expect(sheet.turn).toMatchObject({ actions: 0, attacks: 1 })
    expect(payCost(sheet, 5, 'attack')).toBe('')
    expect(costWhy(sheet, 'attack')).toBe('No attacks left')
  })

  it('waits for your turn in an encounter, except reactions', () => {
    const s = hand()
    expect(costWhy(s, 'action')).toBe('')
    beginEncounter(s)
    expect(costWhy(s, 'action')).toBe('Not your turn')
    expect(costWhy(s, 'reaction')).toBe('')
    payCost(s, 1, 'reaction')
    expect(costWhy(s, 'reaction')).toBe('Reaction used')
  })

  it('gives Haste’s extra action and ends Shield at the start of your turn', () => {
    const s = hand()
    beginEncounter(s)
    addEffect(s, 'haste')
    addEffect(s, 'shield')
    expect(startTurn(s)).toMatch(/Shield ended/)
    expect(s.turn?.actions).toBe(2)
  })

  it('rolls a fixed d20 through the injected rng', () => {
    expect(rollD20(saveRow(hand(), 1, 'STR').test, { rng: fixed(11) }).d20).toBe(11)
  })
})
