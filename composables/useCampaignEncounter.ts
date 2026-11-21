import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '~/lib/supabase'
import type { InitiativeMode, InitiativeRow } from '~/types'

let seq = 0

/** The hero's own row on the tracker: its Initiative, and whether it has arrived yet. */
export interface SeatedInitiative {
  initiative: number
  rolled: boolean
}

/**
 * The GM's encounter as one hero's sheet sees it, kept live (every combatant change
 * touches the encounter row): the campaign's initiative rules, whether the hero is
 * seated on the tracker, the hero's Initiative there, whose turn it is (as a character
 * id; null between turns or for a creature) and the round while a turn is running.
 * All are null while there is no campaign or before they load; a failed load keeps the
 * last value.
 */
export function useCampaignEncounter(
  campaignId: Ref<string | null>,
  characterId: Ref<string | null>,
): {
  mode: Ref<InitiativeMode | null>
  seated: Ref<boolean | null>
  hero: Ref<SeatedInitiative | null>
  turnCharacterId: Ref<string | null>
  round: Ref<number | null>
} {
  const mode = ref<InitiativeMode | null>(null)
  const seated = ref<boolean | null>(null)
  const hero = ref<SeatedInitiative | null>(null)
  const turnCharacterId = ref<string | null>(null)
  const round = ref<number | null>(null)
  const id = ++seq
  let channel: RealtimeChannel | null = null
  let timer: ReturnType<typeof setTimeout> | undefined

  async function load(campaign: string) {
    const [enc, rows] = await Promise.all([
      supabase
        .from('encounters')
        .select('initiative_mode, round, active_combatant')
        .eq('campaign_id', campaign)
        .maybeSingle(),
      supabase.rpc('campaign_initiative', { p_campaign: campaign }),
    ])
    if (campaignId.value !== campaign) return
    // No encounter row yet: the default rules.
    if (!enc.error)
      mode.value = (enc.data?.initiative_mode as InitiativeMode | undefined) ?? 'nimble'
    if (!rows.error) {
      const list = (rows.data ?? []) as InitiativeRow[]
      const mine = list.find((r) => r.kind === 'pc' && r.character_id === characterId.value)
      seated.value = !!mine
      hero.value = mine
        ? { initiative: mine.initiative, rolled: mine.initiative_rolled ?? true }
        : null
      if (!enc.error) {
        const active = enc.data?.active_combatant as string | null | undefined
        const acting = active ? list.find((r) => r.id === active) : undefined
        turnCharacterId.value = acting?.character_id ?? null
        round.value = active ? ((enc.data?.round as number | undefined) ?? 1) : null
      }
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
      hero.value = null
      turnCharacterId.value = null
      round.value = null
      if (!campaign) return
      void load(campaign)
      // Read again once the listener is live (and after every reconnect), so a change
      // made while joining or while disconnected isn't missed.
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
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') void load(campaign)
        })
    },
    { immediate: true },
  )
  onBeforeUnmount(stop)

  return { mode, seated, hero, turnCharacterId, round }
}
