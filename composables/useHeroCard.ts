import type { Ref } from 'vue'
import type { HeroCard, RosterEntry } from '~/types'

/**
 * A seated hero's public stats (campaign_hero_card) for the battle board, with the
 * roster's live HP, Wounds and conditions laid over the card's snapshot. Reloads
 * when `characterId` changes. Shared by the stats modal and the GM's hero vitals.
 */
/** The roster's live pool (with temp mana) over the card's snapshot; null when there is none. */
function manaOf(
  live: { current: number; max: number; temp: number } | null,
  card: { current: number; max: number } | null,
): { current: number; max: number; temp: number } | null {
  const m = live ?? (card ? { ...card, temp: 0 } : null)
  return m && (m.max > 0 || m.temp > 0) ? m : null
}

export function useHeroCard(characterId: Ref<string | null>, roster: Ref<RosterEntry[]>) {
  const campaigns = useCampaignStore()
  const { campaignId } = useCampaignBoard()

  const card = ref<HeroCard | null>(null)
  const loading = ref(false)
  const error = ref('')
  let request = 0

  async function load(id: string) {
    const n = ++request
    loading.value = true
    error.value = ''
    card.value = null
    try {
      const found = await campaigns.heroCard(campaignId.value, id)
      if (n === request) card.value = found
    } catch {
      if (n === request) error.value = "Could not load this hero's stats."
    } finally {
      if (n === request) loading.value = false
    }
  }

  watch(
    characterId,
    (id) => {
      if (id) void load(id)
    },
    { immediate: true },
  )

  const entry = computed(() => roster.value.find((r) => r.character_id === characterId.value))
  const title = computed(() => card.value?.name ?? entry.value?.character_name ?? 'Hero')

  /** The roster refreshes with the turn; prefer its live numbers over the card's snapshot. */
  const live = computed(() => {
    const c = card.value
    const s = entry.value?.summary
    if (!c) return null
    return {
      hp: s?.hp ?? c.hp,
      hpMax: s?.hpMax ?? c.hpMax,
      tempHp: s?.tempHp ?? c.tempHp,
      wounds: s?.wounds ?? c.wounds,
      woundsMax: s?.woundsMax ?? c.woundsMax,
      conditions: s?.conditions ?? c.conditions,
      /** Null for heroes without a mana pool. */
      mana: manaOf(s?.mana ?? null, c.mana),
    }
  })

  return { card, loading, error, load, entry, title, live }
}

export type HeroLive = NonNullable<ReturnType<typeof useHeroCard>['live']['value']>
