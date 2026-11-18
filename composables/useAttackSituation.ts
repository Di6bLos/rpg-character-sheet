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

/** The armor of the creature the hero is attacking, shared like the situation. */
export function useTargetArmor() {
  const { draft } = useSheet<NimbleSheet>()
  return useState<TargetArmor>(`nimble-target-armor-${draft.value.id}`, () => 'none')
}
