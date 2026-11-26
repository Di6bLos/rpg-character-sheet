// Library → Spells and Feats: a list's rows in folding sections (spell levels, feat categories).
// The pure parts: which rows go in which section, which sections are open (the reader's saved
// choice, or every section while a search is typed or only one is left), what's saved per
// browser, and how many rows an open section shows before "Show more".

export interface SectionDef {
  key: string
  label: string
  /** Its rows span levels (PF2e focus spells), so each row says its own. */
  mixed?: boolean
}

export interface ListSection<T> extends SectionDef {
  rows: T[]
}

/**
 * Rows into sections in `defs`' order, each keeping the rows' order. A row with several keys
 * shows in each of them; keys `defs` doesn't name come last, labelled by the key itself.
 * Sections with no rows are left out.
 */
export function groupSections<T>(
  rows: readonly T[],
  defs: readonly SectionDef[],
  keysOf: (row: T) => string | readonly string[],
): ListSection<T>[] {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const keys = keysOf(row)
    for (const key of typeof keys === 'string' ? [keys] : new Set(keys))
      groups.set(key, [...(groups.get(key) ?? []), row])
  }
  const known = new Set(defs.map((d) => d.key))
  const extra = [...groups.keys()].filter((k) => !known.has(k)).map((key) => ({ key, label: key }))
  return [...defs, ...extra].flatMap((d) => {
    const list = groups.get(d.key)
    return list?.length ? [{ ...d, rows: list }] : []
  })
}

/** What decides whether a section is open. */
export interface OpenState {
  /** Sections the reader opened, as saved for this browser. */
  saved: ReadonlySet<string>
  /** A search is typed, or only one section is left: every section opens on its own. */
  auto: boolean
  /** While `auto`: sections the reader folded or opened since, by key. */
  flips: ReadonlyMap<string, boolean>
}

export function sectionOpen(key: string, s: OpenState): boolean {
  return s.auto ? (s.flips.get(key) ?? true) : s.saved.has(key)
}

/** The saved open sections: a JSON list of keys; anything else reads as none. */
export function readSavedSections(raw: string | null): Set<string> {
  if (!raw) return new Set()
  try {
    const keys: unknown = JSON.parse(raw)
    return new Set(Array.isArray(keys) ? keys.filter((k) => typeof k === 'string') : [])
  } catch {
    return new Set()
  }
}

/** The localStorage key for one tab and system's open sections. */
export const sectionStorageKey = (tab: string, system: string) =>
  `lantern:library-sections:${tab}:${system}`

/** Rows an open section shows at first, and how many more each "Show more" adds. */
export const SECTION_PAGE = 100
