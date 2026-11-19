import { describe, expect, it } from 'vitest'
import type { CampaignNpc, Combatant, RosterEntry } from '../types'
import {
  downSummonKeys,
  isSlainSummon,
  buildCopies,
  combatantName,
  COMBATANT_NAME_MAX,
  groupLabels,
  hpBand,
  letter,
  sortOrder,
  syncSummonRows,
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
    const rows = buildCopies(npc(), { count: 2, rng: faces(20, 7) })
    expect(rows.map((r) => r.initiative)).toEqual([22, 9])
  })
  it('rolls only the dice it uses (each one shows in the dice tray)', () => {
    const count = (sharedRoll: boolean) => {
      let calls = 0
      const rng = () => (calls++, 0.5)
      buildCopies(npc(), { count: 3, sharedRoll, rng })
      return calls
    }
    expect(count(false)).toBe(3)
    expect(count(true)).toBe(1)
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

describe('syncSummonRows', () => {
  type Row = Pick<Combatant, 'id' | 'kind' | 'character_id' | 'initiative' | 'summon_key'>
  const hero = (
    id: string,
    summons: { id: string; name: string; hpMax: number; def?: string }[],
  ): Pick<RosterEntry, 'character_id' | 'character_name' | 'display_name' | 'summary'> => ({
    character_id: id,
    character_name: `Hero ${id}`,
    display_name: 'Player',
    summary: {
      summons: summons.map((s) => ({ def: 'shadow-minion', ...s, hp: s.hpMax })),
    },
  })
  const pc = (id: string, initiative: number): Row => ({
    id: `row-${id}`,
    kind: 'pc',
    character_id: id,
    initiative,
    summon_key: null,
  })
  const summonRow = (id: string, key: string): Row => ({
    id,
    kind: 'summon',
    character_id: null,
    initiative: 0,
    summon_key: key,
  })

  it('seats a summon after its seated summoner, sharing initiative', () => {
    const { add, remove } = syncSummonRows(
      [hero('a', [{ id: 's1', name: 'Wolf', hpMax: 12 }])],
      [pc('a', 17)],
    )
    expect(remove).toEqual([])
    expect(add).toEqual([
      {
        name: 'Wolf (Hero a)',
        kind: 'summon',
        initiative: 17,
        init_mod: 0,
        hp: 12,
        hp_max: 12,
        ac: 10,
        character_id: null,
        campaign_npc_id: null,
        portrait_path: null,
        group_label: null,
        summon_key: 'a:s1',
      },
    ])
  })

  it('keeps unharmable summons at 0 HP and never links them to the character', () => {
    const { add } = syncSummonRows(
      [hero('a', [{ id: 's1', name: 'Spirit', hpMax: 0 }])],
      [pc('a', 9)],
    )
    expect([add[0]!.hp, add[0]!.hp_max]).toEqual([0, 0])
    expect(add.every((r) => r.character_id === null)).toBe(true)
  })

  it('skips summons of characters not in the order and ones already seated', () => {
    const { add } = syncSummonRows(
      [
        hero('a', [
          { id: 's1', name: 'Wolf', hpMax: 12 },
          { id: 's2', name: 'Hawk', hpMax: 4 },
        ]),
        hero('b', [{ id: 's3', name: 'Bear', hpMax: 20 }]),
      ],
      [pc('a', 10), summonRow('x', 'a:s1')],
    )
    expect(add.map((r) => r.summon_key)).toEqual(['a:s2'])
  })

  it('removes summons that are gone from the sheet', () => {
    const { add, remove } = syncSummonRows(
      [hero('a', [{ id: 's2', name: 'Hawk', hpMax: 4 }])],
      [pc('a', 10), summonRow('x', 'a:s1'), summonRow('y', 'a:s2')],
    )
    expect(remove).toEqual(['x'])
    expect(add).toEqual([])
  })

  it('leaves summons of characters missing from the roster alone', () => {
    const { remove } = syncSummonRows([hero('a', [])], [summonRow('x', 'b:s1')])
    expect(remove).toEqual([])
  })

  it('shortens long names to fit the column', () => {
    const { add } = syncSummonRows(
      [hero('a', [{ id: 's1', name: 'x'.repeat(COMBATANT_NAME_MAX), hpMax: 1 }])],
      [pc('a', 10)],
    )
    expect(add[0]!.name).toHaveLength(COMBATANT_NAME_MAX)
  })
})

describe('syncSummonRows: who fights', () => {
  it('seats minions and constructs but never weapons, spirits, companions or friends', () => {
    const roster = [
      {
        character_id: 'a',
        character_name: 'Hero a',
        display_name: 'Player',
        summary: {
          summons: [
            'shadow-minion',
            'cheer-bot',
            'bonescythe',
            'lifebinding-spirit',
            'medium-companion',
            'mal',
          ].map((def, i) => ({ id: `s${i}`, def, name: def, hp: 1, hpMax: 1 })),
        },
      },
    ]
    const pcRow = {
      id: 'row-a',
      kind: 'pc' as const,
      character_id: 'a',
      initiative: 12,
      summon_key: null,
    }
    expect(syncSummonRows(roster, [pcRow]).add.map((r) => r.name)).toEqual([
      'shadow-minion (Hero a)',
      'cheer-bot (Hero a)',
    ])
  })
})

describe('downSummonKeys', () => {
  it('lists summons at 0 HP or shown as Down, never other rows', () => {
    const row = (
      summon_key: string | null,
      hp: number | null,
      hp_max: number | null,
      hp_band: 'Down' | 'Hurt' | null = null,
    ) => ({ summon_key, hp, hp_max, hp_band })
    expect(
      downSummonKeys([
        row('a:1', 0, 1),
        row('a:2', 1, 1),
        row('a:3', null, null, 'Down'),
        row('a:4', 0, 0),
        row(null, 0, 10),
      ]),
    ).toEqual(['a:1', 'a:3'])
  })
})

describe('isSlainSummon', () => {
  it('drops only summons that are slain, never other combatants', () => {
    const row = (
      kind: 'summon' | 'monster',
      hp: number | null,
      hp_max: number | null,
      hp_band: 'Down' | null = null,
    ) => ({ kind, hp, hp_max, hp_band })
    expect(isSlainSummon(row('summon', 0, 1))).toBe(true)
    expect(isSlainSummon(row('summon', null, null, 'Down'))).toBe(true)
    expect(isSlainSummon(row('summon', 1, 1))).toBe(false)
    expect(isSlainSummon(row('monster', 0, 10))).toBe(false)
  })
})
