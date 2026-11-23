import { describe, expect, it } from 'vitest'
import { spellByName } from '../data/nimble/spells'
import type { NimbleSheet } from '../types/sheets'
import {
  chargedActions,
  critBonus,
  targetNeed,
  weaponEnchantment,
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
import {
  attackBonus,
  castSpell,
  endTurn,
  initiativeCastReady,
  initiativeCasts,
  rollInitiative,
} from '../utils/nimblePlay'
import { endEffects } from '../utils/nimbleEffects'
import { spellDamage } from '../utils/nimbleSpellDamage'

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

describe('Spellblade: Firebrand and Enchant Weapon', () => {
  const FIREBRAND =
    'When you roll Initiative you may cast Enchant Weapon for free (can be upcast as normal by spending additional mana).'
  const blade = (): NimbleSheet => ({
    ...defaultSheet('nimble'),
    classSlug: 'commander',
    stats: { STR: 3, DEX: 1, INT: 2, WIL: 0 },
    abilities: [{ name: 'Firebrand', src: 'Spellblade', desc: FIREBRAND }],
  })

  it('opens a free Enchant Weapon when Initiative is rolled, until your first turn ends', () => {
    const sheet = blade()
    expect(initiativeCasts(sheet)).toEqual([{ spell: 'Enchant Weapon', ability: 'Firebrand' }])
    expect(initiativeCastReady(sheet, 'Enchant Weapon')).toBe(false)
    rollInitiative(sheet, 3, faces(20, 12))
    expect(initiativeCastReady(sheet, 'Enchant Weapon')).toBe(true)
    endTurn(sheet, 3)
    expect(initiativeCastReady(sheet, 'Enchant Weapon')).toBe(false)
  })

  it('adds +KEY weapon damage per tier while concentrating, Smoldering on crit', () => {
    const sheet = blade()
    expect(spellDamage(sheet, 3, spell('Enchant Weapon'), 3)).toBeNull()
    castSpell(sheet, 'Enchant Weapon', 0, 3, 3)
    expect(weaponEnchantment(sheet)).toMatchObject({
      spell: 'Enchant Weapon',
      damage: 6,
      smoldering: true,
    })
    expect(attackBonus(sheet, 3, { melee: true }, 0)).toEqual({
      flat: 6,
      notes: ['Enchant Weapon +6'],
    })
    endEffects(sheet, 'concentration')
    expect(weaponEnchantment(sheet)).toBeNull()
    expect(attackBonus(sheet, 3, { melee: true }, 0).flat).toBe(0)
  })

  it('puts a Smoldering checkbox on spells that need a Smoldering target', () => {
    expect(targetNeed(spell('Ignite'))).toEqual({ key: 'smoldering', label: 'Smoldering' })
    expect(targetNeed(spell('Flame Dart'))).toBeNull()
  })
})
