import type { GameSystem } from '~/types'

export const SYSTEMS: { id: GameSystem; label: string; long: string }[] = [
  { id: 'dnd5e', label: 'D&D 5e', long: 'Dungeons & Dragons' },
  { id: 'pf2e', label: 'Pathfinder 2e', long: 'Pathfinder 2e' },
  { id: 'nimble', label: 'Nimble', long: 'Nimble' },
]

export function systemLabel(id: GameSystem | null | undefined): string {
  return SYSTEMS.find((s) => s.id === id)?.label ?? 'Any system'
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0] ?? '?'
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase()
}
