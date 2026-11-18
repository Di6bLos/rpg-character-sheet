import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '~/lib/supabase'
import type { RosterEntry } from '~/types'
import type { NimbleSheet } from '~/types/sheets'
import { addCondition } from '~/utils/nimbleConditions'

interface HeroEffect {
  id: string
  effect: string
  from_name: string
}

/**
 * The Help reaction (Core p. 14) aimed at another hero in the campaign: `allies`
 * lists them, `help` pays the reaction and leaves a "Helped" status for them in
 * `hero_effects`, which their own sheet picks up (see `useHeroEffects`).
 */
export function useHelpAlly(options: { onResult?: (message: string) => void } = {}) {
  const { draft, campaignId, canEdit, say } = useSheet<NimbleSheet>()
  const store = useCampaignStore()
  const { toggleReaction, reactions } = useNimbleActions(options)
  const roster = ref<RosterEntry[]>([])

  watch(
    campaignId,
    async (id) => {
      roster.value = id ? await store.roster(id).catch(() => []) : []
    },
    { immediate: true },
  )

  const allies = computed(() =>
    roster.value
      .filter((r) => r.character_id && r.character_id !== draft.value.id)
      .map((r) => ({ id: r.character_id!, name: r.character_name ?? r.display_name })),
  )

  function report(message: string) {
    say(message)
    options.onResult?.(message)
  }

  async function help(characterId: string) {
    const ally = allies.value.find((a) => a.id === characterId)
    const campaign = campaignId.value
    if (!canEdit.value || !ally || !campaign) return
    if (reactions.value.find((r) => r.name === 'Help')?.used) return
    toggleReaction('Help')
    report(`Help: ${ally.name} has advantage on their next roll.`)
    const { error } = await supabase.from('hero_effects').insert({
      campaign_id: campaign,
      character_id: ally.id,
      effect: 'Helped',
      from_name: draft.value.name,
    })
    if (error) {
      toggleReaction('Help')
      report(`Could not reach ${ally.name}: Help not used.`)
    }
  }

  return { allies, help }
}

/**
 * Picks up statuses other heroes gave this one (Helped) while its sheet is open
 * or the next time it loads, adds them to the sheet and clears them.
 */
export function useHeroEffects() {
  const { draft, canEdit, say } = useSheet<NimbleSheet>()
  let channel: RealtimeChannel | null = null

  async function take(rows: HeroEffect[]) {
    if (!canEdit.value || !rows.length) return
    for (const row of rows) {
      addCondition(draft.value.sheet, row.effect)
      say(`${row.from_name || 'An ally'} Helped you: advantage on your next roll.`)
    }
    await supabase
      .from('hero_effects')
      .delete()
      .in(
        'id',
        rows.map((r) => r.id),
      )
  }

  onMounted(async () => {
    if (!canEdit.value || draft.value.system !== 'nimble') return
    const id = draft.value.id
    const { data } = await supabase
      .from('hero_effects')
      .select('id, effect, from_name')
      .eq('character_id', id)
    await take((data ?? []) as HeroEffect[])
    channel = supabase
      .channel(`hero-effects-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'hero_effects',
          filter: `character_id=eq.${id}`,
        },
        (payload) => void take([payload.new as HeroEffect]),
      )
      .subscribe()
  })

  onBeforeUnmount(() => {
    if (channel) void supabase.removeChannel(channel)
  })
}
