import { describe, expect, it } from 'vitest'
import { LEGENDARY_TABLE, MONSTER_TABLE, minionDie } from '../data/nimble/monsters'
import {
  actionAverage,
  budgetLines,
  checkNimbleDraft,
  defaultLevel,
  levelOptions,
  nimbleBudget,
  type NimbleBudget,
} from '../utils/npcBudget'
import type { StatBlock } from '../types'

describe('GM guide tables', () => {
  it('match printed rows of the Monster Builder (p. 29)', () => {
    expect(MONSTER_TABLE).toHaveLength(23)
    expect(MONSTER_TABLE.find((r) => r.level === '5')).toMatchObject({
      hpNone: 58,
      hpMedium: 46,
      hpHeavy: 35,
      damagePerRound: 19,
      saveDc: 12,
    })
    expect(MONSTER_TABLE.at(-1)).toMatchObject({ level: '20', hpNone: 313, damagePerRound: 54 })
  })

  it('keeps each row’s sample dice close to its damage per round', () => {
    for (const r of MONSTER_TABLE.filter((x) => !x.level.includes('/'))) {
      const big = actionAverage('', r.sampleDice.split(' or ')[0] ?? '')!
      expect(Math.abs(big - r.damagePerRound)).toBeLessThanOrEqual(2)
    }
  })

  it('match printed rows of the Legendary Monster Builder (p. 43)', () => {
    expect(LEGENDARY_TABLE[0]).toEqual({
      partyLevel: 1,
      hpMedium: 50,
      hpHeavy: 35,
      hpLastStand: 10,
      saveDc: 10,
      attackSmall: 8,
      attackBig: 16,
    })
    expect(LEGENDARY_TABLE[2]).toMatchObject({ hpMedium: 100, hpHeavy: 75, saveDc: 11 })
    expect(LEGENDARY_TABLE[19]).toMatchObject({ hpMedium: 525, hpHeavy: 415, attackBig: 54 })
  })

  it('sizes minion dice by party level (p. 26)', () => {
    expect([1, 4, 8, 12, 15, 20].map(minionDie)).toEqual(['d4', 'd6', 'd8', 'd10', 'd12', 'd20'])
  })
})

describe('level picker', () => {
  it('uses party levels for minions and bosses, monster levels otherwise', () => {
    expect(levelOptions('nimble', 'Boss')[0]).toBe('1')
    expect(levelOptions('nimble', 'Standard')[0]).toBe('1/4')
    expect(levelOptions('dnd5e', 'Standard')).toContain('1/8')
    expect(levelOptions('pf2e', 'Standard')[0]).toBe('-1')
  })

  it('defaults to the party level', () => {
    expect(defaultLevel('nimble', 'Standard', 3.4)).toBe('3')
    expect(defaultLevel('nimble', 'Boss', 0)).toBe('1')
    expect(defaultLevel('nimble', 'Standard', 30)).toBe('20')
  })
})

describe('nimbleBudget', () => {
  it('reads the Monster Builder row for a standard foe', () => {
    const b = nimbleBudget('Standard', '3')
    expect(b?.threat === 'Standard' && b.row.hpNone).toBe(41)
  })

  it('builds an elite from the row two levels up', () => {
    const b = nimbleBudget('Elite', '3')
    expect(b?.threat === 'Elite' && b.row.level).toBe('5')
    expect(nimbleBudget('Elite', '20')?.threat === 'Elite').toBe(true)
  })

  it('reads the legendary row by party level', () => {
    const b = nimbleBudget('Boss', '2')
    expect(b?.threat === 'Boss' && b.row.hpMedium).toBe(75)
  })

  it('rejects levels the table lacks', () => {
    expect(nimbleBudget('Standard', '21')).toBeNull()
    expect(nimbleBudget('Boss', '1/2')).toBeNull()
  })

  it('writes concrete numbers into the prompt', () => {
    const text = budgetLines(nimbleBudget('Standard', '5')!).join('\n')
    expect(text).toContain('HP 58 unarmored, 46 in Medium armor, or 35 in Heavy armor')
    expect(text).toContain('About 19 damage per round')
    expect(budgetLines(nimbleBudget('Minion', '6')!).join('\n')).toContain('single d8')
  })
})

describe('actionAverage', () => {
  it('averages dice and multiplies repeated attacks', () => {
    expect(actionAverage('Stab', '1d4+2 (or Sling, Range 8).')).toBe(4.5)
    expect(actionAverage('Throw Scorpion (2×)', '(Range 8) 1d4+2.')).toBe(9)
    expect(actionAverage('Bite', '2d6 - 1. On hit: Grappled.')).toBe(6)
    expect(actionAverage('Roar', 'WIL save or Frightened.')).toBeNull()
  })
})

describe('checkNimbleDraft', () => {
  const block = (armor: string, hp: number, attack: string): StatBlock => ({
    top: [
      ['Armor', armor],
      ['HP', String(hp)],
    ],
    hp,
    sections: [{ title: 'Actions', items: [{ n: 'Claw', t: attack }] }],
  })
  const level5 = nimbleBudget('Standard', '5') as NimbleBudget

  it('passes a draft on budget', () => {
    expect(checkNimbleDraft(block('Medium', 46, '2d8+10'), level5)).toEqual([])
  })

  it('uses the HP column for the armor the draft chose', () => {
    const notes = checkNimbleDraft(block('Heavy', 58, '2d8+10'), level5)
    expect(notes).toHaveLength(1)
    expect(notes[0]).toContain('35')
  })

  it('flags damage well off the table', () => {
    const notes = checkNimbleDraft(block('None', 58, '4d10+10'), level5)
    expect(notes[0]).toContain('averages 32')
  })

  it('flags minions with HP and unarmored legendary monsters', () => {
    expect(checkNimbleDraft(block('None', 5, '1d4'), nimbleBudget('Minion', '1')!)).toHaveLength(1)
    const boss = checkNimbleDraft(block('None', 75, '1d8+2'), nimbleBudget('Boss', '2')!)
    expect(boss[0]).toContain('at least Medium armor')
  })

  it('holds minion attacks to one die with no modifier', () => {
    const minion = nimbleBudget('Minion', '1')!
    expect(checkNimbleDraft(block('None', 0, '1d4.'), minion)).toEqual([])
    const big = checkNimbleDraft(block('None', 0, '10d20+100'), minion)
    expect(big).toHaveLength(1)
    expect(big[0]).toContain('10d20+100')
    expect(checkNimbleDraft(block('None', 0, '1d6'), minion)[0]).toContain('single 1d4')
  })

  it('leaves Reactions out of the damage and minion checks', () => {
    const withReaction = (b: StatBlock): StatBlock => ({
      ...b,
      sections: [
        ...(b.sections ?? []),
        { title: 'Reactions', items: [{ n: 'Riposte', t: '6d10+20' }] },
      ],
    })
    expect(checkNimbleDraft(withReaction(block('Medium', 46, '2d8+10')), level5)).toEqual([])
    const minion = nimbleBudget('Minion', '1')!
    expect(checkNimbleDraft(withReaction(block('None', 0, '1d4')), minion)).toEqual([])
  })

  it('says so when no attack dice can be read', () => {
    expect(checkNimbleDraft(block('Medium', 46, 'WIL save or Frightened.'), level5)).toEqual([
      'No attack dice found to check against the guide.',
    ])
    expect(checkNimbleDraft(block('None', 0, 'Shoves you.'), nimbleBudget('Minion', '1')!)).toEqual(
      ['No attack dice found to check against the minion rules.'],
    )
  })
})
