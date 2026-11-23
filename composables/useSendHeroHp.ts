import { supabase } from '~/lib/supabase'
import { keyedQueue } from '~/utils/keyedQueue'

const ROSTER_AFTER_MS = 4000

// Shared by every caller (encounter cards, stats modal), so one hero's changes go out in
// click order whichever control sent them.
const queue = keyedQueue()

/**
 * The GM's HP change for a hero: a `hero_hp_changes` pickup that the hero's own sheet
 * applies (useHeroHpChanges), so the sheet stays the one place hero HP lives. Each click
 * is its own row, queued per hero, so pressing −1 three times delivers −3. The roster
 * refreshes once the sheet has had time to autosave. Used by the stats modal and the
 * encounter grid's hero cards.
 */
export function useSendHeroHp() {
  const snackbar = useSnackbarStore()
  const { campaignId, reloadRoster } = useCampaignBoard()
  const inFlight = ref(0)
  /** For the UI only: a change from this caller is still on its way. */
  const sending = computed(() => inFlight.value > 0)

  /** `amount` < 0 is damage (with `crit`), > 0 healing. False when it failed. */
  async function send(characterId: string, name: string, amount: number, crit = false) {
    if (!amount) return false
    const row = {
      campaign_id: campaignId.value,
      character_id: characterId,
      amount,
      crit: amount < 0 && crit,
    }
    inFlight.value++
    try {
      const { error } = await queue.run(
        characterId,
        async () => await supabase.from('hero_hp_changes').insert(row),
      )
      if (error) {
        snackbar.error(error, `Could not send the HP change to ${name}`)
        return false
      }
    } catch (err) {
      // The call itself threw (offline, a client error): report it the same way, since
      // callers fire and forget.
      snackbar.error(err, `Could not send the HP change to ${name}`)
      return false
    } finally {
      inFlight.value--
    }
    setTimeout(() => void reloadRoster().catch(() => undefined), ROSTER_AFTER_MS)
    return true
  }

  return { sending, send }
}
