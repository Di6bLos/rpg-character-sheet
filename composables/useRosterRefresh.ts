import type { Ref } from 'vue'

const ROSTER_REFRESH_MS = 30_000

/**
 * Roster HP and conditions change on the players' sheets: reload the campaign roster on
 * every turn change (`activeId`), and every 30 seconds while the tab is visible so it
 * stays current outside combat. Used by the Party and Battle tabs.
 */
export function useRosterRefresh(activeId: Readonly<Ref<string | null>>) {
  const { reloadRoster } = useCampaignBoard()

  watch(activeId, () => void reloadRoster())

  // A background refresh that fails just waits for the next one.
  function refresh() {
    if (document.visibilityState === 'visible') reloadRoster().catch(() => undefined)
  }

  let timer: ReturnType<typeof setInterval> | null = null
  onMounted(() => {
    timer = setInterval(refresh, ROSTER_REFRESH_MS)
    document.addEventListener('visibilitychange', refresh)
  })
  onBeforeUnmount(() => {
    if (timer) clearInterval(timer)
    document.removeEventListener('visibilitychange', refresh)
  })
}
