import type { CreatureType, NpcKind, NpcSourceFilter } from '~/types'

export const CREATURE_TYPES: CreatureType[] = [
  'Aberration',
  'Beast',
  'Celestial',
  'Construct',
  'Dragon',
  'Elemental',
  'Fey',
  'Fiend',
  'Giant',
  'Humanoid',
  'Monstrosity',
  'Ooze',
  'Plant',
  'Undead',
]

export function isCreatureType(value: unknown): value is CreatureType {
  return typeof value === 'string' && (CREATURE_TYPES as string[]).includes(value)
}

/**
 * Best guess from a free-text type ("Undead knight", "humanoid (any)"), falling back to
 * Humanoid for humanoid NPCs. Mirrors the backfill in the `npc_creature_type` migration.
 */
export function inferCreatureType(
  type: string | undefined,
  kind?: NpcKind,
): CreatureType | undefined {
  const text = (type ?? '').trim().toLowerCase()
  const hit = CREATURE_TYPES.find((t) => text.startsWith(t.toLowerCase()))
  return hit ?? (kind === 'humanoid' ? 'Humanoid' : undefined)
}

/** Options for the Source dropdown. */
export const SOURCE_FILTERS: { value: NpcSourceFilter | null; label: string }[] = [
  { value: null, label: 'All sources' },
  { value: 'official', label: 'Official' },
  { value: 'homebrew', label: 'Homebrew' },
  { value: 'ai', label: 'AI drafts' },
]
