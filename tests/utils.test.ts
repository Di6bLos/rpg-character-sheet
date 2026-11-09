import { describe, expect, it } from 'vitest'
import { luminance, onAccent, isHex } from '../utils/contrast'
import {
  abilityMod,
  mapPenalties,
  parseDice,
  rollAttack,
  rollDice,
  rollNimble,
  sign,
} from '../utils/dice'
import { LEVEL_UP_RULES, averageHp, canBump, hpGain } from '../utils/levelUp'
import { accentVars, contrast, readableAccent, resolveAccent } from '../utils/themes'

/** Deterministic rng that yields the given die faces for a die of `sides`. */
function faces(sides: number, ...values: number[]) {
  let i = 0
  return () => ((values[i++ % values.length] ?? 1) - 1) / sides + 0.0001
}

describe('contrast', () => {
  it('validates hex colours', () => {
    expect(isHex('#C77DFF')).toBe(true)
    expect(isHex('C77DFF')).toBe(false)
    expect(isHex('#C77DF')).toBe(false)
  })

  it('computes relative luminance', () => {
    expect(luminance('#000000')).toBe(0)
    expect(luminance('#FFFFFF')).toBeCloseTo(1, 5)
  })

  it('switches text colour at the 0.28 threshold', () => {
    expect(onAccent('#D9A441')).toBe('#141010') // old gold: dark text
    expect(onAccent('#B8443A')).toBe('#FFFFFF') // oxblood: white text
    expect(onAccent('#6FCF8E')).toBe('#141010') // witchlight
  })
})

describe('themes', () => {
  it('falls back to the theme default accent', () => {
    expect(resolveAccent('gothic', null)).toBe('#B8443A')
    expect(resolveAccent('gothic', 'nope')).toBe('#B8443A')
    expect(resolveAccent('gothic', '#123456')).toBe('#123456')
  })

  it('keeps accent text at AA contrast on every theme surface', () => {
    const accents = ['#E0B054', '#B8443A', '#C8551F', '#6FCF8E', '#200010', '#FFFFFF', '#79A7D3']
    const surfaces = {
      classic: '#1D1914',
      gothic: '#131111',
      eldritch: '#161222',
      cursed: '#DCC9A3',
    }
    for (const [theme, panel] of Object.entries(surfaces)) {
      for (const accent of accents) {
        const vars = accentVars(theme as 'classic', accent)
        expect(contrast(vars['--accent-ink']!, panel)).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('leaves an already readable accent untouched', () => {
    expect(readableAccent('#E0B054', '#14110E')).toBe('#E0B054')
    expect(accentVars('classic', '#E0B054')['--accent-ink']).toBe('#E0B054')
  })

  it('mixes accent text toward ink on Cursed parchment', () => {
    const ink = accentVars('cursed', '#C8551F')['--accent-ink']!
    expect(ink).not.toBe('#C8551F')
    expect(contrast(ink, '#DCC9A3')).toBeGreaterThanOrEqual(4.5)
  })
})

describe('dice', () => {
  it('parses dice expressions', () => {
    expect(parseDice('1d8+4')).toEqual({ count: 1, sides: 8, mod: 4 })
    expect(parseDice('2D6 - 1')).toEqual({ count: 2, sides: 6, mod: -1 })
    expect(parseDice('3d10')).toEqual({ count: 3, sides: 10, mod: 0 })
    expect(parseDice('sword')).toBeNull()
    expect(parseDice('0d6')).toBeNull()
  })

  it('rolls within range and applies the modifier', () => {
    const result = rollDice({ count: 2, sides: 6, mod: 3 }, faces(6, 4, 5))
    expect(result.rolls).toEqual([4, 5])
    expect(result.total).toBe(12)
  })

  it('formats signed numbers and 5e modifiers', () => {
    expect(sign(3)).toBe('+3')
    expect(sign(-1)).toBe('-1')
    expect(sign(0)).toBe('+0')
    expect(abilityMod(18)).toBe(4)
    expect(abilityMod(9)).toBe(-1)
    expect(abilityMod(10)).toBe(0)
  })

  it('flags natural 20s and 1s on attacks', () => {
    expect(rollAttack(7, faces(20, 20))).toEqual({ d20: 20, total: 27, natural: 20 })
    expect(rollAttack(7, faces(20, 1))).toEqual({ d20: 1, total: 8, natural: 1 })
    expect(rollAttack(7, faces(20, 11)).natural).toBeNull()
  })

  it('applies the PF2e multiple attack penalty', () => {
    expect(mapPenalties(false)).toEqual([0, 5, 10])
    expect(mapPenalties(true)).toEqual([0, 4, 8])
  })

  it('misses a Nimble attack on a first-die 1', () => {
    expect(rollNimble({ count: 1, sides: 12, mod: 3 }, null, faces(12, 1)).miss).toBe(true)
  })

  it('explodes a Nimble crit on the first die maximum', () => {
    const result = rollNimble({ count: 1, sides: 12, mod: 3 }, null, faces(12, 12, 12, 5))
    expect(result).toEqual({ miss: false, crit: true, total: 12 + 12 + 5 + 3, bonus: 0 })
  })

  it('adds Nimble bonus dice on a hit', () => {
    const result = rollNimble({ count: 1, sides: 12, mod: 3 }, { count: 2, sides: 4 }, () => 0.5)
    // d12 -> 7, two d4 -> 3 each
    expect(result).toEqual({ miss: false, crit: false, total: 7 + 3 + 6, bonus: 6 })
  })
})

describe('level up', () => {
  it('takes the average of a hit die', () => {
    expect(averageHp(10)).toBe(6)
    expect(averageHp(12)).toBe(7)
    expect(averageHp(6)).toBe(4)
  })

  it('never gains less than 1 hit point', () => {
    expect(hpGain(6, 2)).toBe(8)
    expect(hpGain(1, -3)).toBe(1)
  })

  it('limits 5e to 2 points, up to +2 in one score', () => {
    const rules = LEVEL_UP_RULES.dnd5e
    expect(canBump(rules, {}, 'STR')).toBe(true)
    expect(canBump(rules, { STR: 1 }, 'STR')).toBe(true)
    expect(canBump(rules, { STR: 2 }, 'DEX')).toBe(false)
    expect(canBump(rules, { STR: 1, DEX: 1 }, 'CON')).toBe(false)
  })

  it('limits PF2e to four boosts on different attributes', () => {
    const rules = LEVEL_UP_RULES.pf2e
    expect(canBump(rules, { STR: 1 }, 'STR')).toBe(false)
    expect(canBump(rules, { STR: 1, DEX: 1, CON: 1 }, 'WIS')).toBe(true)
    expect(canBump(rules, { STR: 1, DEX: 1, CON: 1, WIS: 1 }, 'CHA')).toBe(false)
  })

  it('gives Nimble a single +1', () => {
    const rules = LEVEL_UP_RULES.nimble
    expect(rules.keys).toEqual(['STR', 'DEX', 'INT', 'WIL'])
    expect(canBump(rules, { STR: 1 }, 'DEX')).toBe(false)
  })
})
