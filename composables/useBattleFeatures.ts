import type { ComputedRef } from 'vue'
import { battleFeatures, type BattleFeatures } from '~/utils/battleFeatures'

/** The battle board's features for this campaign's system; Nimble's while it loads. */
export function useBattleFeatures(): ComputedRef<BattleFeatures> {
  const board = useCampaignBoardOptional()
  return computed(() => battleFeatures(board?.campaign.value?.system ?? 'nimble'))
}
