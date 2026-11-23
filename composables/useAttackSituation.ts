import type { NimbleSheet } from '~/types/sheets'
import type { TargetArmor } from '~/utils/nimbleTargetArmor'

/**
 * Situational conditions (Taunted, Frightened) the player marks as applying to
 * their attacks right now, shared by the sheet and the board's action panel.
 */
export function useAttackSituation() {
  const { draft } = useSheet<NimbleSheet>()
  return useState<string[]>(`nimble-situation-${draft.value.id}`, () => [])
}

export interface AttackTarget {
  armor: TargetArmor
  /** The target is vulnerable to this attack's damage: armor ignored, or double if unarmored. */
  vulnerable: boolean
  /** Sunder Armor: melee attacks ignore its armor until the start of your next turn. */
  sundered: boolean
  /** Ignite needs it; Flame Dart's crit sets it, Ignite's hit ends it. */
  smoldering: boolean
  /** Slowed, Dazed, Grappled, Restrained or Prone: Shatter's max dice crit against it. */
  hampered: boolean
  /** Hampered only by a spell's Slowed: it ends at the start of your next turn. */
  hamperedUntilTurn?: boolean
}

/** The creature the hero is attacking, shared like the situation. */
export function useAttackTarget() {
  const { draft } = useSheet<NimbleSheet>()
  return useState<AttackTarget>(`nimble-target-${draft.value.id}`, () => ({
    armor: 'none',
    vulnerable: false,
    sundered: false,
    smoldering: false,
    hampered: false,
  }))
}

/**
 * Own-dice attacks whose crit the player can still report with It crit:
 * `w:<weapon>` and `spell:<name>` once after that attack, `minions` once per
 * minion commanded. Cleared when the turn changes.
 */
export function useCritReady() {
  const { draft } = useSheet<NimbleSheet>()
  return useState<Record<string, number>>(`nimble-crit-ready-${draft.value.id}`, () => ({}))
}

/** Uses up one reported crit for `key`; false when none is waiting. */
export function spendCrit(ready: Ref<Record<string, number>>, key: string): boolean {
  const left = ready.value[key] ?? 0
  if (left < 1) return false
  ready.value = { ...ready.value, [key]: left - 1 }
  return true
}
