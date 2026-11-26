import { RULES_SYSTEMS, rulesSystem, type RulesSystem } from '~/data/rules'

// The game system a Library tab shows (Rules, Spells, Classes): the URL's `system`, else the
// one last picked on any of them (per browser), else the first the tab has content for.
const STORE_KEY = 'lantern-rules-system'

function remembered(): string | null {
  try {
    return localStorage.getItem(STORE_KEY)
  } catch {
    return null
  }
}

function remember(id: string) {
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
