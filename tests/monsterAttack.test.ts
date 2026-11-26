import { describe, expect, it } from 'vitest'
import type { StatBlock } from '~/types'
import { rollNimble } from '~/utils/dice'
import { monsterRollKind } from '~/utils/monsterAttack'

const seq = (...values: number[]) => {
  let i = 0
  // rollDie: 1 + floor(rng * sides); for a d6 value v, rng = (v - 1) / 6.
  return () => (values[i++]! - 1) / 6
}
const d6 = { count: 1, sides: 6, mod: 2 }

describe('monsterRollKind', () => {
  it('rolls actions as attacks', () => {
    expect(monsterRollKind('Actions', { n: 'Stab', t: '1d6+2 (or Shoot, Range 8).' })).toBe(
      'attack',
    )
    expect(monsterRollKind('Bloodied', { n: 'Rend', t: '2d8+8 damage.' })).toBe('attack')
  })

  it('rolls traits, saves, areas, heals and never-miss attacks as plain dice', () => {
    expect(monsterRollKind('Traits', { n: 'Burning Aura', t: '1d6 fire damage.' })).toBe('plain')
    expect(
      monsterRollKind('Actions', { n: 'Slam', t: 'DC 14 DEX save or take 1d12+20 damage.' }),
    ).toBe('plain')
    expect(monsterRollKind('Actions', { n: 'Traps', t: 'BEEES! 5d4 damage (doesn’t miss).' })).toBe(
      'plain',
    )
    expect(monsterRollKind('Actions', { n: 'Breath', t: '3d6 to creatures in a cone.' })).toBe(
      'plain',
    )
  })

  it('never crits for minions and flunkies', () => {
    expect(monsterRollKind('Actions', { n: 'Stab', t: '1d6 (follows minion rules).' })).toBe(
      'nocrit',
    )
    const minion: StatBlock = { top: [['HP', 'Minion']], sections: [] }
    expect(monsterRollKind('Actions', { n: 'Bite', t: '1d4.' }, minion)).toBe('nocrit')
    const flunky: StatBlock = {
      sections: [{ title: 'Traits', items: [{ n: 'Flunky', t: 'Can’t crit.' }] }],
    }
    expect(monsterRollKind('Actions', { n: 'Club', t: '1d6+1.' }, flunky)).toBe('nocrit')
  })
})

describe('rollNimble noCrit', () => {
  it('still misses on a 1', () => {
    expect(rollNimble(d6, null, seq(1), 0, { noCrit: true })).toMatchObject({
      miss: true,
      total: 0,
    })
  })

  it('takes a max as its value without exploding', () => {
    expect(rollNimble(d6, null, seq(6, 6), 0, { noCrit: true })).toMatchObject({
      miss: false,
      crit: false,
      total: 8,
    })
  })

  it('explodes a max for a normal monster attack', () => {
    expect(rollNimble(d6, null, seq(6, 3))).toMatchObject({ crit: true, total: 11 })
  })
})
