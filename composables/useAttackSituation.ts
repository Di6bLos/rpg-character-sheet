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
}

/** The creature the hero is attacking, shared like the situation. */
export function useAttackTarget() {
  const { draft } = useSheet<NimbleSheet>()
  return useState<AttackTarget>(`nimble-target-${draft.value.id}`, () => ({
    armor: 'none',
    vulnerable: false,
    sundered: false,
  }))
}
