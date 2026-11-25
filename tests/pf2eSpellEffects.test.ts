import { describe, expect, it } from 'vitest'
import type { Pf2eSheet } from '../types/sheets'
import { startPf2eTurn } from '../utils/pf2eActions'
import { extraDice, resistancesNow, setGiven, speedNow } from '../utils/pf2eEffects'
import { activeConditions, adjusted } from '../utils/pf2ePlay'
import { effectValue, spellRules } from '../utils/pf2eSpellRules'
import { effectOnSelf } from '../utils/pf2eSpells'
import { defaultSheet } from '../utils/sheetDefaults'
import { buildData, named } from './helpers/pf2e'

const spell = (name: string) => named(buildData.spells, name)
const hero = (over: Partial<Pf2eSheet> = {}): Pf2eSheet => ({
  ...defaultSheet('pf2e'),
  hp: 20,
  hpMax: 20,
  ...over,
})
/**
 * Casts a spell the hero knows on themselves at a rank: their toggle for self spells, else
 * the effect as an ally gives it.
 */
function castOn(s: Pf2eSheet, name: string, rank: number, level = 1) {
  const sp = spell(name)
  s.focusSpells = [...(s.focusSpells ?? []), { id: sp.id, name: sp.name, rank: sp.rank }]
  return effectOnSelf(s, sp, rank, level)
}
const fist = { traits: 'agile, finesse, unarmed', ranged: false }
const sword = { traits: 'versatile p', ranged: false }

describe('pf2e spell effects on the caster or from an ally', () => {
  it('every one of them is found by its spell’s name', () => {
    for (const n of [
      'Protection',
      'Runic Weapon',
      'Runic Body',
      'Weapon Surge',
      'Fire Shield',
      'Stoke the Heart',
      'Song of Strength',
      'Inner Upheaval',
      'Qi Form',
      'Wild Winds Stance',
      'Clinging Shadows Stance',
      'Competitive Edge',
      "Magic's Vessel",
      'Untamed Form',
      'Touch of the Moon',
      'Soothing Words',
      'Blood Ward',
      'Foresight',
      'Fly',
      'Invisibility',
      'Blur',
      'False Vitality',
      'Sure Strike',
    ])
      expect(spellRules(spell(n)).effect?.def.name, n).toBe(n)
  })

  it('Protection: +1 status to AC and saves (p. 351)', () => {
    const s = hero()
    castOn(s, 'Protection', 1)
    expect(adjusted(s, 15, { kind: 'ac' }).value).toBe(16)
    expect(adjusted(s, 5, { kind: 'save', save: 'Will' }).value).toBe(6)
  })

  it('Runic Weapon and Runic Body: +1 item to attacks, +2 at 6th, +3 at 9th (p. 354)', () => {
    const s = hero()
    castOn(s, 'Runic Weapon', 6)
    expect(adjusted(s, 7, { kind: 'attack' }).value).toBe(9)
    expect(effectValue(spell('Runic Body'), spellRules(spell('Runic Body')).effect!.def, 9)).toBe(3)
  })

  it('Weapon Surge: +1 status to the attack and 1d6 spirit, until your next turn (p. 381)', () => {
    const s = hero()
    castOn(s, 'Weapon Surge', 1)
    expect(adjusted(s, 7, { kind: 'attack' }).value).toBe(8)
    expect(extraDice(s, 9, sword, {})).toEqual([{ dice: '2d6', label: 'spirit (weapon surge)' }])
    startPf2eTurn(s)
    expect(adjusted(s, 7, { kind: 'attack' }).value).toBe(7)
  })

  it('Fire Shield: cold resistance 5 (p. 331)', () => {
    const s = hero()
    castOn(s, 'Fire Shield', 4, 7)
    expect(resistancesNow(s, 7)).toEqual([{ type: 'cold', value: 5, source: 'Fire Shield' }])
  })

  it('Stoke the Heart: +2 status damage, +1 per 2 ranks (p. 387)', () => {
    const s = hero()
    castOn(s, 'Stoke the Heart', 3)
    expect(adjusted(s, 0, { kind: 'damage', melee: true }).value).toBe(3)
  })

  it('Song of Strength: +1 status to Athletics, not other skills (p. 371)', () => {
    const s = hero()
    castOn(s, 'Song of Strength', 1)
    expect(adjusted(s, 4, { kind: 'skill', skill: 'Athletics' }).value).toBe(5)
    expect(adjusted(s, 4, { kind: 'skill', skill: 'Stealth' }).value).toBe(4)
  })

  it('Inner Upheaval: +1 status to attacks and 1d6 on unarmed Strikes only (PC2 p. 256)', () => {
    const s = hero()
    castOn(s, 'Inner Upheaval', 1)
    expect(adjusted(s, 9, { kind: 'attack' }).value).toBe(10)
    expect(extraDice(s, 1, fist, {})).toHaveLength(1)
    expect(extraDice(s, 1, sword, {})).toHaveLength(0)
  })

  it('Qi Form: 1d6 on every Strike (PC2 p. 257)', () => {
    const s = hero()
    castOn(s, 'Qi Form', 9, 17)
    expect(extraDice(s, 17, sword, {})[0]?.dice).toBe('1d6')
  })

  it('Clinging Shadows Stance: +2 circumstance to Athletics only to Grapple (PC2 p. 257)', () => {
    const s = hero()
    castOn(s, 'Clinging Shadows Stance', 4, 7)
    const ctx = { kind: 'skill' as const, skill: 'Athletics' }
    expect(adjusted(s, 5, { ...ctx, action: 'Grapple' }).value).toBe(7)
    expect(adjusted(s, 5, ctx).value).toBe(5)
  })

  it('Competitive Edge: +1 status to attacks and skills, +2 when cast at 7th (p. 372)', () => {
    const s = hero()
    castOn(s, 'Competitive Edge', 4, 7)
    expect(adjusted(s, 9, { kind: 'attack' }).value).toBe(10)
    const t = hero()
    castOn(t, 'Competitive Edge', 7, 13)
    expect(adjusted(t, 9, { kind: 'skill', skill: 'Stealth' }).value).toBe(11)
  })

  it("Magic's Vessel, Soothing Words, Blood Ward: status bonuses to saves (pp. 376, 374, 384)", () => {
    const s = hero()
    castOn(s, "Magic's Vessel", 1)
    castOn(s, 'Soothing Words', 5)
    expect(adjusted(s, 5, { kind: 'save', save: 'Will' }).value).toBe(7)
    expect(adjusted(s, 5, { kind: 'save', save: 'Fortitude' }).value).toBe(6)
    const w = hero()
    castOn(w, 'Blood Ward', 5)
    expect(adjusted(w, 15, { kind: 'ac' }).value).toBe(17)
  })

  it('Touch of the Moon: waxing moon +1 status attacks and +4 status damage (p. 377)', () => {
    const s = hero()
    castOn(s, 'Touch of the Moon', 4)
    expect(adjusted(s, 9, { kind: 'attack' }).value).toBe(10)
    expect(adjusted(s, 0, { kind: 'damage' }).value).toBe(4)
  })

  it('Foresight: +2 status to initiative (p. 332)', () => {
    const s = hero()
    castOn(s, 'Foresight', 9)
    expect(adjusted(s, 5, { kind: 'perception', initiative: true }).value).toBe(7)
  })

  it('Invisibility and Blur give their conditions; Fly is a note (pp. 339, 318, 332)', () => {
    const s = hero({ speed: '25 ft' })
    castOn(s, 'Invisibility', 2)
    castOn(s, 'Blur', 2)
    castOn(s, 'Fly', 4)
    expect([...activeConditions(s)]).toEqual(expect.arrayContaining(['Invisible', 'Concealed']))
    expect(speedNow(s).changed).toBe(false)
  })

  it('False Vitality: 10 temp HP, 3 more per rank above 2nd (p. 331)', () => {
    const s = hero()
    expect(castOn(s, 'False Vitality', 2)).toMatch(/10 temporary Hit Points/)
    const t = hero()
    castOn(t, 'False Vitality', 4)
    expect(t.tempHp).toBe(16)
  })

  it('Sure Strike, Untamed Form and Wild Winds Stance turn on as notes', () => {
    const s = hero()
    for (const n of ['Sure Strike', 'Untamed Form', 'Wild Winds Stance']) castOn(s, n, 1)
    expect(s.effects?.on).toEqual(['Sure Strike', 'Untamed Form', 'Wild Winds Stance'])
    expect(adjusted(s, 15, { kind: 'ac' }).value).toBe(15)
  })

  it('a champion’s Lay on Hands and spirit shields help allies only, for a round', () => {
    const s = hero()
    expect(spellRules(spell('Lay on Hands')).effect).toBeUndefined()
    setGiven(s, 'Lay on Hands (ally)', true)
    setGiven(s, 'Shields of the Spirit (ally)', true)
    expect(adjusted(s, 15, { kind: 'ac' }).value).toBe(17)
    startPf2eTurn(s)
    expect(s.effects?.given).toEqual([])
  })
})
