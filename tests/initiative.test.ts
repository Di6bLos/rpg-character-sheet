import { describe, expect, it } from 'vitest'
import type { CampaignNpc } from '../types'
import { buildCopies, groupLabels, hpBand, letter, sortOrder } from '../utils/initiative'

const npc = (patch: Partial<CampaignNpc> = {}): CampaignNpc => ({
  id: 'n1',
  campaign_id: 'c1',
  pool_npc_id: null,
  system: 'nimble',
  kind: 'monster',
  name: 'Goblin',
  level: '1',
  stat_block: { hp: 10, ac: 12, initMod: 2 },
  image_path: 'u/goblin.png',
  source: 'homebrew',
  ai_generated: false,
  gm_notes: '',
  created_at: '',
  updated_at: '',
  ...patch,
})

/** Returns the given d20 faces in turn (rng for rollDie). */
const faces = (...rolls: number[]) => {
  let i = 0
  return () => (rolls[i++ % rolls.length]! - 1) / 20 + 0.0001
}

describe('letter / groupLabels', () => {
  it('counts like spreadsheet columns', () => {
    expect([letter(0), letter(25), letter(26), letter(27)]).toEqual(['A', 'Z', 'AA', 'AB'])
  })
  it('starts at A', () => {
    expect(groupLabels(5)).toEqual(['A', 'B', 'C', 'D', 'E'])
  })
  it('continues after letters already on the board', () => {
    expect(groupLabels(3, ['A', 'B', null])).toEqual(['C', 'D', 'E'])
    expect(groupLabels(1, ['Z'])).toEqual(['AA'])
  })
})

describe('buildCopies', () => {
  it('adds five goblins with letters, HP, AC and the portrait', () => {
    const rows = buildCopies(npc(), { count: 5, rng: faces(10) })
    expect(rows.map((r) => r.name)).toEqual([
      'Goblin A',
      'Goblin B',
      'Goblin C',
      'Goblin D',
      'Goblin E',
    ])
    expect(rows.every((r) => r.hp === 10 && r.hp_max === 10 && r.ac === 12)).toBe(true)
    expect(
      rows.every((r) => r.portrait_path === 'u/goblin.png' && r.campaign_npc_id === 'n1'),
    ).toBe(true)
    expect(rows[0]!.initiative).toBe(12)
  })
  it('keeps a lone creature unlabelled', () => {
    const rows = buildCopies(npc(), { count: 1, rng: faces(5) })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.name).toBe('Goblin')
    expect(rows[0]!.group_label).toBeNull()
  })
  it('rolls once for the group when asked', () => {
    const rows = buildCopies(npc(), { count: 3, sharedRoll: true, rng: faces(4, 18, 9, 2) })
    expect(new Set(rows.map((r) => r.initiative)).size).toBe(1)
  })
  it('rolls per creature by default', () => {
    const rows = buildCopies(npc(), { count: 2, rng: faces(1, 20, 7) })
    expect(rows.map((r) => r.initiative)).toEqual([22, 9])
  })
  it('marks humanoids as NPCs and caps the count at 20', () => {
    expect(buildCopies(npc({ kind: 'humanoid' }), { count: 1 })[0]!.kind).toBe('npc')
    expect(buildCopies(npc(), { count: 50 })).toHaveLength(20)
  })
})

describe('hpBand', () => {
  it('matches the SQL bands', () => {
    expect(hpBand(10, 10)).toBe('Unhurt')
    expect(hpBand(6, 10)).toBe('Hurt')
    expect(hpBand(5, 10)).toBe('Bloodied')
    expect(hpBand(0, 10)).toBe('Down')
    expect(hpBand(3, 0)).toBeNull()
  })
})

describe('sortOrder', () => {
  it('sorts highest first and keeps ties in the order added', () => {
    const rows = [
      { id: 'a', initiative: 10, created_at: '2026-01-01T00:00:01Z' },
      { id: 'b', initiative: 15, created_at: '2026-01-01T00:00:02Z' },
      { id: 'c', initiative: 10, created_at: '2026-01-01T00:00:00Z' },
    ]
    expect(sortOrder(rows).map((r) => r.id)).toEqual(['b', 'c', 'a'])
  })
})
