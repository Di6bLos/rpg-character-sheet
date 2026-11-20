import type {
  CampaignNpc,
  Combatant,
  HpBand,
  InitiativeMode,
  InitiativeRow,
  NpcKind,
  RosterEntry,
} from '~/types'
import { summonById } from '~/data/nimble/summons'
import { rollDie, type Rng } from './dice'

/** A, B, …, Z, AA, AB… (spreadsheet-style letters for group members). */
export function letter(index: number): string {
  let n = index
  let out = ''
  do {
    out = String.fromCharCode(65 + (n % 26)) + out
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return out
}

function letterIndex(label: string): number {
  let n = 0
  for (const ch of label) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/**
 * Labels for `count` new copies of a creature, continuing after the letters
 * already used in the encounter: two goblins on the board (A, B) + 3 → C, D, E.
 */
export function groupLabels(count: number, existing: (string | null | undefined)[] = []): string[] {
  const used = existing.filter((l): l is string => !!l && /^[A-Z]+$/.test(l)).map(letterIndex)
  const start = used.length ? Math.max(...used) + 1 : 0
  return Array.from({ length: Math.max(0, count) }, (_, i) => letter(start + i))
}

/** Longest combatant name the database accepts. */
export const COMBATANT_NAME_MAX = 80

/**
 * "Goblin" + "C" → "Goblin C". A lone creature with no label keeps its name.
 * Long names are shortened so the label still fits in the column.
 */
export function combatantName(base: string, label: string | null): string {
  const room = label ? COMBATANT_NAME_MAX - label.length - 1 : COMBATANT_NAME_MAX
  const name = base.trim().slice(0, room).trimEnd()
  return label ? `${name} ${label}` : name
}

/** Players see a band, not numbers. Mirrors `campaign_initiative()` in SQL. */
export function hpBand(hp: number, hpMax: number): HpBand | null {
  if (hpMax <= 0) return null
  if (hp <= 0) return 'Down'
  if (hp * 2 <= hpMax) return 'Bloodied'
  if (hp < hpMax) return 'Hurt'
  return 'Unhurt'
}

const byteOrder = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

type SortRow = Pick<Combatant, 'initiative' | 'created_at' | 'name' | 'id'> &
  Partial<Pick<Combatant, 'kind' | 'initiative_rolled'>>

/** Sort group: heroes still waiting for their Initiative, then (Nimble) heroes, then the rest. */
function sortGroup(r: SortRow, mode: InitiativeMode): number {
  if (r.kind === 'pc' && r.initiative_rolled === false) return 0
  return mode === 'nimble' && r.kind !== 'pc' ? 2 : 1
}

/**
 * Turn order. Heroes waiting for their Initiative come first; in Nimble mode every hero
 * acts before the creatures. Then highest initiative first; ties keep the order they were
 * added in, then go by name and id (copies added together share a timestamp), like the
 * ORDER BY of `campaign_initiative()`, so the GM and players see one order.
 */
export function sortOrder<T extends SortRow>(rows: T[], mode: InitiativeMode = 'classic'): T[] {
  return [...rows].sort(
    (a, b) =>
      sortGroup(a, mode) - sortGroup(b, mode) ||
      b.initiative - a.initiative ||
      byteOrder(a.created_at, b.created_at) ||
      byteOrder(a.name, b.name) ||
      byteOrder(a.id, b.id),
  )
}

export interface NewCombatant {
  campaign_id: string
  name: string
  kind: Combatant['kind']
  initiative: number
  init_mod: number
  hp: number
  hp_max: number
  ac: number
  campaign_npc_id: string
  portrait_path: string | null
  group_label: string | null
}

export interface AddCopiesOptions {
  count: number
  /** One roll for the whole group (common at the table) instead of one per creature. */
  sharedRoll?: boolean
  /** Labels already on the board for this NPC. */
  existingLabels?: (string | null)[]
  rng?: Rng
}

function npcKindToCombatant(kind: NpcKind): Combatant['kind'] {
  return kind === 'humanoid' ? 'npc' : 'monster'
}

/** Builds `count` combatant rows for an NPC: suffixed names, initiative rolled on a d20. */
export function buildCopies(npc: CampaignNpc, opts: AddCopiesOptions): NewCombatant[] {
  const count = Math.min(20, Math.max(1, Math.floor(opts.count)))
  const rng = opts.rng ?? Math.random
  const existing = opts.existingLabels ?? []
  // A single creature with nobody else of its kind on the board needs no letter.
  const labels: (string | null)[] =
    count === 1 && existing.length === 0 ? [null] : groupLabels(count, existing)
  const mod = npc.stat_block.initMod ?? 0
  // Nimble minions have no HP and drop to any damage: track them as 1 HP so the
  // strip can still mark them Down.
  const rawHp = Math.max(0, npc.stat_block.hp ?? 0)
  const hp = npc.system === 'nimble' && rawHp === 0 ? 1 : rawHp
  const ac = npc.stat_block.ac ?? 10
  // Roll only the dice used: each one shows in the dice tray.
  const shared = opts.sharedRoll ? rollDie(20, rng) + mod : 0
  return labels.map((label) => ({
    campaign_id: npc.campaign_id,
    name: combatantName(npc.name, label),
    kind: npcKindToCombatant(npc.kind),
    initiative: opts.sharedRoll ? shared : rollDie(20, rng) + mod,
    init_mod: mod,
    hp,
    hp_max: hp,
    ac,
    campaign_npc_id: npc.id,
    portrait_path: npc.image_path,
    group_label: label,
  }))
}

export interface NewSummonCombatant {
  name: string
  kind: 'summon'
  initiative: number
  init_mod: number
  hp: number
  hp_max: number
  ac: number
  character_id: null
  campaign_npc_id: null
  portrait_path: null
  group_label: null
  summon_key: string
}

export function summonKey(characterId: string, summonId: string): string {
  return `${characterId}:${summonId}`
}

export function summonOwner(key: string): string {
  return key.slice(0, key.indexOf(':'))
}

export function syncSummonRows(
  roster: Pick<RosterEntry, 'character_id' | 'character_name' | 'display_name' | 'summary'>[],
  rows: Pick<Combatant, 'id' | 'kind' | 'character_id' | 'initiative' | 'summon_key'>[],
): { add: NewSummonCombatant[]; remove: string[] } {
  const seated = new Set(rows.map((r) => r.summon_key).filter((k): k is string => !!k))
  const add: NewSummonCombatant[] = []
  const live = new Map<string, Set<string>>()
  for (const r of roster) {
    if (!r.character_id) continue
    const characterId = r.character_id
    const summons = r.summary?.summons ?? []
    live.set(characterId, new Set(summons.map((s) => summonKey(characterId, s.id))))
    const summoner = rows.find((c) => c.kind === 'pc' && c.character_id === characterId)
    if (!summoner) continue
    for (const s of summons) {
      if (!summonById(s.def)?.combatant) continue
      const key = summonKey(characterId, s.id)
      if (seated.has(key)) continue
      const hp = Math.max(0, s.hpMax)
      add.push({
        name: combatantName(`${s.name} (${r.character_name ?? r.display_name})`, null),
        kind: 'summon',
        initiative: summoner.initiative,
        init_mod: 0,
        hp,
        hp_max: hp,
        ac: 10,
        character_id: null,
        campaign_npc_id: null,
        portrait_path: null,
        group_label: null,
        summon_key: key,
      })
    }
  }
  const remove = rows
    .filter((c) => {
      if (!c.summon_key) return false
      const keys = live.get(summonOwner(c.summon_key))
      return !!keys && !keys.has(c.summon_key)
    })
    .map((c) => c.id)
  return { add, remove }
}

export function isSlainSummon(
  row: Pick<InitiativeRow, 'kind' | 'hp' | 'hp_max' | 'hp_band'>,
): boolean {
  if (row.kind !== 'summon') return false
  return row.hp_band === 'Down' || ((row.hp_max ?? 0) > 0 && row.hp !== null && row.hp <= 0)
}

export function downSummonKeys(
  rows: Pick<InitiativeRow, 'summon_key' | 'hp' | 'hp_max' | 'hp_band'>[],
): string[] {
  return rows
    .filter(
      (c) =>
        !!c.summon_key &&
        (c.hp_band === 'Down' || ((c.hp_max ?? 0) > 0 && c.hp !== null && c.hp <= 0)),
    )
    .map((c) => c.summon_key as string)
}

/**
 * Whose turn comes after `activeId` in the initiative order. Starts at the top
 * when nothing is active (or the active id is not in the order). Passing the
 * last creature wraps into the next round. Null when the order is empty.
 */
export function turnAfter(
  order: { id: string }[],
  activeId: string | null,
  round: number,
): { active: string; round: number; ended: string | null } | null {
  if (order.length === 0) return null
  const index = activeId === null ? -1 : order.findIndex((c) => c.id === activeId)
  if (index < 0) return { active: order[0]!.id, round, ended: null }
  const ended = activeId
  const next = index + 1
  if (next >= order.length) return { active: order[0]!.id, round: round + 1, ended }
  return { active: order[next]!.id, round, ended }
}

/**
 * The GM picks whose turn it is: `targetId`, `roundOffset` rounds from the current one
 * (the carousel shows the order repeating, so the copy picked says which round). The
 * acting creature's turn ends unless nothing was acting. Never below round 1. Null when
 * nothing would change or the target isn't in the order.
 */
export function turnTo(
  order: { id: string }[],
  activeId: string | null,
  round: number,
  targetId: string,
  roundOffset: number,
): { active: string; round: number; ended: string | null } | null {
  if (!order.some((c) => c.id === targetId)) return null
  const next = Math.max(1, round + Math.trunc(roundOffset))
  if (targetId === activeId && next === round) return null
  const acting = activeId !== null && order.some((c) => c.id === activeId)
  return { active: targetId, round: next, ended: acting ? activeId : null }
}

/** Start of the next round: the top of the order, whoever was left unacted. Null when empty. */
export function newRoundStart(
  order: { id: string }[],
  round: number,
): { active: string; round: number } | null {
  if (order.length === 0) return null
  return { active: order[0]!.id, round: round + 1 }
}

/**
 * HP after a change, held between 0 and `max`. A null `max` means the creature
 * has no HP to track (summons with no HP), so it stays at 0.
 */
export function clampHp(hp: number | null, delta: number, max: number | null): number {
  if (max === null) return 0
  return Math.min(max, Math.max(0, (hp ?? 0) + delta))
}

/** A new display name for a combatant, trimmed and capped; null when blank. */
export function renamedCombatant(raw: string): string | null {
  const name = raw.trim().slice(0, COMBATANT_NAME_MAX).trimEnd()
  return name ? name : null
}
