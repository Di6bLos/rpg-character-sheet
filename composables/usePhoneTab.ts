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
 */
export function usePhoneTab(role: Ref<PhoneRole>, scribe: Ref<boolean>): Ref<PhoneTab> {
  const tab = ref<PhoneTab>(pickTab(role.value, scribe.value, load()))

  watch([role, scribe], () => {
    tab.value = pickTab(role.value, scribe.value, tab.value)
  })

  watch(tab, (value) => {
    try {
      localStorage.setItem(KEY, value)
    } catch {
      // Not remembered this time (private window, blocked storage).
    }
  })

  return tab
}
