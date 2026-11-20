import type { CampaignNpc } from '~/types'
import type { TurnRow, useInitiative } from '~/composables/useInitiative'

/** Fetches already started for a campaign and set of linked ids (two callers, one fetch). */
let fetchedKey = ''

/**
 * The GM's campaign NPCs behind linked combatants (`campaign_npc_id`), from the NPC
 * store (the console's NPCs page fills the same list). Fetches when the board shows a
 * linked combatant the store doesn't have yet, once per set of ids.
 */
export function useCombatantNpcs(init: ReturnType<typeof useInitiative>) {
  const store = useNpcStore()
  const { campaignId } = useCampaignBoard()

  const byId = computed(() => {
    if (store.campaignId !== campaignId.value) return new Map<string, CampaignNpc>()
    return new Map(store.campaignNpcs.map((n) => [n.id, n]))
  })

  const missing = computed(() =>
    [
      ...new Set(
        init.rows.value
          .map((r) => r.campaign_npc_id)
          .filter((id): id is string => !!id && !byId.value.has(id)),
      ),
    ]
      .sort()
      .join(','),
  )

  watch(
    [campaignId, missing],
    ([cid, ids]) => {
      const key = `${cid}:${ids}`
      if (!ids || key === fetchedKey) return
      fetchedKey = key
      store.fetchCampaign(cid).catch(() => {
        fetchedKey = ''
      })
    },
    { immediate: true },
  )

  function npcFor(c: TurnRow | null | undefined): CampaignNpc | undefined {
    return c?.campaign_npc_id ? byId.value.get(c.campaign_npc_id) : undefined
  }

  return { npcFor }
}

/** A headline value from a stat block's top lines ("Armor", "Speed"), case-insensitive. */
export function statTop(npc: CampaignNpc | undefined, label: string): string {
  const want = label.toLowerCase()
  return npc?.stat_block.top?.find(([k]) => k.toLowerCase() === want)?.[1]?.trim() ?? ''
}
