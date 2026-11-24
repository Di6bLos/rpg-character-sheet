import type { ComputedRef, InjectionKey } from 'vue'
import type { Character, MyCampaign } from '~/types'
import type { AnySheet } from '~/types/sheets'
import { plural, sessionDate } from '~/utils/format'
import { systemLabel } from '~/utils/systems'

export interface BoardTab {
  id: string
  label: string
}

export interface BoardNav {
  /** "Nimble · GM Dana · 3 players · next session …" */
  meta: ComputedRef<string>
  tabs: ComputedRef<BoardTab[]>
  isCurrent: (id: string) => boolean
  /** Campaigns this user can switch to from here (the console only lists ones they run). */
  switchable: ComputedRef<MyCampaign[]>
  /** Link to the same tab in another campaign. */
  switchTo: (id: string) => string
  /** The player's characters that can sit at this table. */
  myOptions: ComputedRef<Character<AnySheet>[]>
  /** Seats the chosen character (a `<select>` change event; empty value unseats). */
  seat: (event: Event) => Promise<void>
}

const KEY: InjectionKey<BoardNav> = Symbol('board-nav')

/**
 * The campaign frame's tabs, campaign switcher and "Playing as", created once by
 * `components/board/Shell.vue` and read by the battle board's bar (`useBoardNav()`),
 * which shows them in place of the Shell header on the desktop battle board.
 */
export function provideBoardNav(): BoardNav {
  const route = useRoute()
  const store = useCampaignStore()
  const characters = useCharacterStore()
  const snackbar = useSnackbarStore()
  const { mode, campaign, campaignId, base, reloadRoster } = useCampaignBoard()

  const meta = computed(() => {
    const c = campaign.value
    if (!c) return ''
    return [
      systemLabel(c.system),
      `GM ${c.gmName}`,
      plural(c.playerCount, 'player'),
      c.next_session_at ? `next session ${sessionDate(c.next_session_at)}` : '',
    ]
      .filter(Boolean)
      .join(' · ')
  })

  const switchable = computed(() =>
    mode === 'console' ? store.campaigns.filter((c) => c.myRole === 'gm') : store.campaigns,
  )

  const tabs = computed(() => {
    const list: BoardTab[] = [
      { id: 'battle', label: 'Battle' },
      { id: 'journal', label: 'Journal' },
      { id: 'maps', label: 'Maps & images' },
    ]
    if (mode === 'console') list.push({ id: 'npcs', label: 'NPCs' })
    return list
  })

  function isCurrent(id: string) {
    return route.path === `${base.value}/${id}` || route.path.startsWith(`${base.value}/${id}/`)
  }

  /** Same tab in another campaign: its console if you run it, its board if you play in it. */
  function switchTo(id: string) {
    const current = tabs.value.find((t) => isCurrent(t.id))?.id ?? 'battle'
    const target = store.byId(id)
    const gm = target?.myRole === 'gm'
    const tab = !gm && current === 'npcs' ? 'battle' : current
    return `/campaigns/${id}/${gm ? 'gm' : 'board'}/${tab}`
  }

  const myOptions = computed(() =>
    characters.characters.filter((c) => c.system === campaign.value?.system),
  )
  onMounted(() => void characters.fetchMine())

  async function seat(event: Event) {
    const value = (event.target as HTMLSelectElement).value || null
    try {
      await store.seatCharacter(campaignId.value, value)
      await reloadRoster()
      snackbar.show(value ? 'Character seated at this table' : 'Character removed from this table')
    } catch (err) {
      snackbar.error(err, 'Could not change your character')
    }
  }

  const nav: BoardNav = { meta, tabs, isCurrent, switchable, switchTo, myOptions, seat }
  provide(KEY, nav)
  return nav
}

export function useBoardNav(): BoardNav {
  const nav = inject(KEY)
  if (!nav) throw new Error('useBoardNav() must be used inside BoardShell')
  return nav
}
