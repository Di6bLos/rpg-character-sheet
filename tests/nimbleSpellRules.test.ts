import { describe, expect, it } from 'vitest'
import { spellByName } from '../data/nimble/spells'
import type { NimbleSheet } from '../types/sheets'
import {
  chargedActions,
  critBonus,
  spellNeeds,
  spellOnCrit,
  spellOnHit,
  spellRollRules,
  spellSelfEffects,
} from '../utils/nimbleSpellRules'
import { rollNimble } from '../utils/dice'

function faces(sides: number, ...values: number[]) {
  let i = 0
  return () => ((values[i++ % values.length] ?? 1) - 1) / sides + 0.0001
}
import { defaultSheet } from '../utils/sheetDefaults'

const spell = (name: string) => spellByName(name)!
const target = (patch = {}) => ({ smoldering: false, hampered: false, ...patch })

function hero(conditions: string[] = []): NimbleSheet {
  return { ...defaultSheet('nimble'), conditions }
}

describe('spell effects', () => {
  it('casts Overload only while Charged, ending it', () => {
    expect(spellNeeds(hero(), spell('Overload'), target())).toBe('Needs you Charged')
    const charged = hero(['Charged'])
    expect(spellNeeds(charged, spell('Overload'), target())).toBe('')
    expect(spellSelfEffects(charged, spell('Overload'))).toBe(' No longer Charged.')
    expect(charged.conditions).not.toContain('Charged')
  })

  it('makes Electrickery cost 1 action while Charged and Alacrity give Charged', () => {
    expect(chargedActions(hero(), spell('Electrickery'))).toBeNull()
    expect(chargedActions(hero(['Charged']), spell('Electrickery'))).toBe(1)
    const sheet = hero()
    expect(spellSelfEffects(sheet, spell('Alacrity'))).toBe(' You are Charged.')
    expect(sheet.conditions).toContain('Charged')
  })

  it('needs a Smoldering target for Ignite, set by a Flame Dart crit and ended by an Ignite hit', () => {
    expect(spellNeeds(hero(), spell('Ignite'), target())).toBe('Target isn’t Smoldering')
    const dart = spellOnHit(spell('Flame Dart'), { miss: false, crit: true }, target())
    expect(dart.target.smoldering).toBe(true)
    expect(dart.note).toBe(' On crit: Smoldering.')
    const ignite = spellOnHit(
      spell('Ignite'),
      { miss: false, crit: false },
      target({ smoldering: true }),
    )
    expect(ignite.target.smoldering).toBe(false)
    expect(
      spellOnHit(spell('Flame Dart'), { miss: true, crit: true }, target()).target.smoldering,
    ).toBe(false)
  })

  it('Hampers the target with Ice Lance until your next turn, telling own-dice players which chip', () => {
    const lance = spellOnHit(spell('Ice Lance'), { miss: false, crit: false }, target())
    expect(lance).toEqual({
      note: ' On hit: Slowed.',
      target: target({ hampered: true, hamperedUntilTurn: true }),
      chips: ['turn on Hampered'],
    })
    expect(spellOnCrit(spell('Flame Dart'), target()).chips).toEqual(['turn on Smoldering'])
  })

  it('reads Shatter’s crit rules: any max against a Hampered target, upcast die bumps', () => {
    const shatter = spell('Shatter')
    expect(spellRollRules(shatter, shatter.tier, target({ hampered: true }))).toEqual({
      critOnAnyMax: true,
      bump: 0,
    })
    expect(spellRollRules(shatter, shatter.tier + 2, target())).toEqual({
      critOnAnyMax: false,
      bump: 2,
    })
    expect(critBonus(shatter, shatter.tier)).toBe(20)
    expect(critBonus(shatter, shatter.tier + 2)).toBe(30)
  })

  it('makes a max on any die a full crit: the Primary Die rolls again', () => {
    const roll = rollNimble({ count: 3, sides: 6, mod: 0 }, null, faces(6, 2, 6, 3, 4), 0, {
      critOnAnyMax: true,
    })
    expect(roll).toMatchObject({ crit: true, total: 2 + 6 + 3 + 4 })
    expect(rollNimble({ count: 3, sides: 6, mod: 0 }, null, faces(6, 2, 6, 3)).crit).toBe(false)
  })

  it('spends upcast bumps lifting the die nearest its max, and adds the rest', () => {
    const lifted = rollNimble({ count: 3, sides: 6, mod: 0 }, null, faces(6, 2, 5, 3, 1), 0, {
      critOnAnyMax: true,
      bump: 2,
    })
    expect(lifted).toMatchObject({ crit: true, dice: [2, 6, 3], total: 2 + 6 + 3 + 1 + 1 })
    const plain = rollNimble({ count: 3, sides: 6, mod: 0 }, null, faces(6, 2, 4, 3), 0, {
      bump: 2,
    })
    expect(plain).toMatchObject({ crit: false, total: 2 + 4 + 3 + 2 })
  })
})
