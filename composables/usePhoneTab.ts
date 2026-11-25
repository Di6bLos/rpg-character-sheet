import type { Ref } from 'vue'
import { pickTab, type PhoneRole, type PhoneTab } from '~/utils/boardLayout'

const KEY = 'lantern-battle-phone-tab'

function load(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

/**
 * The phone board's active tab, remembered per browser. A saved tab the viewer no longer
 * has (role or Scribe changed) falls back to the role's default; picking a tab saves it.
 * The fallback never replaces the viewer's pick: a player's board starts as a watcher's
 * until their sheet loads, and then opens on the tab they last picked, not on Party.
 */
export function usePhoneTab(
  role: Ref<PhoneRole>,
  scribe: Ref<boolean>,
  actions: Ref<boolean>,
): Ref<PhoneTab> {
  /** The tab the viewer last picked (saved), which a role change goes back to. */
  let wanted = load()
  let auto = false
  const tab = ref<PhoneTab>(pickTab(role.value, scribe.value, actions.value, wanted))

  watch([role, scribe, actions], () => {
    auto = true
    // Nothing picked yet: the new role's default (a player opens on Actions, not on the
    // watcher's Party they had while the sheet loaded).
    tab.value = pickTab(role.value, scribe.value, actions.value, wanted)
    auto = false
  })

  // Sync, so the role watcher's own change is seen while `auto` is set.
  watch(
    tab,
    (value) => {
      if (auto) return
      wanted = value
      try {
        localStorage.setItem(KEY, value)
      } catch {
        // Not remembered this time (private window, blocked storage).
      }
    },
    { flush: 'sync' },
  )

  return tab
}
