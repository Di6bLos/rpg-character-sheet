<script setup lang="ts">
// Library → Feats, Backgrounds and Species (Ancestries): one system's entries as a searchable,
// sortable table (a card list on phones), filtered by the facets that system has (category,
// prerequisite, level, source…); a row opens the entry in a modal. Like Spells, the search,
// filters, sort and open entry are in the URL (?tab=feats&system=dnd5e&category=origin&
// entry=alert), so a link opens the same view. Feats fold into sections by category (5e Origin,
// General, Fighting Style, Epic Boon; PF2e ancestry, class, skill…), remembered per browser
// (useLibrarySections); the other tabs are one flat list. PF2e has ~3,800 feats, so a section
// renders its rows only while open, 100 at a time.
import type { RulesSystem } from '~/data/rules'
import type { GameSystem } from '~/types'
import type { SortDir } from '~/utils/libraryCompendium'
import {
  ENTRY_SYSTEMS,
  entryIndex,
  entryNoun,
  entryRows,
  entryTabLabel,
  readEntryQuery,
  writeEntryQuery,
  type EntryQuery,
  type EntryTab,
  type EntryView,
} from '~/utils/libraryEntries'
import { SECTION_PAGE, groupSections, sectionStorageKey } from '~/utils/librarySections'
import { loreHtml } from '~/utils/loreText'

const props = defineProps<{ tab: EntryTab }>()

const route = useRoute()
const router = useRouter()

const isReady = (s: RulesSystem) => ENTRY_SYSTEMS[props.tab].includes(s.id)
const sys = useLibrarySystem(isReady)
const { list, failed, retry } = useLibraryEntries(
  props.tab,
  computed(() => sys.value?.id),
)
const label = computed(() => entryTabLabel(props.tab, sys.value?.id))
const noun = computed(() => entryNoun(props.tab, sys.value?.id))
const filters = computed(() => list.value?.filters ?? [])
const state = computed(() => readEntryQuery(route.query, filters.value))

/**
 * Filters and sort go in the URL without adding history; a system switch does add it. Changes
 * made before the last one lands build on it, so two quick clicks both count.
 */
let pending: EntryQuery | null = null
function update(changes: Partial<EntryQuery>) {
  const next = { ...(pending ?? state.value), ...changes }
  pending = next
  const cleared = Object.fromEntries(filters.value.map((f) => [f.key, undefined]))
  void router
    .replace({
      path: '/library',
      query: {
        ...route.query,
        ...cleared,
        tab: props.tab,
        system: sys.value?.id,
        ...writeEntryQuery(next, filters.value),
      },
    })
    .finally(() => {
      if (pending === next) pending = null
    })
}

/** A new system keeps only the search: the filters belong to the old one. */
function pickSystem(id: GameSystem) {
  if (id === sys.value?.id) return
  const query: Record<string, string | undefined> = { tab: props.tab, system: id }
  if (q.value.trim()) query.q = q.value.trim()
  if (!state.value.full) query.full = '0'
  void router.push({ path: '/library', query })
}

// --- Search ------------------------------------------------------------------------
const q = ref(state.value.q)
let typing: ReturnType<typeof setTimeout> | undefined
watch(q, (value) => {
  clearTimeout(typing)
  typing = setTimeout(() => {
    if (state.value.q !== value.trim()) update({ q: value })
  }, 400)
})
watch(
  () => state.value.q,
  (value) => {
    if (value !== q.value.trim()) q.value = value
  },
)
onBeforeUnmount(() => clearTimeout(typing))

const full = computed({
  get: () => state.value.full,
  set: (on: boolean) => update({ full: on }),
})

// --- The list ----------------------------------------------------------------------
const index = computed(() => (list.value ? entryIndex(list.value.entries) : []))
const columns = computed(() => list.value?.columns ?? [])
const defaultSort = computed(() => list.value?.defaultSort ?? 'name')
const sortKey = computed(() =>
  columns.value.some((c) => c.key === state.value.sort) ? state.value.sort : defaultSort.value,
)
const all = computed(() => entryRows(index.value, { ...state.value, q: q.value }, sortKey.value))

/** A list without sections is one section with no header, so paging works the same. */
const grouped = computed(() => !!list.value?.sections)
const sections = computed(() => {
  const by = list.value?.sections
  if (!by) return all.value.length ? [{ key: 'all', label: noun.value.many, rows: all.value }] : []
  return groupSections(all.value, by.defs, (e) => e.facets[by.facet] ?? [])
})
const fold = useLibrarySections({
  sections,
  storageKey: computed(() =>
    grouped.value && sys.value ? sectionStorageKey(props.tab, sys.value.id) : '',
  ),
  search: q,
  reset: () => [q.value, sys.value?.id, JSON.stringify({ ...state.value, q: '' })],
})
const sectionId = (key: string) => `${props.tab}-section-${key}`
const total = computed(() => list.value?.entries.length ?? 0)
const loading = computed(() => !list.value && !failed.value)

function sortBy(key: string) {
  const dir: SortDir = sortKey.value === key && state.value.dir === 'asc' ? 'desc' : 'asc'
  update({ sort: key === defaultSort.value && dir === 'asc' ? '' : key, dir })
}
const ariaSort = (key: string) =>
  sortKey.value === key ? (state.value.dir === 'desc' ? 'descending' : 'ascending') : undefined

const phoneSort = computed({
  get: () => sortKey.value,
  set: (key: string) => update({ sort: key === defaultSort.value ? '' : key, dir: 'asc' }),
})
function flipDir() {
  update({ sort: state.value.sort, dir: state.value.dir === 'asc' ? 'desc' : 'asc' })
}

// --- Filters -----------------------------------------------------------------------
const picked = (key: string) => state.value.picked[key] ?? []
function pick(key: string, values: string[]) {
  update({ picked: { ...state.value.picked, [key]: values } })
}
function toggle(key: string, value: string) {
  const now = picked(key)
  pick(key, now.includes(value) ? now.filter((x) => x !== value) : [...now, value])
}
const activeFilters = computed(
  () => Object.values(state.value.picked).filter((v) => v.length).length,
)
const filtering = computed(() => activeFilters.value > 0)
function clearFilters() {
  update({ picked: {} })
}
/** Phones fold the filters away behind a button, so the list starts near the top. */
const filtersOpen = ref(false)
const filtersId = computed(() => `${props.tab}-filters`)

// --- Phones get cards ------------------------------------------------------------------
const phone = ref(false)
let media: MediaQueryList | undefined
const onMedia = (e: MediaQueryListEvent | MediaQueryList) => (phone.value = e.matches)
onMounted(() => {
  media = window.matchMedia('(max-width: 640px)')
  onMedia(media)
  media.addEventListener('change', onMedia)
})
onBeforeUnmount(() => media?.removeEventListener('change', onMedia))

// --- Reading an entry --------------------------------------------------------------
const reading = computed<EntryView | null>(() => {
  const id = route.query.entry
  if (typeof id !== 'string' || !id) return null
  return list.value?.entries.find((e) => e.id === id) ?? null
})
function readEntry(id?: string) {
  void router.replace({ query: { ...route.query, entry: id } })
}
const readingOpen = computed({
  get: () => reading.value !== null,
  set: (open) => {
    if (!open) readEntry()
  },
})
const html = (md: string) => loreHtml(md, { headingBase: 3 })

const toolbarEl = ref<HTMLElement | null>(null)
const toolbarStuck = useStuck(toolbarEl)
</script>

<template>
  <div class="entries">
    <div ref="toolbarEl" class="toolbar sticky-bar" :class="{ 'is-stuck': toolbarStuck }">
      <LibrarySystemPicker
        :current="sys?.id"
        :is-ready="isReady"
        :what="noun.many"
        hide-missing
        @pick="pickSystem"
      />
      <div class="search">
        <label :for="`${tab}-q`" class="sr-only">Search {{ sys?.label }} {{ noun.many }}</label>
        <input
          :id="`${tab}-q`"
          v-model="q"
          class="input"
          type="search"
          :placeholder="`Search ${sys?.label ?? ''} ${noun.many}`"
        />
      </div>
    </div>

    <button
      v-if="sys && phone && filters.length"
      type="button"
      class="btn btn--ghost filters__toggle"
      :aria-expanded="filtersOpen"
      :aria-controls="filtersId"
      @click="filtersOpen = !filtersOpen"
    >
      Filters<template v-if="activeFilters"> ({{ activeFilters }})</template>
      <span aria-hidden="true">{{ filtersOpen ? '▲' : '▼' }}</span>
    </button>
    <div
      v-if="sys && list"
      v-show="!phone || filtersOpen"
      :id="filtersId"
      class="filters"
      role="group"
      :aria-label="`Filter ${noun.many}`"
    >
      <template v-for="f in filters" :key="f.key">
        <div v-if="f.kind === 'select'" class="field">
          <label :for="`${tab}-${f.key}`">{{ f.label }}</label>
          <select
            :id="`${tab}-${f.key}`"
            class="input"
            :value="picked(f.key)[0] ?? ''"
            @change="pick(f.key, [($event.target as HTMLSelectElement).value].filter(Boolean))"
          >
            <option value="">{{ f.any ?? 'Any' }}</option>
            <option v-for="o in f.options" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </div>
        <div v-else class="chips" role="group" :aria-label="f.label">
          <button
            v-for="o in f.options"
            :key="o.value"
            type="button"
            class="chip"
            :aria-pressed="picked(f.key).includes(o.value)"
            @click="toggle(f.key, o.value)"
          >
            {{ o.label }}
          </button>
        </div>
      </template>
      <div class="filters__switches">
        <UiSwitch v-model="full" label="Search the rules text too" small />
      </div>
    </div>

    <div class="summary">
      <p class="small muted" role="status">
        <template v-if="loading">Loading {{ noun.many }}…</template>
        <template v-else>
          {{ all.length }} of {{ total }} {{ total === 1 ? noun.one : noun.many }}
        </template>
      </p>
      <button v-if="filtering" type="button" class="btn btn--quiet btn--sm" @click="clearFilters">
        Clear filters
      </button>
      <LibrarySectionTools
        v-if="grouped && sections.length > 1"
        :all-open="fold.allOpen.value"
        :all-closed="fold.allClosed.value"
        @expand="fold.expandAll"
        @collapse="fold.collapseAll"
      />
      <div v-if="phone && columns.length" class="summary__sort">
        <label :for="`${tab}-sort`" class="sr-only">Sort by</label>
        <select :id="`${tab}-sort`" v-model="phoneSort" class="input">
          <option v-for="c in columns" :key="c.key" :value="c.key">Sort: {{ c.label }}</option>
        </select>
        <button
          type="button"
          class="btn btn--ghost btn--icon"
          :aria-label="state.dir === 'desc' ? 'Sorted high to low' : 'Sorted low to high'"
          :aria-pressed="state.dir === 'desc'"
          @click="flipDir"
        >
          <span aria-hidden="true">{{ state.dir === 'desc' ? '↓' : '↑' }}</span>
        </button>
      </div>
    </div>

    <p v-if="failed" class="notice notice--error" role="alert">
      {{ failed }}
      <button type="button" class="btn btn--ghost btn--sm" @click="retry">Try again</button>
    </p>

    <section v-else class="panel panel--flush" :aria-label="`${sys?.label ?? ''} ${label}`">
      <div v-if="loading" class="spinner" role="status" :aria-label="`Loading ${noun.many}`" />

      <div v-else-if="phone">
        <div v-for="sec in sections" :key="sec.key" class="group">
          <LibrarySectionHead
            v-if="grouped"
            :label="sec.label"
            :count="sec.rows.length"
            :open="fold.isOpen(sec.key)"
            :controls="sectionId(sec.key)"
            @toggle="fold.toggle(sec.key)"
          />
          <ul
            :id="sectionId(sec.key)"
            class="cards"
            :class="{ 'cards--grouped': grouped }"
            :hidden="!fold.isOpen(sec.key)"
          >
            <li v-for="v in fold.isOpen(sec.key) ? fold.shown(sec) : []" :key="v.id">
              <button type="button" class="card" aria-haspopup="dialog" @click="readEntry(v.id)">
                <span class="card__head">
                  <strong>{{ v.name }}</strong>
                  <span v-if="v.glyph" class="glyph"
                    ><span aria-hidden="true">{{ v.glyph }}</span
                    ><span class="sr-only">{{ v.glyphWords }}</span></span
                  >
                  <span v-if="v.rarity" class="rarity">{{ v.rarity }}</span>
                  <span v-if="v.tag" class="badge badge--outline">{{ v.tag }}</span>
                  <span v-if="v.badge" class="card__level">{{ v.badge }}</span>
                </span>
                <span v-if="v.meta" class="card__meta">{{ v.meta }}</span>
              </button>
            </li>
          </ul>
          <button
            v-if="fold.isOpen(sec.key) && fold.hidden(sec)"
            type="button"
            class="btn btn--ghost more"
            @click="fold.showMore(sec.key)"
          >
            Show {{ Math.min(SECTION_PAGE, fold.hidden(sec)) }} more<span class="sr-only">
              in {{ sec.label }}</span
            >
          </button>
        </div>
      </div>

      <div
        v-else
        class="table-wrap"
        tabindex="0"
        role="region"
        :aria-label="`${label}, scroll sideways for more`"
      >
        <table class="table entry-table">
          <thead>
            <tr>
              <th
                v-for="c in columns"
                :key="c.key"
                scope="col"
                :aria-sort="ariaSort(c.key)"
                :class="`col-${c.key}`"
              >
                <button type="button" class="sort" @click="sortBy(c.key)">
                  {{ c.label }}
                  <span class="sort__arrow" aria-hidden="true">{{
                    ariaSort(c.key) === 'descending' ? '▼' : ariaSort(c.key) ? '▲' : '↕'
                  }}</span>
                </button>
              </th>
            </tr>
          </thead>
          <tbody v-for="sec in sections" :id="sectionId(sec.key)" :key="sec.key">
            <tr v-if="grouped" class="group-row">
              <th :colspan="columns.length" scope="rowgroup">
                <LibrarySectionHead
                  :label="sec.label"
                  :count="sec.rows.length"
                  :open="fold.isOpen(sec.key)"
                  :controls="sectionId(sec.key)"
                  @toggle="fold.toggle(sec.key)"
                />
              </th>
            </tr>
            <tr
              v-for="v in fold.isOpen(sec.key) ? fold.shown(sec) : []"
              :key="v.id"
              @click="readEntry(v.id)"
            >
              <td v-for="c in columns" :key="c.key" :class="`col-${c.key}`">
                <template v-if="c.key === 'name'">
                  <button type="button" class="name" aria-haspopup="dialog">
                    <strong>{{ v.name }}</strong>
                  </button>
                  <span v-if="v.rarity" class="rarity">{{ v.rarity }}</span>
                  <span v-if="v.tag" class="badge badge--outline tag">{{ v.tag }}</span>
                </template>
                <template v-else-if="c.key === 'actions' && v.glyph">
                  <span class="glyph" :title="v.glyphWords"
                    ><span aria-hidden="true">{{ v.glyph }}</span
                    ><span class="sr-only">{{ v.glyphWords }}</span></span
                  >
                </template>
                <template v-else>{{ v.cells[c.key] || '—' }}</template>
              </td>
            </tr>
            <tr v-if="fold.isOpen(sec.key) && fold.hidden(sec)" class="more-row">
              <td :colspan="columns.length">
                <button
                  type="button"
                  class="btn btn--ghost btn--sm"
                  @click="fold.showMore(sec.key)"
                >
                  Show {{ Math.min(SECTION_PAGE, fold.hidden(sec)) }} more<span class="sr-only">
                    in {{ sec.label }}</span
                  >
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p v-if="!loading && !all.length" class="empty-list muted">
        {{
          q.trim() ? `No ${noun.many} match “${q.trim()}”.` : `No ${noun.many} match these filters.`
        }}
        <button v-if="filtering" type="button" class="btn btn--ghost btn--sm" @click="clearFilters">
          Clear filters
        </button>
      </p>
    </section>

    <LibraryNotice v-if="sys" :text="sys.attribution" />

    <UiDialog v-model="readingOpen" :title="reading?.name ?? ''" width="680px" sheet>
      <template #eyebrow>
        <p v-if="reading" class="eyebrow read__eyebrow">
          <span v-if="reading.glyph" class="glyph"
            ><span aria-hidden="true">{{ reading.glyph }}</span
            ><span class="sr-only">{{ reading.glyphWords }}</span></span
          >
          {{ reading.eyebrow }}<template v-if="reading.rarity"> · {{ reading.rarity }}</template>
          <span v-if="reading.tag" class="badge badge--outline">{{ reading.tag }}</span>
        </p>
      </template>
      <template v-if="reading">
        <ul v-if="reading.traits.length" class="read__traits" aria-label="Traits">
          <li v-for="t in reading.traits" :key="t" class="badge badge--outline">{{ t }}</li>
        </ul>
        <dl v-if="reading.stats.length" class="read__stats">
          <div v-for="st in reading.stats" :key="st.label">
            <dt>{{ st.label }}</dt>
            <dd>{{ st.value }}</dd>
          </div>
        </dl>
        <p v-if="reading.summary" class="read__summary">{{ reading.summary }}</p>
        <ul v-if="reading.facts.length" class="read__facts">
          <li v-for="f in reading.facts" :key="f">{{ f }}</li>
        </ul>
        <!-- eslint-disable-next-line vue/no-v-html -- loreHtml escapes everything first -->
        <div v-if="reading.text" class="read__text" v-html="html(reading.text)" />
        <section v-for="p in reading.parts" :key="p.title" class="read__part">
          <h3>{{ p.title }}</h3>
          <div v-for="item in p.items" :key="item.name" class="read__item">
            <h4>
              {{ item.name }}
              <span v-if="item.meta" class="read__meta">{{ item.meta }}</span>
            </h4>
            <LibraryItemBody :item="item" />
          </div>
        </section>
        <p v-if="reading.source" class="read__source">{{ reading.source }}</p>
      </template>
      <template #actions>
        <button type="button" class="btn btn--ghost" @click="readEntry()">Close</button>
      </template>
    </UiDialog>
  </div>
</template>

<style scoped lang="scss">
.entries {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.toolbar {
  --sticky-top: var(--subnav-h);
  margin-block: -10px;
  padding-block: 10px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.search {
  flex: 0 1 280px;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px 16px;

  .field {
    flex: 0 1 180px;
    min-width: 140px;
  }
}

.filters__toggle {
  align-self: flex-start;
  gap: 8px;

  span {
    font-size: 10px;
  }
}

.filters__switches {
  display: flex;
  flex-wrap: wrap;
  gap: 0 20px;
}

.summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  min-height: 36px;

  p {
    margin: 0;
  }
}

.summary__sort {
  display: flex;
  gap: 8px;
  flex: 1 1 100%;

  select {
    flex: 1;
  }
}

.entry-table {
  min-width: 760px;
  font-size: 14px;

  th {
    padding: 0;
  }

  td {
    padding: 8px 14px;
  }

  td:first-child {
    padding-left: 20px;
  }

  tbody tr:not(.group-row, .more-row) {
    cursor: pointer;

    &:hover td {
      background: var(--accent-tint);
    }
  }

  .group-row th {
    padding: 0;
    border-top: 1px solid var(--line);
  }

  tbody:first-of-type .group-row th {
    border-top: 0;
  }

  .more-row td {
    padding: 8px 20px 12px;
  }

  .col-name {
    min-width: 200px;
  }

  .col-level,
  .col-hp,
  .col-speed,
  .col-size,
  .col-abilities {
    white-space: nowrap;
  }

  td:not(.col-name) {
    color: var(--page-soft);
  }
}

.sort {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 44px;
  padding: 0 14px;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  text-align: left;
  white-space: nowrap;

  th:first-child & {
    padding-left: 20px;
  }

  &:hover {
    color: var(--page-text);
  }
}

.sort__arrow {
  font-size: 10px;
  opacity: 0.55;

  [aria-sort] & {
    opacity: 1;
    color: var(--accent-text);
  }
}

.name {
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--page-text);
  font: inherit;
  text-align: left;

  &:hover strong {
    color: var(--accent-text);
  }
}

.rarity {
  margin-left: 8px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--warn-bg);
  color: var(--warn-text);
  font-size: 11px;
  font-weight: 700;
  text-transform: capitalize;
  white-space: nowrap;
}

.tag {
  margin-left: 8px;
}

.glyph {
  font-size: 13px;
  letter-spacing: 0.05em;
  color: var(--accent-text);
  white-space: nowrap;
}

.cards {
  margin: 0;
  padding: 0;
  list-style: none;

  li + li {
    border-top: 1px solid var(--line);
  }
}

.card {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  min-height: 56px;
  padding: 10px 16px;
  border: 0;
  background: none;
  color: var(--page-text);
  font: inherit;
  text-align: left;

  &:hover,
  &:focus-visible {
    background: var(--accent-tint);
  }
}

.card__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;
  min-width: 0;

  strong {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .rarity {
    margin-left: 0;
  }
}

.card__level {
  margin-left: auto;
  flex: none;
  font-size: 12px;
  font-weight: 700;
  color: var(--page-muted);
  white-space: nowrap;
}

.card__meta {
  overflow: hidden;
  font-size: 13px;
  color: var(--page-muted);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.empty-list {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin: 0;
  padding: 24px 20px;
}

.group + .group {
  border-top: 1px solid var(--line);
}

.cards {
  &--grouped {
    border-top: 1px solid var(--line);
  }

  &[hidden] {
    display: none;
  }
}

.more {
  display: flex;
  width: calc(100% - 32px);
  margin: 8px 16px 12px;
}

.read__eyebrow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  margin: 0 0 4px;

  .badge {
    text-transform: none;
    letter-spacing: 0.02em;
  }
}

.read__traits {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0 0 12px;
  padding: 0;
  list-style: none;
}

.read__stats {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(180px, 100%), 1fr));
  gap: 8px 16px;
  margin: 0 0 16px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--line);

  dt {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--page-muted);
  }

  dd {
    margin: 0;
    font-size: 14px;
  }
}

.read__summary {
  margin: 0 0 10px;
  font-size: 15px;
  line-height: 1.6;
}

.read__facts {
  margin: 0 0 12px;
  padding-left: 20px;
  font-size: 14px;
  color: var(--page-soft);
}

.read__text {
  font-size: 15px;
  line-height: 1.6;

  :deep(p),
  :deep(ul),
  :deep(ol),
  :deep(.md-table) {
    margin: 0 0 10px;
  }

  :deep(ul),
  :deep(ol) {
    padding-left: 22px;
  }

  :deep(hr) {
    margin: 14px 0;
    border: 0;
    border-top: 1px solid var(--line);
  }

  :deep(h3),
  :deep(h4) {
    margin: 16px 0 6px;
    font-size: 16px;
  }
}

.read__part {
  margin-top: 16px;

  h3 {
    margin: 0 0 8px;
    font-size: 17px;
  }
}

.read__item {
  & + & {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
  }

  h4 {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 10px;
    margin: 0 0 4px;
    font-size: 15px;
  }
}

.read__meta {
  font-size: 13px;
  font-weight: 400;
  color: var(--page-muted);
}

.read__source {
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--page-muted);
}

@media (max-width: 860px) {
  .search {
    flex: 1 1 100%;
  }
}

@media (max-width: 640px) {
  .filters .field {
    flex: 1 1 140px;
  }
}
</style>
