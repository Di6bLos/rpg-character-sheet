import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '~/lib/supabase'
import type { HeroHpChange } from '~/types'
import { applyHpChangeFor, freshChanges } from '~/utils/heroHpChange'

type Row = Pick<HeroHpChange, 'id' | 'amount' | 'crit' | 'created_at'>

/**
 * Picks up HP changes the GM sent this hero (`hero_hp_changes`, from the battle
 * board's stats modal) while its sheet is open or the next time it loads, applies
 * them with the sheet's own system's rules and clears them. Same pattern as useHeroEffects.
 */
export function useHeroHpChanges() {
  const { draft, canEdit, held, say } = useSheet()
  let channel: RealtimeChannel | null = null
  const taken = new Set<string>()

  async function take(rows: Row[]) {
    if (!canEdit.value || held.value) return
    const fresh = freshChanges(rows, taken)
    if (!fresh.length) return
    // Claim the rows by deleting them first, and apply only the ones this client
    // deleted: another open copy of the sheet (a second tab) can't apply them twice.
    const { data, error } = await supabase
      .from('hero_hp_changes')
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
    for (const row of fresh) {
      if (!claimed.has(row.id)) continue
      const { system, sheet, level } = draft.value
      const message = applyHpChangeFor(system, sheet, level, row)
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
      .from('hero_hp_changes')
      .select('id, amount, crit, created_at')
      .eq('character_id', id)
      .order('created_at')
    await take((data ?? []) as Row[])
  }

  // Read what is waiting now, and again each time the listener is (re)connected, so a
  // change sent while joining or while disconnected isn't missed; `taken` drops repeats.
  function start() {
    if (channel) return
    const id = draft.value.id
    serial(() => catchUp(id))
    channel = supabase
      .channel(`hero-hp-changes-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'hero_hp_changes',
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
    watch(held, (on) => {
      if (!on && channel) serial(() => catchUp(draft.value.id))
    })
  })

  onBeforeUnmount(() => {
    if (channel) void supabase.removeChannel(channel)
  })
}
