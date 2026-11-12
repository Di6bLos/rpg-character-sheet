import type { CampaignNpc, Combatant, HpBand, NpcKind } from '~/types'
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

/** "Goblin" + "C" → "Goblin C". A lone creature with no label keeps its name. */
export function combatantName(base: string, label: string | null): string {
  return label ? `${base} ${label}` : base
}

/** Players see a band, not numbers. Mirrors `campaign_initiative()` in SQL. */
export function hpBand(hp: number, hpMax: number): HpBand | null {
  if (hpMax <= 0) return null
  if (hp <= 0) return 'Down'
  if (hp * 2 <= hpMax) return 'Bloodied'
  if (hp < hpMax) return 'Hurt'
  return 'Unhurt'
}

/** Highest initiative first; ties keep the order they were added in. */
export function sortOrder<T extends Pick<Combatant, 'initiative' | 'created_at'>>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) => b.initiative - a.initiative || a.created_at.localeCompare(b.created_at),
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
  const hp = Math.max(0, npc.stat_block.hp ?? 0)
  const ac = npc.stat_block.ac ?? 10
  const shared = rollDie(20, rng) + mod
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
