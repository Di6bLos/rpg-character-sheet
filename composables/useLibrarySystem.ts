import { RULES_SYSTEMS, rulesSystem, type RulesSystem } from '~/data/rules'
import type { GameSystem } from '~/types'

// The game system a Library tab shows (Rules, Spells, Classes, Feats…): the URL's `system`,
// else the one last picked on any of them (per browser), else the first the tab has content for.
const STORE_KEY = 'lantern-rules-system'

/** The last system picked, read from storage once and kept in step as tabs remember theirs. */
const last = ref<string | null | undefined>(undefined)

function remembered(): string | null {
  if (last.value !== undefined) return last.value
  try {
    last.value = localStorage.getItem(STORE_KEY)
  } catch {
    last.value = null
  }
  return last.value
}

function remember(id: string) {
  last.value = id
  try {
    localStorage.setItem(STORE_KEY, id)
  } catch {
    // Private windows and blocked storage just don't remember.
  }
}

export function useLibrarySystem(isReady: (s: RulesSystem) => boolean) {
  const route = useRoute()
  const ready = (id: unknown) => {
    const s = typeof id === 'string' ? rulesSystem(id) : undefined
    return s && isReady(s) ? s : undefined
  }
  const fallback = RULES_SYSTEMS.find(isReady)
  const sys = computed(() => ready(route.query.system) ?? ready(remembered()) ?? fallback)
  watch(
    () => sys.value?.id,
    (id) => id && remember(id),
    { immediate: true },
  )
  return sys
}

/**
 * The system the Library's tab bar names its tabs for (Species or Ancestries) and hides tabs
 * by (no Feats for Nimble): the URL's, else the last picked, else the first. It remembers
 * nothing itself.
 */
export function useLibraryNavSystem() {
  const route = useRoute()
  return computed<GameSystem | undefined>(
    () =>
      (rulesSystem(String(route.query.system ?? '')) ?? rulesSystem(remembered()))?.id ??
      RULES_SYSTEMS[0]?.id,
  )
}
