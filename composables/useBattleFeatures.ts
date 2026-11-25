import type { ComputedRef } from 'vue'
import type { GameSystem } from '~/types'
import { battleFeatures, type BattleFeatures } from '~/utils/battleFeatures'

/** This campaign's game system; Nimble while it loads (and outside a campaign board). */
export function useBattleSystem(): ComputedRef<GameSystem> {
  const board = useCampaignBoardOptional()
  return computed(() => board?.campaign.value?.system ?? 'nimble')
}

/** The battle board's features for this campaign's system; Nimble's while it loads. */
export function useBattleFeatures(): ComputedRef<BattleFeatures> {
  const system = useBattleSystem()
  return computed(() => battleFeatures(system.value))
}
