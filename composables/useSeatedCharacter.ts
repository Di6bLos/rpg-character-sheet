import type { Character } from '~/types'
import type { AnySheet } from '~/types/sheets'

/**
 * The player's own hero seated in this Nimble campaign (null for the GM, other
 * systems unless `anySystem`, or while loading), loaded for the board's sheet editor, and
 * whether they may edit it. `anySystem` (5e, PF2e boards) loads it for the GM's HP and
 * condition pickups only.
 */
export function useSeatedCharacter(failure: string, options: { anySystem?: boolean } = {}) {
  const auth = useAuthStore()
  const characters = useCharacterStore()
  const snackbar = useSnackbarStore()
  const { campaign, isGm } = useCampaignBoard()

  const characterId = computed(() =>
    !isGm.value && (options.anySystem || campaign.value?.system === 'nimble')
      ? (campaign.value?.myCharacterId ?? null)
      : null,
  )
  const character = ref<Character<AnySheet> | null>(null)
  const canEdit = computed(() => character.value?.user_id === auth.userId && !auth.isSuspended)

  watch(
    characterId,
    async (id) => {
      character.value = null
      if (!id) return
      try {
        // A layout swap unmounts the old sheet editor, which saves as it goes; wait for
        // the flush to finish and that save to land so the load gets the saved copy (a
        // stalled save is given a few seconds, then the load goes ahead).
        await nextTick()
        await sheetSaves.settled(id)
        if (characterId.value !== id) return
        const found = await characters.fetchOne(id)
        if (characterId.value === id) character.value = found
      } catch (err) {
        snackbar.error(err, failure)
      }
    },
    { immediate: true },
  )

  return { character, canEdit }
}
