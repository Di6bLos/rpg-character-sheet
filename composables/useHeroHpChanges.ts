import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '~/lib/supabase'
import type { HeroHpChange } from '~/types'
import type { NimbleSheet } from '~/types/sheets'
import { applyHpChange, freshChanges } from '~/utils/heroHpChange'

type Row = Pick<HeroHpChange, 'id' | 'amount' | 'crit' | 'created_at'>

/**
 * Picks up HP changes the GM sent this hero (`hero_hp_changes`, from the battle
 * board's stats modal) while its sheet is open or the next time it loads, applies
 * them with the sheet's own rules and clears them. Same pattern as useHeroEffects.
 */
export function useHeroHpChanges() {
  const { draft, canEdit, say } = useSheet<NimbleSheet>()
  let channel: RealtimeChannel | null = null
  const taken = new Set<string>()

  async function take(rows: Row[]) {
    if (!canEdit.value) return
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
      const message = applyHpChange(draft.value.sheet, draft.value.level, row)
      if (message) say(message)
    }
  }

  // Listen first, then read what is waiting, so nothing slips between the two.
  async function start() {
    if (channel || draft.value.system !== 'nimble') return
    const id = draft.value.id
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
        (payload) => void take([payload.new as Row]),
      )
      .subscribe()
    const { data } = await supabase
      .from('hero_hp_changes')
      .select('id, amount, crit, created_at')
      .eq('character_id', id)
    await take((data ?? []) as Row[])
  }

  onMounted(() => {
    watch(
      canEdit,
      (on) => {
        if (on) void start()
      },
      { immediate: true },
    )
  })

  onBeforeUnmount(() => {
    if (channel) void supabase.removeChannel(channel)
  })
}
