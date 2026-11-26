import { describe, expect, it } from 'vitest'
import type { Pf2eSheet } from '../types/sheets'
import { rollCheckTwice, typedCheck } from '../utils/dice'
import { checkBreakdown, heroRerollProblem, rollPf2eCheck, skillUses } from '../utils/pf2ePlay'
import { defaultSheet } from '../utils/sheetDefaults'

function hero(over: Partial<Pf2eSheet> = {}): Pf2eSheet {
  return { ...defaultSheet('pf2e'), hp: 30, hpMax: 30, ...over }
}
/** An rng that gives these d20 faces in turn. */
const faces = (...d: number[]) => {
  let i = 0
  return () => ((d[i++ % d.length] ?? 1) - 1) / 20 + 0.0001
}

describe('checkBreakdown (Player Core pp. 11, 400)', () => {
  it('splits a skill into attribute, proficiency, items and what applies now', () => {
    const s = hero({ conditions: ['Frightened'], conditionValues: { Frightened: 1 } })
    s.attrs.DEX = 3
    const b = checkBreakdown(
      s,
      { value: 3 + 5 + 1, rank: 'E', attr: 'DEX' },
      { kind: 'skill', attr: 'DEX', skill: 'Acrobatics' },
      1,
    )
    expect(b.value).toBe(8)
    expect(b.lines).toEqual([
      'Dexterity +3',
      'Expert +5 (level 1 + 4)',
      'Item and other +1',
      'Frightened 1 −1 status',
    ])
  })

  it('says untrained adds nothing', () => {
    const s = hero()
    s.attrs.INT = 1
    expect(
      checkBreakdown(s, { value: 1, rank: 'U', attr: 'INT' }, { kind: 'skill', attr: 'INT' }, 3)
        .lines,
    ).toEqual(['Intelligence +1', 'Untrained +0'])
  })
})

describe('skillUses', () => {
  it('gives the book line, the skill actions and the page', () => {
    expect(skillUses('Athletics')).toContain('deeds of physical prowess')
    expect(skillUses('Athletics')).toContain('Trained: Disarm.')
    expect(skillUses('Athletics')).toContain('(Player Core p. 234)')
  })

  it('shares Lore’s for a named Lore, and notes initiative on Perception', () => {
    expect(skillUses('Scribing Lore')).toContain('narrow topic')
    expect(skillUses('Perception')).toContain('initiative')
    expect(skillUses('Basket Weaving')).toBe('')
  })
})

describe('fortune, misfortune and typed d20s (p. 400)', () => {
  it('keeps the higher or the lower of two d20s', () => {
    expect(rollCheckTwice(5, 'higher', faces(4, 15))).toMatchObject({ d20: 15, total: 20 })
    expect(rollCheckTwice(5, 'lower', faces(4, 15))).toMatchObject({ d20: 4, total: 9 })
  })

  it('takes a typed d20 as it is, with naturals', () => {
    expect(typedCheck(20, 3)).toEqual({ d20: 20, total: 23, natural: 20 })
    expect(typedCheck(25, 0).d20).toBe(20)
  })

  it('rolls a check with fortune against a DC and names both dice', () => {
    const r = rollPf2eCheck(hero(), 'Athletics', 5, {
      dc: 15,
      fortune: 'fortune',
      rng: faces(3, 12),
    })
    expect(r.d20).toBe(12)
    expect(r.degree).toBe('success')
    expect(r.line).toBe('Athletics: 17 (12 +5) (fortune: 3 and 12) vs DC 15: success.')
  })

  it('uses the d20 the player typed and marks a Hero Point reroll', () => {
    const r = rollPf2eCheck(hero(), 'Will', 4, { d20: 20, dc: 30, reroll: true })
    expect(r.line).toBe('Will (Hero Point reroll): 24 (20 +4, natural 20) vs DC 30: success.')
  })
})

describe('heroRerollProblem (p. 413)', () => {
  it('needs a Hero Point and no fortune effect already on the roll', () => {
    expect(heroRerollProblem(hero({ heroPoints: 0 }), 'normal')).toBe('No Hero Points left.')
    expect(heroRerollProblem(hero({ heroPoints: 1 }), 'fortune')).toContain('fortune')
    expect(heroRerollProblem(hero({ heroPoints: 1 }), 'misfortune')).toBe('')
  })
})
