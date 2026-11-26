// Library → Spells and Feats: the folding sections of a list. Which sections are open is saved
// per browser for each tab and system (utils/librarySections.ts); while a search is typed, or
// only one section is left, every section opens on its own and folding one lasts until the
// search changes. An open section renders its first `SECTION_PAGE` rows, then more on request.
import {
  SECTION_PAGE,
  readSavedSections,
  sectionOpen,
  type ListSection,
} from '~/utils/librarySections'

export function useLibrarySections<T>(opts: {
  sections: Ref<ListSection<T>[]>
  /** Where the open sections are saved; empty saves nothing. */
  storageKey: Ref<string>
  /** The typed search. */
  search: Ref<string>
  /** Anything that changes the rows (filters, sort, system) starts each section's paging over. */
  reset: () => unknown
}) {
  const saved = ref(new Set<string>())
  const flips = ref(new Map<string, boolean>())
  const auto = computed(() => !!opts.search.value.trim() || opts.sections.value.length === 1)

  function load() {
    try {
      saved.value = readSavedSections(
        opts.storageKey.value ? localStorage.getItem(opts.storageKey.value) : null,
      )
    } catch {
      saved.value = new Set()
    }
  }
  function save() {
    if (!opts.storageKey.value) return
    try {
      if (saved.value.size)
        localStorage.setItem(opts.storageKey.value, JSON.stringify([...saved.value]))
      else localStorage.removeItem(opts.storageKey.value)
    } catch {
      return
    }
  }
  onMounted(load)
  watch(opts.storageKey, load)
  watch([() => opts.search.value.trim(), auto], () => (flips.value = new Map()))

  const isOpen = (key: string) =>
    sectionOpen(key, { saved: saved.value, auto: auto.value, flips: flips.value })

  function setOpen(keys: string[], open: boolean) {
    if (auto.value) {
      const next = new Map(flips.value)
      for (const k of keys) next.set(k, open)
      flips.value = next
      return
    }
    const next = new Set(saved.value)
    for (const k of keys) {
      if (open) next.add(k)
      else next.delete(k)
    }
    saved.value = next
    save()
  }
  const keys = () => opts.sections.value.map((s) => s.key)
  const toggle = (key: string) => setOpen([key], !isOpen(key))
  const expandAll = () => setOpen(keys(), true)
  const collapseAll = () => setOpen(keys(), false)
  const allOpen = computed(() => opts.sections.value.every((s) => isOpen(s.key)))
  const allClosed = computed(() => opts.sections.value.every((s) => !isOpen(s.key)))

  const limits = ref(new Map<string, number>())
  watch(opts.reset, () => (limits.value = new Map()))
  const limit = (key: string) => limits.value.get(key) ?? SECTION_PAGE
  const shown = (s: ListSection<T>) => s.rows.slice(0, limit(s.key))
  const hidden = (s: ListSection<T>) => Math.max(0, s.rows.length - limit(s.key))
  function showMore(key: string) {
    limits.value = new Map(limits.value).set(key, limit(key) + SECTION_PAGE)
  }

  return { isOpen, toggle, expandAll, collapseAll, allOpen, allClosed, shown, hidden, showMore }
}
