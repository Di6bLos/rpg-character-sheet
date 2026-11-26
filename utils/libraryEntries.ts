// Library → Feats, Backgrounds and Species (Ancestries): one list shape for every system. Each
// system's records become `EntryView`s (utils/libraryOrigins.ts) with display cells, sort
// values and filter facets, so the search, filters, sort and URL here work the same for all
// of them. Filters live in the URL by their own keys (`category=general,origin&level=4`).
import type { GameSystem } from '~/types'
import type { EntryItem } from '~/utils/libraryDnd5e'
import {
  compendiumList,
  searchable,
  type Searchable,
  type SortDir,
  type SortValue,
} from '~/utils/libraryCompendium'

export type EntryTab = 'feats' | 'backgrounds' | 'species'

/** The systems with data for each tab; a tab is hidden for the rest. */
export const ENTRY_SYSTEMS: Record<EntryTab, GameSystem[]> = {
  feats: ['pf2e', 'dnd5e'],
  backgrounds: ['nimble', 'pf2e', 'dnd5e'],
  species: ['nimble', 'pf2e', 'dnd5e'],
}

export const isEntryTab = (t: unknown): t is EntryTab => typeof t === 'string' && t in ENTRY_SYSTEMS

/** The tab's name for a system: 5e has species, PF2e and Nimble ancestries. */
export function entryTabLabel(tab: EntryTab, system?: GameSystem): string {
  if (tab === 'species') return system === 'dnd5e' ? 'Species' : 'Ancestries'
  return tab === 'feats' ? 'Feats' : 'Backgrounds'
}

/** What one row is called: "feat", "background", "species", "ancestry". */
export function entryNoun(tab: EntryTab, system?: GameSystem): { one: string; many: string } {
  if (tab === 'species')
    return system === 'dnd5e'
      ? { one: 'species', many: 'species' }
      : { one: 'ancestry', many: 'ancestries' }
  return tab === 'feats'
    ? { one: 'feat', many: 'feats' }
    : { one: 'background', many: 'backgrounds' }
}

export interface EntryFilter {
  /** The URL key; never one of `ENTRY_RESERVED`. */
  key: string
  label: string
  /** `select`: one value; `chips`: any of several. */
  kind: 'select' | 'chips'
  /** The select's empty option ("Any category"). */
  any?: string
  options: { value: string; label: string }[]
}

export interface EntryColumn {
  key: string
  label: string
}

export interface EntryPart {
  title: string
  items: EntryItem[]
}

export interface EntryView {
  /** Unique in its list; the URL's `entry`. */
  id: string
  name: string
  /** Display text per column key (`name` shows the name itself). */
  cells: Record<string, string>
  /** Sort value per column key; a column without one sorts by its cell. */
  sort: Record<string, SortValue>
  /** Values per filter key that the entry matches. */
  facets: Record<string, string[]>
  /** PF2e action glyphs with their words for screen readers. */
  glyph?: string
  glyphWords?: string
  /** Phones: the badge on the right and the line under the name. */
  badge: string
  meta: string
  rarity?: string
  /** A non-SRD 5e entry's source ("PHB 2024"), tagged beside its name. */
  tag?: string
  /** The modal: its eyebrow, trait badges, facts, text and parts. */
  eyebrow: string
  traits: string[]
  stats: { label: string; value: string }[]
  /** Non-SRD 5e: the summary in Lantern's words. */
  summary?: string
  /** Mechanics of the entry itself, as fact lines (non-SRD 5e). */
  facts: string[]
  /** Rules text as markdown. */
  text?: string
  parts: EntryPart[]
  source: string
  /** Extra words the full search looks through. */
  search: string
}

export interface EntryList {
  entries: EntryView[]
  columns: EntryColumn[]
  filters: EntryFilter[]
  defaultSort: string
}

export interface EntryQuery {
  q: string
  /** Search the rules text too, after the name matches. */
  full: boolean
  /** Column key; empty means the list's default. */
  sort: string
  dir: SortDir
  /** Picked values per filter key, lower case. */
  picked: Record<string, string[]>
}

/** Query keys the lists use themselves, so no filter may take them. */
export const ENTRY_RESERVED = ['tab', 'system', 'q', 'full', 'sort', 'dir', 'entry'] as const

const one = (v: unknown) => (Array.isArray(v) ? v[0] : v)
const str = (v: unknown) => {
  const x = one(v)
  return typeof x === 'string' ? x.trim() : ''
}

export function readEntryQuery(
  query: Record<string, unknown>,
  filters: readonly EntryFilter[],
): EntryQuery {
  const picked: Record<string, string[]> = {}
  for (const f of filters) {
    const values = str(query[f.key])
      .toLowerCase()
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (values.length) picked[f.key] = f.kind === 'select' ? values.slice(0, 1) : values
  }
  return {
    q: str(query.q),
    full: str(query.full) !== '0',
    sort: str(query.sort),
    dir: str(query.dir) === 'desc' ? 'desc' : 'asc',
    picked,
  }
}

/** The query keys for a list; defaults come out as `undefined`, which drops them. */
export function writeEntryQuery(
  q: EntryQuery,
  filters: readonly EntryFilter[],
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {
    q: q.q.trim() || undefined,
    full: q.full ? undefined : '0',
    sort: q.sort || undefined,
    dir: q.dir === 'desc' ? 'desc' : undefined,
  }
  for (const f of filters) out[f.key] = q.picked[f.key]?.join(',') || undefined
  return out
}

/** Every filter with a pick matches: a select by its value, chips by any of theirs. */
export function entryKeep(q: EntryQuery): (e: EntryView) => boolean {
  const active = Object.entries(q.picked).filter(([, v]) => v.length)
  return (e) =>
    active.every(([key, values]) => {
      const has = e.facets[key]?.map((x) => x.toLowerCase()) ?? []
      return values.some((v) => has.includes(v))
    })
}

/** The searchable rows of a list: the name, then everything the modal reads. */
export function entryIndex(entries: readonly EntryView[]): Searchable<EntryView>[] {
  return entries.map((e) =>
    searchable(
      e,
      e.name,
      [
        e.search,
        e.summary,
        e.text,
        ...e.facts,
        ...e.stats.map((s) => s.value),
        ...e.parts.flatMap((p) =>
          p.items.flatMap((i) => [
            i.name,
            i.text,
            i.summary,
            ...i.facts,
            ...(i.options ?? []).flatMap((o) => [o.name, o.text, o.summary]),
          ]),
        ),
      ]
        .filter(Boolean)
        .join(' '),
    ),
  )
}

/** The sort key a column uses: its sort value, else its cell in lower case. */
export function entrySortValue(e: EntryView, key: string): SortValue {
  if (key in e.sort) return e.sort[key]
  if (key === 'name') return e.name.toLowerCase()
  return e.cells[key]?.toLowerCase() || undefined
}

/** The rows a list shows: filtered, searched (name matches first) and sorted. */
export function entryRows(
  index: readonly Searchable<EntryView>[],
  q: EntryQuery,
  sortKey: string,
): EntryView[] {
  return compendiumList(index, {
    q: q.q,
    full: q.full,
    keep: entryKeep(q),
    value: (e) => entrySortValue(e, sortKey),
    dir: q.dir,
  })
}

/** The options of a filter, from the values entries have, A to Z or in `order`. */
export function facetOptions(
  entries: readonly EntryView[],
  key: string,
  label: (value: string) => string = (v) => v,
  order?: readonly string[],
): { value: string; label: string }[] {
  const values = [...new Set(entries.flatMap((e) => e.facets[key] ?? []))]
  const rank = (v: string) => (order ? order.indexOf(v) : -1)
  return values
    .sort((a, b) =>
      order ? rank(a) - rank(b) : label(a).localeCompare(label(b), undefined, { numeric: true }),
    )
    .map((value) => ({ value: value.toLowerCase(), label: label(value) }))
}
