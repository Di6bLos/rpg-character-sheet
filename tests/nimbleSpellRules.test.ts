import { describe, expect, it } from 'vitest'
import { spellByName } from '../data/nimble/spells'
import type { NimbleSheet } from '../types/sheets'
import {
  chargedActions,
  critBonus,
  critsOnAnyMax,
  spellNeeds,
  spellOnHit,
  spellSelfEffects,
} from '../utils/nimbleSpellRules'
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

  it('Hampers the target with Ice Lance, and Shatter crits on any max against it', () => {
    const lance = spellOnHit(spell('Ice Lance'), { miss: false, crit: false }, target())
    expect(lance).toEqual({ note: ' On hit: Slowed.', target: target({ hampered: true }) })
    const shatter = spell('Shatter')
    expect(critsOnAnyMax(shatter, target({ hampered: true }), [2, 6, 3], 6)).toBe(true)
    expect(critsOnAnyMax(shatter, target(), [2, 6, 3], 6)).toBe(false)
    expect(critBonus(shatter, shatter.tier)).toBe(20)
    expect(critBonus(shatter, shatter.tier + 2)).toBe(30)
  })
})
