// Subclass spell bonuses and what casting sets off (utils/dnd5eSpells.ts spellBonuses,
// castExtras): Potent Spellcasting by class, Elemental Affinity, Arcane Firearm, the Arcane
// Ward, Hunter's Rime, Supreme Healing.
import { describe, expect, it } from 'vitest'
import type { Dnd5eSheet, Dnd5eSpellRef } from '../types/sheets'
import { castSpell, spellDamage } from '../utils/dnd5eSpells'
import { defaultSheet } from '../utils/sheetDefaults'
import { data } from './helpers/dnd5e'

const spell = (slug: string) => data.spells.find((s) => s.slug === slug)!
const ref = (slug: string, from: string, ability: Dnd5eSpellRef['ability'] = 'WIS') => ({
  slug,
  name: spell(slug).name,
  level: spell(slug).level,
  from,
  ability,
})

function hero(features: string[], patch: Partial<Dnd5eSheet> = {}): Dnd5eSheet {
  return {
    ...defaultSheet('dnd5e'),
    classSlug: 'cleric',
    profBonus: 3,
    hp: 30,
    hpMax: 40,
    abilities: { STR: 10, DEX: 12, CON: 14, INT: 16, WIS: 16, CHA: 16 },
    castingStats: {
      ability: 'WIS',
      kind: 'full',
      list: 'cleric',
      saveDc: 14,
      attack: 6,
      slots: [4, 3, 3, 0, 0, 0, 0, 0, 0],
      cantrips: 3,
      prepared: 8,
    },
    features: features.map((name) => ({ name, desc: '', from: 'Test 7' })),
    ...patch,
  }
}

const slot = (level: number) => ({
  key: `slot${level}`,
  label: '',
  level,
  kind: 'slot' as const,
  left: 1,
})

describe('spell bonuses', () => {
  it('adds Potent Spellcasting to the class’s own cantrips only', () => {
    const s = hero(['Blessed Strikes: Potent Spellcasting'])
    const flame = spell('sacred-flame')
    expect(spellDamage(s, 7, ref('sacred-flame', 'Cleric'), flame, 0).flat).toEqual([
      { label: 'Potent Spellcasting', value: 3 },
    ])
    expect(spellDamage(s, 7, ref('sacred-flame', 'Magic Initiate'), flame, 0).flat).toEqual([])
  })

  it('adds CHA to the chosen type with Elemental Affinity', () => {
    const s = hero(['Elemental Affinity'], {
      choices: { 'L6:draconic-sorcery:elemental-affinity:0': ['Fire'] },
    })
    const fb = spell('fire-bolt')
    expect(spellDamage(s, 6, ref('fire-bolt', 'Sorcerer', 'CHA'), fb, 0).flat).toContainEqual({
      label: 'Elemental Affinity',
      value: 3,
    })
  })

  it('adds the Artillerist’s 1d8 to Artificer spells', () => {
    const s = hero(['Arcane Firearm'])
    const fb = spell('fire-bolt')
    expect(spellDamage(s, 5, ref('fire-bolt', 'Artificer', 'INT'), fb, 0).parts).toContainEqual({
      dice: '1d8',
      type: 'Fire',
    })
  })
})

describe('what casting sets off', () => {
  it('raises an Arcane Ward with the first Abjuration slot spell and tops it up with the next', () => {
    const s = hero(['Arcane Ward'], {
      resources: [{ name: 'Arcane Ward', from: 'Abjurer', max: 1, recharge: 'long' }],
    })
    const shield = spell('shield')
    const r = castSpell(s, 6, ref('shield', 'Wizard', 'INT'), shield, slot(1))
    expect(r.line).toMatch(/Arcane Ward: 15 HP/)
    s.arcaneWard = 5
    expect(castSpell(s, 6, ref('shield', 'Wizard', 'INT'), shield, slot(1)).line).toMatch(
      /Arcane Ward: 7\/15 HP/,
    )
  })

  it('gives Hunter’s Rime’s temporary HP when casting Hunter’s Mark', () => {
    const s = hero(['Hunter’s Rime'])
    castSpell(s, 3, ref('hunters-mark', 'Ranger'), spell('hunters-mark'), slot(1), {
      rng: () => 0.999,
    })
    expect(s.tempHp).toBe(13)
  })

  it('heals the dice’s maximum with Supreme Healing', () => {
    const s = hero(['Supreme Healing'])
    const r = castSpell(s, 17, ref('cure-wounds', 'Cleric'), spell('cure-wounds'), slot(1))
    const dice = spell('cure-wounds').healing!
    const [n, d] = dice.split('d').map(Number)
    expect(r.healing).toBe(n! * d! + 3)
  })
})
