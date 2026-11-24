import { describe, expect, it } from 'vitest'
import {
  dnd5eAbilityRows,
  pf2ePointsLine,
  pf2eRankName,
  pf2eSkillRows,
} from '~/utils/heroCardStats'
import type { Pf2eSkill } from '~/types/sheets'

describe('dnd5eAbilityRows', () => {
  it('gives each ability its modifier and adds proficiency to proficient saves', () => {
    const rows = dnd5eAbilityRows({
      abilities: { STR: 16, DEX: 13, CON: 14, INT: 8, WIS: 10, CHA: 9 },
      saveProfs: ['STR', 'CON'],
      profBonus: 2,
    })
    expect(rows.map((r) => r.k)).toEqual(['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'])
    expect(rows[0]).toEqual({ k: 'STR', score: 16, mod: '+3', save: '+5', prof: true })
    expect(rows[1]).toMatchObject({ mod: '+1', save: '+1', prof: false })
    expect(rows[2]).toMatchObject({ mod: '+2', save: '+4', prof: true })
    expect(rows[3]).toMatchObject({ mod: '-1', save: '-1' })
    expect(rows[4]).toMatchObject({ mod: '+0', save: '+0' })
    expect(rows[5]).toMatchObject({ mod: '-1' })
  })
})

describe('pf2eRankName', () => {
  it('names each rank and falls back to Untrained', () => {
    expect(pf2eRankName('T')).toBe('Trained')
    expect(pf2eRankName('L')).toBe('Legendary')
    expect(pf2eRankName('?')).toBe('Untrained')
  })
})

describe('pf2eSkillRows', () => {
  it('puts trained skills first by total, then the untrained in sheet order', () => {
    const skills: Pf2eSkill[] = [
      { name: 'Acrobatics', attr: 'DEX', rank: 'U', value: 3 },
      { name: 'Stealth', attr: 'DEX', rank: 'T', value: 7 },
      { name: 'Arcana', attr: 'INT', rank: 'U', value: 0 },
      { name: 'Thievery', attr: 'DEX', rank: 'E', value: 9 },
      { name: '', attr: 'INT', rank: 'T', value: 4 },
    ]
    expect(pf2eSkillRows(skills).map((s) => s.name)).toEqual([
      'Thievery',
      'Stealth',
      'Acrobatics',
      'Arcana',
    ])
  })
})

describe('pf2ePointsLine', () => {
  it('shows hero points, and focus points when the hero has a pool', () => {
    expect(pf2ePointsLine({ heroPoints: 1, focus: { current: 0, max: 0 } })).toBe('hero 1')
    expect(pf2ePointsLine({ heroPoints: 2, focus: { current: 1, max: 2 } })).toBe(
      'hero 2 · focus 1/2',
    )
    expect(pf2ePointsLine({})).toBe('')
    expect(pf2ePointsLine(null)).toBe('')
  })
})
