import { supabase } from '~/lib/supabase'

const ROSTER_AFTER_MS = 4000

/**
 * The GM's HP change for a hero: a `hero_hp_changes` pickup that the hero's own sheet
 * applies (useHeroHpChanges), so the sheet stays the one place hero HP lives. The
 * roster refreshes once the sheet has had time to autosave. Used by the stats modal
 * and the encounter grid's hero cards.
 */
export function useSendHeroHp() {
  const snackbar = useSnackbarStore()
  const { campaignId, reloadRoster } = useCampaignBoard()
  const sending = ref(false)

  /** `amount` < 0 is damage (with `crit`), > 0 healing. False when it failed. */
  async function send(characterId: string, name: string, amount: number, crit = false) {
    if (!amount || sending.value) return false
    sending.value = true
    const { error } = await supabase.from('hero_hp_changes').insert({
      campaign_id: campaignId.value,
      character_id: characterId,
      amount,
      crit: amount < 0 && crit,
    })
    sending.value = false
    if (error) {
      snackbar.error(error, `Could not send the HP change to ${name}`)
      return false
    }
    setTimeout(() => void reloadRoster().catch(() => undefined), ROSTER_AFTER_MS)
    return true
  }

  return { sending, send }
}
