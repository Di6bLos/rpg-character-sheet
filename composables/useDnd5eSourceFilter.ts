// The 5e builder's and level-up's source filter, kept per browser: which books' classes,
// subclasses, species, backgrounds, feats and spells the pickers show. It stores the books
// turned off, so every book starts on, a book added to the data included.
import { DND5E_SOURCES, type Dnd5eSourceBook, type Dnd5eSourceKind } from '~/data/dnd5e/sources'

const OFF_KEY = 'lantern-dnd5e-sources-off'
const KIND_ORDER: Dnd5eSourceKind[] = ['core', 'supplement', 'setting', 'drop']

/** Every book for the filter: core, then supplements, settings and the D&D Beyond Drops. */
export const DND5E_FILTER_BOOKS = [...DND5E_SOURCES].sort(
  (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind),
)

const off = ref<Dnd5eSourceBook[]>([])
let loaded = false

function load() {
  if (loaded || !import.meta.client) return
  loaded = true
  try {
    const saved = JSON.parse(localStorage.getItem(OFF_KEY) ?? '[]') as unknown
    if (Array.isArray(saved))
      off.value = DND5E_SOURCES.map((s) => s.name).filter((n) => saved.includes(n))
  } catch {
    // Private windows can refuse storage; every book stays on.
  }
}

function save() {
  try {
    localStorage.setItem(OFF_KEY, JSON.stringify(off.value))
  } catch {
    // The choice still holds for this visit.
  }
}

export function useDnd5eSourceFilter() {
  load()
  return {
    off: readonly(off),
    /** Whether a record of this book shows; records without a book always do. */
    shows: (source: Dnd5eSourceBook | undefined) => !source || !off.value.includes(source),
    set(book: Dnd5eSourceBook, on: boolean) {
      off.value = on ? off.value.filter((b) => b !== book) : [...new Set([...off.value, book])]
      save()
    },
    showAll() {
      off.value = []
      save()
    },
  }
}
