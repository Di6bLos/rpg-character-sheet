import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '~/lib/supabase'
import type { InitiativeMode, InitiativeRow } from '~/types'

let seq = 0

/**
 * The GM's encounter as one hero's sheet sees it, kept live (every combatant change
 * touches the encounter row): the campaign's initiative rules, and whether the hero is
 * seated on the tracker. Both are null while there is no campaign or before they load;
 * a failed load keeps the last value.
 */
export function useCampaignEncounter(
  campaignId: Ref<string | null>,
  characterId: Ref<string | null>,
): { mode: Ref<InitiativeMode | null>; seated: Ref<boolean | null> } {
  const mode = ref<InitiativeMode | null>(null)
  const seated = ref<boolean | null>(null)
  const id = ++seq
  let channel: RealtimeChannel | null = null
  let timer: ReturnType<typeof setTimeout> | undefined

  async function load(campaign: string) {
    const [enc, rows] = await Promise.all([
      supabase
        .from('encounters')
        .select('initiative_mode')
        .eq('campaign_id', campaign)
        .maybeSingle(),
      supabase.rpc('campaign_initiative', { p_campaign: campaign }),
    ])
    if (campaignId.value !== campaign) return
    // No encounter row yet: the default rules.
    if (!enc.error)
      mode.value = (enc.data?.initiative_mode as InitiativeMode | undefined) ?? 'nimble'
    if (!rows.error) {
      const hero = characterId.value
      seated.value = ((rows.data ?? []) as InitiativeRow[]).some(
        (r) => r.kind === 'pc' && r.character_id === hero,
      )
    }
  }

  /** Adding a party arrives as a burst of changes: load once when it settles. */
  function reload(campaign: string) {
    clearTimeout(timer)
    timer = setTimeout(() => void load(campaign), 150)
  }

  function stop() {
    clearTimeout(timer)
    if (channel) void supabase.removeChannel(channel)
    channel = null
  }

  watch(
    [campaignId, characterId],
    ([campaign]) => {
      stop()
      mode.value = null
      seated.value = null
      if (!campaign) return
      void load(campaign)
      channel = supabase
        .channel(`campaign-encounter-${campaign}-${id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'encounters',
            filter: `campaign_id=eq.${campaign}`,
          },
          () => reload(campaign),
        )
        .subscribe()
    },
    { immediate: true },
  )
  onBeforeUnmount(stop)

  return { mode, seated }
}
