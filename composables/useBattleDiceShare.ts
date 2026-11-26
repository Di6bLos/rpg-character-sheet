import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '~/lib/supabase'
import {
  onDiceShown,
  onRollOutcome,
  showRemoteDice,
  type RollOutcome,
  type SharedRoll,
  type ShownRoll,
} from '~/utils/dice'

/** Rolls past this many in one click are not shared (a long stack of summons). */
const MAX_ROLLS = 24

/**
 * Everyone at a campaign board sees each other's dice: the rolls this screen makes
 * (`onDiceShown`, with what they came to from `onRollOutcome`) go out on the campaign's
 * broadcast channel, one message per click, and rolls from the others come in through
 * `showRemoteDice` for the dice tray, headed with who rolled (the seated hero's name). The
 * GM's rolls stay private: their screen shows the players' dice but sends none (the party
 * sees only the totals the stat block posts to chat). Rolls typed in by players who roll their own dice never reach the app, so
 * nothing is shared for them. Call once per board (the board shell).
 */
export function useBattleDiceShare() {
  const { campaignId, campaign, isGm, roster } = useCampaignBoard()
  const auth = useAuthStore()
  let channel: RealtimeChannel | null = null

  const from = computed(() => {
    const mine = campaign.value?.myCharacterId
    const entry = roster.value.find((r) => r.character_id === mine)
    return (
      entry?.character_name ??
      roster.value.find((r) => r.user_id === auth.userId)?.display_name ??
      'A player'
    )
  })

  let batch: ShownRoll[] = []
  let outcome: RollOutcome | null = null
  let queued = false

  function flush() {
    queued = false
    const rolls = batch.slice(0, MAX_ROLLS)
    const payload: SharedRoll = { from: from.value, rolls, outcome }
    batch = []
    outcome = null
    if (rolls.length && channel && !isGm.value)
      void channel.send({ type: 'broadcast', event: 'dice', payload })
  }

  function subscribe() {
    if (channel) void supabase.removeChannel(channel)
    channel = supabase
      .channel(`battle-dice-${campaignId.value}`)
      .on('broadcast', { event: 'dice' }, ({ payload }) => {
        const roll = payload as SharedRoll
        if (Array.isArray(roll?.rolls) && roll.rolls.length)
          showRemoteDice({
            from: String(roll.from || 'A player').slice(0, 60),
            rolls: roll.rolls,
            outcome: roll.outcome ?? null,
          })
      })
      .subscribe()
  }

  let stopDice: (() => void) | undefined
  let stopOutcome: (() => void) | undefined
  onMounted(() => {
    subscribe()
    // Batched like the dice tray: one click's rolls, and its outcome, go out together.
    stopDice = onDiceShown((roll) => {
      batch.push(roll)
      if (!queued) {
        queued = true
        queueMicrotask(flush)
      }
    })
    stopOutcome = onRollOutcome((next) => {
      if (!batch.length) return
      // Like the tray: a plain result line keeps the total already sent, with its fuller text.
      outcome =
        !outcome || next.total !== null
          ? next
          : { ...outcome, detail: next.detail || outcome.detail }
    })
  })
  watch(campaignId, subscribe)
  onBeforeUnmount(() => {
    stopDice?.()
    stopOutcome?.()
    if (channel) void supabase.removeChannel(channel)
    channel = null
  })
}
