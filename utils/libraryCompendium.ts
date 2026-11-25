// Library → Spells and Classes: the pure parts of both tabs. Spells: what the URL holds (search,
// filters, sort), the columns each system sorts by, and the search that ranks name matches over
// rules-text matches. Classes: the tables and groups each class's section shows, read straight
// from the committed game data (data/pf2e/generated, data/nimble).
import type {
  Pf2eActionCost,
  Pf2eClassDef,
  Pf2eClassFeature,
  Pf2eSpellDef,
  Pf2eSubclassOption,
} from '~/data/pf2e/types'
import { SCHOOL_LABELS } from '~/data/nimble/spells'
import type {
  AbilityDef,
  ClassDef,
  LevelTable,
  SpellDef,
  StatIncrease,
  SubclassDef,
} from '~/data/nimble/types'
import type { GameSystem } from '~/types'

/** Systems with spell and class data to show; the rest are "coming soon". */
export const COMPENDIUM_SYSTEMS: GameSystem[] = ['nimble', 'pf2e']

export type SortDir = 'asc' | 'desc'
export type SortValue = number | string | undefined

// --- The spell list's URL ------------------------------------------------------------

export interface SpellQuery {
  q: string
  /** Search the rules text too, after the name matches. */
  full: boolean
  /** Column key; empty means the system's default. */
  sort: string
  dir: SortDir
  /** PF2e: `0` for cantrips, else the spell rank. */
  rank: string
  kind: string[]
  trad: string[]
  /** PF2e focus spells and class cantrips: the class, lower case. */
  cls: string
  trait: string
  /** PF2e: show uncommon, rare and unique spells. */
  rare: boolean
  /** Nimble: `cantrip`, `utility` or the tier. */
  tier: string
  school: string[]
}

export const SPELL_QUERY_KEYS = [
  'q',
  'full',
  'sort',
  'dir',
  'rank',
  'kind',
  'trad',
  'class',
  'trait',
  'rare',
  'tier',
  'school',
] as const

const one = (v: unknown) => (Array.isArray(v) ? v[0] : v)
const str = (v: unknown) => {
  const x = one(v)
  return typeof x === 'string' ? x.trim() : ''
}
const list = (v: unknown) =>
  str(v)
    .toLowerCase()
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

export function readSpellQuery(query: Record<string, unknown>): SpellQuery {
  return {
    q: str(query.q),
    full: str(query.full) !== '0',
    sort: str(query.sort),
    dir: str(query.dir) === 'desc' ? 'desc' : 'asc',
    rank: str(query.rank),
    kind: list(query.kind),
    trad: list(query.trad),
    cls: str(query.class).toLowerCase(),
    trait: str(query.trait).toLowerCase(),
    rare: str(query.rare) === '1',
    tier: str(query.tier).toLowerCase(),
    school: list(query.school),
  }
}

/** The query keys for a spell list; defaults come out as `undefined`, which drops them. */
export function writeSpellQuery(
  s: SpellQuery,
): Record<(typeof SPELL_QUERY_KEYS)[number], string | undefined> {
  const or = (v: string) => v || undefined
  return {
    q: or(s.q.trim()),
    full: s.full ? undefined : '0',
    sort: or(s.sort),
    dir: s.dir === 'desc' ? 'desc' : undefined,
    rank: or(s.rank),
    kind: or(s.kind.join(',')),
    trad: or(s.trad.join(',')),
    class: or(s.cls),
    trait: or(s.trait),
    rare: s.rare ? '1' : undefined,
    tier: or(s.tier),
    school: or(s.school.join(',')),
  }
}

// --- Search and sort -----------------------------------------------------------------

export function searchTerms(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean)
}

/** Every term appears somewhere in the texts (case-insensitive). */
export function matchesAll(terms: string[], ...texts: (string | undefined)[]): boolean {
  if (!terms.length) return true
  const hay = texts.join(' ').toLowerCase()
  return terms.every((t) => hay.includes(t))
}

/** A row to search: its name and rules text, lower-cased once when the list loads. */
export interface Searchable<T> {
  item: T
  name: string
  text: string
}

export function searchable<T>(item: T, name: string, text: string): Searchable<T> {
  return { item, name: name.toLowerCase(), text: text.toLowerCase() }
}

/**
 * How well a row matches: 0 its name starts with the search, 1 its name has every word,
 * 2 (with `full`) every word is in its name or text; -1 no match. No search matches all at 0.
 */
export function searchRank<T>(row: Searchable<T>, query: string, full: boolean): number {
  const terms = searchTerms(query)
  if (!terms.length) return 0
  if (row.name.startsWith(query.trim().toLowerCase())) return 0
  if (terms.every((t) => row.name.includes(t))) return 1
  if (full && terms.every((t) => row.name.includes(t) || row.text.includes(t))) return 2
  return -1
}

/** Ascending order of two sort values; numbers before strings, missing values last. */
function compare(a: SortValue, b: SortValue): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'number') return -1
  if (typeof b === 'number') return 1
  return String(a).localeCompare(String(b))
}

/**
 * Sorts a copy by `value` (missing values last either way), then by `tie`, keeping the
 * original order for rows that are still equal.
 */
export function sortRows<T>(
  rows: readonly T[],
  value: (row: T) => SortValue,
  dir: SortDir,
  tie: (row: T) => string = () => '',
): T[] {
  const sign = dir === 'desc' ? -1 : 1
  return rows
    .map((row, i) => ({ row, i, v: value(row), t: tie(row) }))
    .sort((a, b) => {
      const missA = a.v === undefined || a.v === ''
      const missB = b.v === undefined || b.v === ''
      if (missA !== missB) return missA ? 1 : -1
      return (missA ? 0 : sign * compare(a.v, b.v)) || a.t.localeCompare(b.t) || a.i - b.i
    })
    .map((x) => x.row)
}

/**
 * The rows a list shows: those `keep` passes that match the search, name matches first
 * (by `searchRank`), each group in the column's order.
 */
export function compendiumList<T>(
  rows: readonly Searchable<T>[],
  opts: {
    q: string
    full: boolean
    keep: (item: T) => boolean
    value: (item: T) => SortValue
    dir: SortDir
  },
): T[] {
  const ranked = rows
    .filter((r) => opts.keep(r.item))
    .map((r) => ({ r, rank: searchRank(r, opts.q, opts.full) }))
    .filter((x) => x.rank >= 0)
  const sorted = sortRows(
    ranked,
    (x) => opts.value(x.r.item),
    opts.dir,
    (x) => x.r.name,
  )
  return sortRows(sorted, (x) => x.rank, 'asc').map((x) => x.r.item)
}

export interface SpellColumn<T> {
  key: string
  label: string
  value: (spell: T) => SortValue
}

// --- Pathfinder 2e spells ------------------------------------------------------------

/** Cantrips sort and filter as rank 0. */
export const pf2eSpellRank = (s: Pf2eSpellDef) =>
  s.kind === 'cantrip' || s.traits.includes('Cantrip') ? 0 : s.rank

const TIME_UNITS: Record<string, number> = { round: 3, minute: 10, hour: 600, day: 14400 }

/**
 * Cheapest first: free action, reaction, 1–3 actions (a range by its low end), then
 * activities by how long they take.
 */
export function actionSortValue(a?: Pf2eActionCost): number | undefined {
  if (a === undefined) return undefined
  if (a === 'free') return 0
  if (a === 'reaction') return 0.5
  if (typeof a === 'number') return a
  const time = /^(\d+) (round|minute|hour|day)s?$/.exec(a)
  if (time) return Number(time[1]) * (TIME_UNITS[time[2] ?? ''] ?? 1) * 10
  const low = /^(\d+)/.exec(a)
  return low ? Number(low[1]) + 0.1 : undefined
}

/** A distance in feet: "30 feet", "1 mile", "15-foot burst", "touch" (0). */
export function feet(text?: string): number | undefined {
  if (!text) return undefined
  const t = text.toLowerCase().replace(/,/g, '')
  if (t.startsWith('touch')) return 0
  const m = /(\d+)[\s-]*(feet|foot|miles?)/.exec(t)
  if (m) return Number(m[1]) * (m[2]?.startsWith('mile') ? 5280 : 1)
  if (t.startsWith('planetary')) return 1e9
  if (t.startsWith('unlimited')) return 1e10
  return undefined
}

/** "30 feet · 15-foot burst", or whichever of the two the spell has. */
export const pf2eRangeArea = (s: Pf2eSpellDef) => [s.range, s.area].filter(Boolean).join(' · ')

export const sourceLabel = (src: { book: string; page?: number }) =>
  src.page ? `${src.book} p. ${src.page}` : src.book

export const PF2E_SPELL_COLUMNS: SpellColumn<Pf2eSpellDef>[] = [
  { key: 'name', label: 'Name', value: (s) => s.name.toLowerCase() },
  { key: 'rank', label: 'Rank', value: pf2eSpellRank },
  { key: 'actions', label: 'Actions', value: (s) => actionSortValue(s.actions) },
  {
    key: 'traditions',
    label: 'Traditions',
    value: (s) => s.traditions.join(', ').toLowerCase(),
  },
  { key: 'defense', label: 'Defense', value: (s) => s.defense?.toLowerCase() },
  { key: 'range', label: 'Range / area', value: (s) => feet(s.range) ?? feet(s.area) },
  {
    key: 'source',
    label: 'Source',
    value: (s) => `${s.source.book.toLowerCase()} ${String(s.source.page ?? 0).padStart(4, '0')}`,
  },
]

export function pf2eSpellKeep(q: SpellQuery): (s: Pf2eSpellDef) => boolean {
  return (s) =>
    (!q.rank || String(pf2eSpellRank(s)) === q.rank) &&
    (!q.kind.length || q.kind.includes(s.kind)) &&
    (!q.trad.length || s.traditions.some((t) => q.trad.includes(t.toLowerCase()))) &&
    (!q.cls || s.classes.some((c) => c.toLowerCase() === q.cls)) &&
    (!q.trait || s.traits.some((t) => t.toLowerCase() === q.trait)) &&
    (q.rare || s.rarity === 'common')
}

/** Traits to filter by: every trait but the rarity ones, A to Z. */
export function pf2eSpellTraits(spells: readonly Pf2eSpellDef[]): string[] {
  const skip = new Set(['Common', 'Uncommon', 'Rare', 'Unique'])
  const all = new Set(spells.flatMap((s) => s.traits).filter((t) => !skip.has(t)))
  return [...all].sort((a, b) => a.localeCompare(b))
}

export function pf2eSpellClasses(spells: readonly Pf2eSpellDef[]): string[] {
  return [...new Set(spells.flatMap((s) => s.classes))].sort((a, b) => a.localeCompare(b))
}

// --- Nimble spells -------------------------------------------------------------------

export const nimbleTierKey = (s: SpellDef) =>
  s.utility ? 'utility' : s.tier === 0 ? 'cantrip' : String(s.tier)

export const nimbleTierLabel = (s: SpellDef) =>
  s.utility ? 'Utility' : s.tier === 0 ? 'Cantrip' : `Tier ${s.tier}`

/** Mana: a spell costs its tier; cantrips and utility spells cost nothing. */
export const nimbleCost = (s: SpellDef) => (s.utility ? 0 : s.tier)

const MINUTES: Record<string, number> = { min: 1, minute: 1, minutes: 1, hour: 60, hours: 60 }

/**
 * The spell's "1 Action, Single Target" header split into its cost ("1", "1 min") with a
 * value to sort by (actions, then casting times), and what it targets.
 */
export function nimbleCast(s: SpellDef): { actions: string; value?: number; target: string } {
  let actions = ''
  let value: number | undefined
  const target: string[] = []
  for (const part of s.cast.split(/,\s*/)) {
    const act = /^(\d+) Actions?$/i.exec(part)
    const time = /^Casting Time: (\d+) (\w+)$/i.exec(part)
    if (act) {
      actions = act[1] ?? ''
      value = Number(act[1])
    } else if (time) {
      actions = `${time[1]} ${time[2]}`
      value = Number(time[1]) * (MINUTES[time[2]?.toLowerCase() ?? ''] ?? 1) * 100
    } else target.push(part)
  }
  return { actions, value, target: target.join(', ') }
}

export const NIMBLE_SPELL_COLUMNS: SpellColumn<SpellDef>[] = [
  { key: 'name', label: 'Name', value: (s) => s.name.toLowerCase() },
  { key: 'tier', label: 'Tier', value: (s) => s.tier },
  { key: 'school', label: 'School', value: (s) => SCHOOL_LABELS[s.school].toLowerCase() },
  { key: 'cost', label: 'Cost', value: nimbleCost },
  { key: 'actions', label: 'Actions', value: (s) => nimbleCast(s).value },
]

export function nimbleSpellKeep(q: SpellQuery): (s: SpellDef) => boolean {
  return (s) =>
    (!q.tier || nimbleTierKey(s) === q.tier) && (!q.school.length || q.school.includes(s.school))
}

export const DEFAULT_SPELL_SORT: Record<string, string> = { pf2e: 'rank', nimble: 'tier' }

// --- Classes -------------------------------------------------------------------------

export interface LevelGroup<T> {
  level: number
  items: T[]
}

/** Items by level, lowest first, keeping the data's order within a level. */
export function byLevel<T extends { level?: number }>(items: readonly T[]): LevelGroup<T>[] {
  const groups = new Map<number, T[]>()
  for (const item of items) {
    const level = item.level ?? 0
    groups.set(level, [...(groups.get(level) ?? []), item])
  }
  return [...groups].sort(([a], [b]) => a - b).map(([level, list]) => ({ level, items: list }))
}

export interface KindGroup<T> {
  kind: string
  items: T[]
}

/** PF2e subclass options by the book's name for the choice, in the data's order. */
export function byKind(options: readonly Pf2eSubclassOption[]): KindGroup<Pf2eSubclassOption>[] {
  const groups = new Map<string, Pf2eSubclassOption[]>()
  for (const o of options) groups.set(o.kind, [...(groups.get(o.kind) ?? []), o])
  return [...groups].map(([kind, items]) => ({
    kind,
    items: sortRows(items, (o) => o.level, 'asc'),
  }))
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** The class advancement table, one row per level. */
export function pf2eAdvancement(cls: Pf2eClassDef): { level: number; features: string }[] {
  return [...cls.advancement]
    .sort((a, b) => a.level - b.level)
    .map((r) => ({ level: r.level, features: capital(r.features.join(', ')) }))
}

export interface SlotTable {
  /** Spell ranks that ever get a slot, as columns. */
  ranks: number[]
  rows: { level: number; cantrips: number; slots: number[] }[]
}

export function spellSlotTable(cls: Pf2eClassDef): SlotTable | null {
  const slots = cls.spellSlots
  if (!slots?.length) return null
  const ranks = Array.from({ length: 10 }, (_, i) => i + 1).filter((rank) =>
    slots.some((r) => (r.slots[rank - 1] ?? 0) > 0),
  )
  return {
    ranks,
    rows: [...slots]
      .sort((a, b) => a.level - b.level)
      .map((r) => ({
        level: r.level,
        cantrips: r.cantrips,
        slots: ranks.map((rank) => r.slots[rank - 1] ?? 0),
      })),
  }
}

/** The first paragraph of a class's text, as plain words (its flavour line). */
export function classSummary(text: string): string {
  const para = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .find((p) => p && !p.startsWith('**') && !p.startsWith('#') && p !== '---')
  return (para ?? '')
    .replace(/[*_]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/ ([.,;:!?])/g, '$1')
    .trim()
}

/** Nimble: the book pages each class comes from (the class files' headers). */
export const NIMBLE_CLASS_SOURCES: Record<string, string> = {
  berserker: 'Heroes pp. 6–11',
  cheat: 'Heroes pp. 12–17',
  commander: 'Heroes pp. 18–23',
  hunter: 'Heroes pp. 24–29',
  mage: 'Heroes pp. 30–35',
  oathsworn: 'Heroes pp. 36–41',
  shadowmancer: 'Heroes pp. 42–47',
  shepherd: 'Heroes pp. 48–53',
  songweaver: 'Heroes pp. 54–59',
  stormshifter: 'Heroes pp. 60–65',
  zephyr: 'Heroes pp. 66–71',
  artificer: 'Artificer 1.7 pp. 3–4',
}

export function statIncreaseLabel(inc: StatIncrease): string {
  const any = inc.stats.length === 4
  if (inc.count > 1) return `+1 to ${any ? 'any' : inc.stats.join('/')} ${inc.count} stats`
  return any ? '+1 to any stat' : `+1 ${inc.stats.join(' or ')}`
}

export interface NimbleLevelRow {
  level: number
  features: string[]
  /** Highest spell tier unlocked at this level, when it changes. */
  tier?: number
}

/** The class table: what each level 1–20 brings, by name. */
export function nimbleAdvancement(cls: ClassDef): NimbleLevelRow[] {
  return Array.from({ length: 20 }, (_, i) => {
    const level = i + 1
    const def = cls.levels[level]
    const features = [
      ...(def?.abilities ?? []).map((a) => a.name),
      ...(def?.subclassChoice ? ['Subclass'] : []),
      ...(def?.choices ?? []).map((c) => c.label.split(':')[0]?.trim() ?? c.label),
      ...(def?.statIncrease ? [statIncreaseLabel(def.statIncrease)] : []),
    ]
    return { level, features, ...(def?.spellTier !== undefined ? { tier: def.spellTier } : {}) }
  })
}

/** Abilities and notes by level, for the levels that have any. */
export function nimbleLevelGroups(
  levels: LevelTable,
): { level: number; abilities: AbilityDef[]; notes: string[] }[] {
  return Object.entries(levels)
    .map(([level, def]) => ({
      level: Number(level),
      abilities: def?.abilities ?? [],
      notes: def?.notes ?? [],
    }))
    .filter((g) => g.abilities.length || g.notes.length)
    .sort((a, b) => a.level - b.level)
}

// --- Class search --------------------------------------------------------------------

export interface Pf2eClassMatch {
  /** The class's own name matched (or there's no search): show all of it. */
  whole: boolean
  features: Pf2eClassFeature[]
  subclasses: Pf2eSubclassOption[]
}

/** What a class shows for a search; null when nothing in it matches. */
export function pf2eClassMatch(cls: Pf2eClassDef, terms: string[]): Pf2eClassMatch | null {
  if (matchesAll(terms, cls.name))
    return { whole: true, features: cls.features, subclasses: cls.subclasses }
  const features = cls.features.filter((f) => matchesAll(terms, f.name, f.text))
  const subclasses = cls.subclasses.filter((o) => matchesAll(terms, o.kind, o.name, o.text))
  return features.length || subclasses.length ? { whole: false, features, subclasses } : null
}

export interface NimbleClassMatch {
  whole: boolean
  /** Whether an ability (a feature, pool option or subclass feature) shows. */
  shows: (a: AbilityDef) => boolean
  /** Subclasses whose name or any ability matched. */
  subclasses: Set<string>
  count: number
}

const subclassAbilities = (s: SubclassDef) => [
  ...(s.intro ?? []),
  ...Object.values(s.levels).flatMap((l) => l?.abilities ?? []),
]

export function nimbleClassMatch(cls: ClassDef, terms: string[]): NimbleClassMatch | null {
  if (matchesAll(terms, cls.name))
    return {
      whole: true,
      shows: () => true,
      subclasses: new Set(cls.subclasses.map((s) => s.slug)),
      count: 0,
    }
  const hit = (a: AbilityDef) => matchesAll(terms, a.name, a.desc)
  const all = [
    cls.swapRule,
    ...Object.values(cls.levels).flatMap((l) => l?.abilities ?? []),
    ...cls.pools.flatMap((p) => p.options),
    ...cls.subclasses.flatMap(subclassAbilities),
  ]
  const subclasses = new Set(
    cls.subclasses
      .filter((s) => matchesAll(terms, s.name, s.tagline) || subclassAbilities(s).some(hit))
      .map((s) => s.slug),
  )
  const count = all.filter(hit).length
  return count || subclasses.size ? { whole: false, shows: hit, subclasses, count } : null
}
