import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '~/lib/supabase'
import type { HeroConditionChange } from '~/types'
import type { NimbleSheet } from '~/types/sheets'
import { keyedQueue } from '~/utils/keyedQueue'
import {
  applyConditionChange,
  freshConditionChanges,
  lastPerCondition,
} from '~/utils/heroConditionChange'
import { CONDITION_ENDS } from '~/utils/nimbleConditions'

type Row = Pick<HeroConditionChange, 'id' | 'condition' | 'add' | 'created_at'>

const ROSTER_AFTER_MS = 4000

// Shared by every caller, so one hero's changes go out in click order.
const queue = keyedQueue()

/**
 * The GM's condition change for a hero, through `gm_set_hero_condition`: it writes the
 * hero's saved sheet at once (so it holds while the player is away) and leaves a
 * `hero_condition_changes` pickup for a sheet that is open now (useHeroConditionChanges),
 * which applies it live. The roster refreshes now, and again once an open sheet has had
 * time to autosave.
 */
export function useSendHeroCondition() {
  const snackbar = useSnackbarStore()
  const { campaignId, reloadRoster } = useCampaignBoard()

  /** False when it failed. */
  async function send(characterId: string, name: string, condition: string, add: boolean) {
    const args = {
      p_campaign: campaignId.value,
      p_character: characterId,
      p_condition: condition,
      p_add: add,
      p_end: add ? (CONDITION_ENDS[condition] ?? null) : null,
    }
    try {
      const { error } = await queue.run(
        characterId,
        async () => await supabase.rpc('gm_set_hero_condition', args),
      )
      if (error) {
        snackbar.error(error, `Could not change ${name}'s conditions`)
        return false
      }
    } catch (err) {
      snackbar.error(err, `Could not change ${name}'s conditions`)
      return false
    }
    const refresh = () => void reloadRoster().catch(() => undefined)
    refresh()
    setTimeout(refresh, ROSTER_AFTER_MS)
    return true
  }

  return { send }
}

/**
 * Picks up condition changes the GM sent this hero while its sheet is open or the next
 * time it loads, applies them with the sheet's own rules and clears them. Same pattern
 * as useHeroHpChanges: claim by deleting first, so a second open copy can't apply twice.
 */
export function useHeroConditionChanges() {
  const { draft, canEdit, say } = useSheet<NimbleSheet>()
  let channel: RealtimeChannel | null = null
  const taken = new Set<string>()

  async function take(rows: Row[]) {
    if (!canEdit.value) return
    const fresh = freshConditionChanges(rows, taken)
    if (!fresh.length) return
    const { data, error } = await supabase
      .from('hero_condition_changes')
      .delete()
      .in(
        'id',
        fresh.map((r) => r.id),
      )
      .select('id')
    if (error) {
      // Left for the next load.
      for (const r of fresh) taken.delete(r.id)
      return
    }
    const claimed = new Set((data ?? []).map((r: { id: string }) => r.id))
    for (const row of lastPerCondition(fresh.filter((r) => claimed.has(r.id)))) {
      const message = applyConditionChange(draft.value.sheet, row)
      if (message) say(message)
    }
  }

  // One pickup at a time, in arrival order: claim-and-apply runs serially, so a heal
  // sent after damage can't land first.
  let queue: Promise<void> = Promise.resolve()
  function serial(job: () => Promise<void>) {
    queue = queue.then(job).catch(() => undefined)
  }

  /** Reads what is waiting, oldest first. */
  async function catchUp(id: string) {
    const { data } = await supabase
      .from('hero_condition_changes')
      .select('id, condition, add, created_at')
      .eq('character_id', id)
      .order('created_at')
    await take((data ?? []) as Row[])
  }

  // Read what is waiting now, and again each time the listener is (re)connected, so a
  // change sent while joining or while disconnected isn't missed; `taken` drops repeats.
  function start() {
    if (channel || draft.value.system !== 'nimble') return
    const id = draft.value.id
    serial(() => catchUp(id))
    channel = supabase
      .channel(`hero-condition-changes-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'hero_condition_changes',
          filter: `character_id=eq.${id}`,
        },
        (payload) => serial(() => take([payload.new as Row])),
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') serial(() => catchUp(id))
      })
  }

  onMounted(() => {
    watch(
      canEdit,
      (on) => {
        if (on) start()
      },
      { immediate: true },
    )
  })

  onBeforeUnmount(() => {
    if (channel) void supabase.removeChannel(channel)
  })
}
