import type { GameSystem, NpcKind, NpcSource, PoolNpc } from '~/types'

/**
 * Filtered, paged search of the shared NPC pool for the Library and Admin → NPCs.
 * Loads `pageSize` rows at a time ("Load more"), debounces the name search and
 * drops replies that a newer search has overtaken.
 */
export function useNpcPoolSearch(pageSize = 60) {
  const npcs = useNpcStore()
  const snackbar = useSnackbarStore()

  const system = ref<GameSystem | null>(null)
  const kind = ref<NpcKind | null>(null)
  const source = ref<NpcSource | null>(null)
  const q = ref('')

  const list = ref<PoolNpc[]>([])
  const loading = ref(true)
  const loadingMore = ref(false)
  const hasMore = ref(false)
  let generation = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  const filter = () => ({
    system: system.value,
    kind: kind.value,
    source: source.value,
    q: q.value,
  })

  async function fetchPage(offset: number) {
    // One extra row tells whether another page exists without a count query.
    const rows = await npcs.searchPool(filter(), pageSize + 1, offset)
    return { rows: rows.slice(0, pageSize), more: rows.length > pageSize }
  }

  /** Starts over from the first page with the current filters. */
  async function load() {
    const gen = ++generation
    loading.value = true
    loadingMore.value = false
    try {
      const { rows, more } = await fetchPage(0)
      if (gen !== generation) return
      list.value = rows
      hasMore.value = more
    } catch (err) {
      if (gen === generation) snackbar.error(err, 'Could not load the NPC pool')
    } finally {
      if (gen === generation) loading.value = false
    }
  }

  async function loadMore() {
    if (loading.value || loadingMore.value || !hasMore.value) return
    const gen = generation
    loadingMore.value = true
    try {
      const { rows, more } = await fetchPage(list.value.length)
      if (gen !== generation) return
      const seen = new Set(list.value.map((n) => n.id))
      list.value = [...list.value, ...rows.filter((n) => !seen.has(n.id))]
      hasMore.value = more
    } catch (err) {
      if (gen === generation) snackbar.error(err, 'Could not load more NPCs')
    } finally {
      if (gen === generation) loadingMore.value = false
    }
  }

  /** Drops a row the user just removed, without reloading. */
  function forget(id: string) {
    list.value = list.value.filter((n) => n.id !== id)
  }

  watch([system, kind, source], () => void load())
  watch(q, () => {
    clearTimeout(timer)
    timer = setTimeout(() => void load(), 250)
  })
  onMounted(() => void load())
  onBeforeUnmount(() => {
    clearTimeout(timer)
    generation++
  })

  return { system, kind, source, q, list, loading, loadingMore, hasMore, load, loadMore, forget }
}
