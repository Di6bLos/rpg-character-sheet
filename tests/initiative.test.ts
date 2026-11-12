import { describe, expect, it } from 'vitest'
import type { CampaignNpc } from '../types'
import {
  buildCopies,
  combatantName,
  COMBATANT_NAME_MAX,
  groupLabels,
  hpBand,
  letter,
  sortOrder,
} from '../utils/initiative'

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
  it('tracks Nimble minions (no HP) as 1 HP so they can go down', () => {
    const minion = buildCopies(npc({ stat_block: { hp: 0 } }), { count: 1 })[0]!
    expect([minion.hp, minion.hp_max]).toEqual([1, 1])
    const other = buildCopies(npc({ system: 'dnd5e', stat_block: {} }), { count: 1 })[0]!
    expect(other.hp_max).toBe(0)
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
      { id: 'a', name: 'A', initiative: 10, created_at: '2026-01-01T00:00:01Z' },
      { id: 'b', name: 'B', initiative: 15, created_at: '2026-01-01T00:00:02Z' },
      { id: 'c', name: 'C', initiative: 10, created_at: '2026-01-01T00:00:00Z' },
    ]
    expect(sortOrder(rows).map((r) => r.id)).toEqual(['b', 'c', 'a'])
  })

  it('breaks full ties by name, then id, whatever order the rows arrive in', () => {
    const t = '2026-01-01T00:00:00Z'
    const rows = [
      { id: 'z', name: 'Goblin B', initiative: 12, created_at: t },
      { id: 'y', name: 'Goblin A', initiative: 12, created_at: t },
      { id: 'x', name: 'Goblin A', initiative: 12, created_at: t },
    ]
    expect(sortOrder(rows).map((r) => r.id)).toEqual(['x', 'y', 'z'])
    expect(sortOrder([...rows].reverse()).map((r) => r.id)).toEqual(['x', 'y', 'z'])
  })
})

describe('combatantName', () => {
  it('shortens long names so the group letter still fits', () => {
    const long = 'x'.repeat(COMBATANT_NAME_MAX)
    const named = combatantName(long, 'AB')
    expect(named).toHaveLength(COMBATANT_NAME_MAX)
    expect(named.endsWith(' AB')).toBe(true)
    expect(combatantName(long, null)).toHaveLength(COMBATANT_NAME_MAX)
    expect(combatantName('Goblin', 'C')).toBe('Goblin C')
  })
})
