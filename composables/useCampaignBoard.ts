import type { ComputedRef, InjectionKey, Ref } from 'vue'
import type { MyCampaign, RosterEntry } from '~/types'

export type BoardMode = 'board' | 'console'

export interface CampaignBoardContext {
  mode: BoardMode
  campaignId: ComputedRef<string>
  campaign: ComputedRef<MyCampaign | null>
  /** The signed-in user runs this campaign. */
  isGm: ComputedRef<boolean>
  /** GM controls are showing (the console; GMs never stay on the player board). */
  gmControls: ComputedRef<boolean>
  roster: Ref<RosterEntry[]>
  reloadRoster: () => Promise<void>
  /** `/campaigns/:id/board` or `/campaigns/:id/gm`. */
  base: ComputedRef<string>
}

const KEY: InjectionKey<CampaignBoardContext> = Symbol('campaign-board')

/** Created by the board / console parent page; every tab reads it with `useCampaignBoard()`. */
export function provideCampaignBoard(mode: BoardMode): CampaignBoardContext & {
  loading: Ref<boolean>
  load: () => Promise<void>
} {
  const route = useRoute()
  const store = useCampaignStore()
  const snackbar = useSnackbarStore()

  const campaignId = computed(() => String(route.params.id))
  const campaign = computed(() => store.byId(campaignId.value))
  const isGm = computed(() => campaign.value?.myRole === 'gm')
  const gmControls = computed(() => isGm.value && mode === 'console')
  const roster = ref<RosterEntry[]>([])
  const loading = ref(true)
  const base = computed(
    () => `/campaigns/${campaignId.value}/${mode === 'console' ? 'gm' : 'board'}`,
  )

  async function reloadRoster() {
    roster.value = await store.roster(campaignId.value)
  }

  async function load() {
    loading.value = true
    try {
      await store.fetchMine()
      if (campaign.value) await reloadRoster()
    } catch (err) {
      snackbar.error(err, 'Could not load the campaign')
    } finally {
      loading.value = false
    }
  }

  const ctx: CampaignBoardContext = {
    mode,
    campaignId,
    campaign,
    isGm,
    gmControls,
    roster,
    reloadRoster,
    base,
  }
  provide(KEY, ctx)
  return { ...ctx, loading, load }
}

export function useCampaignBoard(): CampaignBoardContext {
  const ctx = inject(KEY)
  if (!ctx) throw new Error('useCampaignBoard() must be used inside a campaign board page')
  return ctx
}
