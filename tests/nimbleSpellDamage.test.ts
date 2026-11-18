import { describe, expect, it } from 'vitest'
import { spellByName } from '../data/nimble/spells'
import type { NimbleSheet } from '../types/sheets'
import { spellDamage, rollSpellDamage } from '../utils/nimbleSpellDamage'
import { defaultSheet } from '../utils/sheetDefaults'

function hero(patch: Partial<NimbleSheet> = {}): NimbleSheet {
  return {
    ...defaultSheet('nimble'),
    classSlug: 'shadowmancer',
    stats: { STR: 0, DEX: 3, INT: 4, WIL: 1 },
    ...patch,
  }
}

describe('spell damage', () => {
  it('fills in KEY, High Levels dice and the damage type', () => {
    const blast = spellByName('Shadow Blast')!
    expect(spellDamage(hero(), 10, blast)).toMatchObject({
      dice: '3d12+4',
      type: 'necrotic',
      single: true,
    })
  })

  it('uses an ability’s alternative damage type', () => {
    const sheet = hero({
      abilities: [
        {
          name: 'Master of Nightfrost',
          src: 'Abyssal Depths',
          desc: 'Your Shadow Blast and minions can deal cold or necrotic damage.',
        },
      ],
    })
    expect(spellDamage(sheet, 3, spellByName('Shadow Blast')!)?.type).toBe('cold or necrotic')
  })

  it('applies flat High Levels, die steps and upcasts', () => {
    expect(spellDamage(hero(), 10, spellByName('Ice Lance')!)?.dice).toBe('1d6+6')
    expect(spellDamage(hero(), 10, spellByName('Entice')!)?.dice).toBe('1d8')
    expect(spellDamage(hero(), 5, spellByName('Arc Lightning')!, 3)?.dice).toBe('3d8+8')
  })

  it('leaves unusual dice to the player and rolls the rest', () => {
    expect(spellDamage(hero(), 12, spellByName('Glacier Strike')!)).toMatchObject({
      rollable: false,
    })
    const zap = spellDamage(hero(), 1, spellByName('Zap')!)!
    expect(rollSpellDamage(zap, () => 0.5)).toMatchObject({ total: 10, miss: false })
  })
})
