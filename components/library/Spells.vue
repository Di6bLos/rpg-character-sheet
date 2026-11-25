<script setup lang="ts">
// Library → Spells: every spell of a game system as a searchable, sortable table (a card list
// on phones), filtered by rank or tier, tradition or school and the rest; a row opens the
// spell's full text. The search, filters and sort are in the URL (?tab=spells&system=pf2e&
// q=fire&rank=3&sort=actions) so a link opens the same list. PF2e has ~1,200 spells, so the
// list shows 100 rows at a time and is filtered from text lower-cased once on load.
import { loadPf2e } from '~/data/pf2e'
import type { Pf2eSpellDef } from '~/data/pf2e/types'
import { SCHOOL_LABELS, SPELLS } from '~/data/nimble/spells'
import type { SpellDef, SpellSchool } from '~/data/nimble/types'
import type { RulesSystem } from '~/data/rules'
import type { GameSystem } from '~/types'
import {
  COMPENDIUM_SYSTEMS,
  DEFAULT_SPELL_SORT,
  NIMBLE_SPELL_COLUMNS,
  PF2E_SPELL_COLUMNS,
  compendiumList,
  nimbleCast,
  nimbleCost,
  nimbleSpellKeep,
  nimbleTierLabel,
  pf2eRangeArea,
  pf2eSpellClasses,
  pf2eSpellKeep,
  pf2eSpellRank,
  pf2eSpellTraits,
  readSpellQuery,
  searchable,
  sourceLabel,
  writeSpellQuery,
  type SortDir,
  type SpellColumn,
  type SpellQuery,
} from '~/utils/libraryCompendium'
import { loreHtml } from '~/utils/loreText'
import { actionGlyph, actionWords } from '~/utils/pf2eBuild'

const route = useRoute()
const router = useRouter()

const isReady = (s: RulesSystem) => COMPENDIUM_SYSTEMS.includes(s.id)
const sys = useLibrarySystem(isReady)
const pf2e = computed(() => sys.value?.id === 'pf2e')
const state = computed(() => readSpellQuery(route.query))

/**
 * Filters and sort go in the URL without adding history; a system switch does add it. Changes
 * made before the last one lands build on it, so two quick clicks both count.
 */
let pending: SpellQuery | null = null
function update(changes: Partial<SpellQuery>) {
  const next = { ...(pending ?? state.value), ...changes }
  pending = next
  void router
    .replace({
      path: '/library',
      query: { ...route.query, tab: 'spells', system: sys.value?.id, ...writeSpellQuery(next) },
    })
    .finally(() => {
      if (pending === next) pending = null
    })
}

/** A new system keeps only the search: the filters belong to the old one. */
function pickSystem(id: GameSystem) {
  if (id === sys.value?.id) return
  const kept = writeSpellQuery({ ...readSpellQuery({}), q: q.value, full: state.value.full })
  void router.push({ path: '/library', query: { tab: 'spells', system: id, ...kept } })
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
const rare = computed({
  get: () => state.value.rare,
  set: (on: boolean) => update({ rare: on }),
})

// --- Data --------------------------------------------------------------------------
const pf2eSpells = shallowRef<Pf2eSpellDef[] | null>(null)
const failed = ref('')
async function load() {
  if (!pf2e.value || pf2eSpells.value) return
  failed.value = ''
  try {
    pf2eSpells.value = await loadPf2e('spells')
  } catch (err) {
    console.error(err)
    failed.value = 'Could not load the spells.'
  }
}
watch(pf2e, load, { immediate: true })

const pf2eIndex = computed(() =>
  (pf2eSpells.value ?? []).map((s) =>
    searchable(s, s.name, `${s.traits.join(' ')} ${s.traditions.join(' ')} ${s.text}`),
  ),
)
const nimbleIndex = SPELLS.map((s) => searchable(s, s.name, `${s.cast} ${s.desc}`))

const pf2eTraits = computed(() => pf2eSpellTraits(pf2eSpells.value ?? []))
const pf2eClasses = computed(() => pf2eSpellClasses(pf2eSpells.value ?? []))
const pf2eTraditions = computed(() =>
  [...new Set((pf2eSpells.value ?? []).flatMap((s) => s.traditions))].sort(),
)
const pf2eRanks = Array.from({ length: 10 }, (_, i) => i + 1)
const nimbleTiers = [...new Set(SPELLS.filter((s) => s.tier > 0).map((s) => s.tier))].sort(
  (a, b) => a - b,
)
const SCHOOLS = Object.keys(SCHOOL_LABELS) as SpellSchool[]
const KINDS = [
  { id: 'spell', label: 'Spells' },
  { id: 'cantrip', label: 'Cantrips' },
  { id: 'focus', label: 'Focus spells' },
]

// --- One shape for both systems' rows ------------------------------------------------
interface SpellView {
  id: string
  name: string
  /** Display text per column key. */
  cells: Record<string, string>
  /** Action glyphs (PF2e) with their words for screen readers. */
  glyph: string
  glyphWords: string
  /** Phones: the rank or tier badge and one line under the name. */
  level: string
  meta: string
  rarity?: string
  traits: string[]
  stats: { label: string; value: string }[]
  text: string
  source: string
}

const views = new WeakMap<object, SpellView>()
const memo = <T extends object>(raw: T, make: (raw: T) => SpellView) => {
  let v = views.get(raw)
  if (!v) views.set(raw, (v = make(raw)))
  return v
}

function pf2eView(s: Pf2eSpellDef): SpellView {
  const rank = pf2eSpellRank(s)
  const where = s.traditions.join(', ') || (s.classes.length ? `${s.classes.join(', ')}` : '')
  const level = rank === 0 ? 'Cantrip' : s.kind === 'focus' ? `Focus ${rank}` : `Rank ${rank}`
  const rangeArea = pf2eRangeArea(s)
  return {
    id: s.id,
    name: s.name,
    cells: {
      rank: rank === 0 ? 'Cantrip' : s.kind === 'focus' ? `${rank} focus` : String(rank),
      traditions: where,
      defense: s.defense ?? '',
      range: rangeArea,
      source: sourceLabel(s.source),
    },
    glyph: actionGlyph(s.actions),
    glyphWords: actionWords(s.actions),
    level,
    meta: [where, rangeArea, s.defense].filter(Boolean).join(' · '),
    rarity: s.rarity === 'common' ? undefined : s.rarity,
    traits: s.traits.filter((t) => !['Uncommon', 'Rare', 'Unique'].includes(t)),
    stats: [
      { label: 'Traditions', value: s.traditions.join(', ') },
      { label: 'Classes', value: s.classes.join(', ') },
      { label: 'Cast', value: actionWords(s.actions) },
      { label: 'Cost', value: s.cost ?? '' },
      { label: 'Trigger', value: s.trigger ?? '' },
      { label: 'Requirements', value: s.requirements ?? '' },
      { label: 'Range', value: s.range ?? '' },
      { label: 'Area', value: s.area ?? '' },
      { label: 'Targets', value: s.targets ?? '' },
      { label: 'Defense', value: s.defense ?? '' },
      { label: 'Duration', value: s.duration ?? '' },
    ].filter((x) => x.value),
    text: s.text,
    source: sourceLabel(s.source),
  }
}

function nimbleView(s: SpellDef): SpellView {
  const cast = nimbleCast(s)
  const cost = nimbleCost(s)
  const actions = /^\d+$/.test(cast.actions)
    ? `${cast.actions} ${cast.actions === '1' ? 'action' : 'actions'}`
    : cast.actions
  const school = SCHOOL_LABELS[s.school]
  return {
    id: s.name,
    name: s.name,
    cells: {
      tier: nimbleTierLabel(s),
      school,
      cost: cost ? `${cost} mana` : '—',
      actions,
    },
    glyph: '',
    glyphWords: '',
    level: nimbleTierLabel(s),
    meta: [school, actions, cast.target, cost ? `${cost} mana` : ''].filter(Boolean).join(' · '),
    traits: [],
    stats: [
      { label: 'School', value: school },
      { label: 'Tier', value: nimbleTierLabel(s) },
      { label: 'Cost', value: cost ? `${cost} mana` : 'No mana' },
      { label: 'Cast', value: s.cast },
      { label: 'Class', value: s.classOnly ? capitalise(s.classOnly) : '' },
    ].filter((x) => x.value),
    text: s.desc,
    source: '',
  }
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// --- The list ----------------------------------------------------------------------
const columns = computed<SpellColumn<Pf2eSpellDef>[] | SpellColumn<SpellDef>[]>(() =>
  pf2e.value ? PF2E_SPELL_COLUMNS : NIMBLE_SPELL_COLUMNS,
)
const sortKey = computed(() => {
  const keys = columns.value.map((c) => c.key)
  return keys.includes(state.value.sort)
    ? state.value.sort
    : (DEFAULT_SPELL_SORT[sys.value?.id ?? ''] ?? 'name')
})

const all = computed<SpellView[]>(() => {
  const s = state.value
  const opts = { q: q.value, full: s.full, dir: s.dir }
  if (pf2e.value) {
    const col = PF2E_SPELL_COLUMNS.find((c) => c.key === sortKey.value) ?? PF2E_SPELL_COLUMNS[0]
    return compendiumList(pf2eIndex.value, {
      ...opts,
      keep: pf2eSpellKeep(s),
      value: col?.value ?? (() => undefined),
    }).map((x) => memo(x, pf2eView))
  }
  const col = NIMBLE_SPELL_COLUMNS.find((c) => c.key === sortKey.value) ?? NIMBLE_SPELL_COLUMNS[0]
  return compendiumList(nimbleIndex, {
    ...opts,
    keep: nimbleSpellKeep(s),
    value: col?.value ?? (() => undefined),
  }).map((x) => memo(x, nimbleView))
})

const PAGE = 100
const limit = ref(PAGE)
const shown = computed(() => all.value.slice(0, limit.value))
watch(
  () => [q.value, sys.value?.id, JSON.stringify({ ...state.value, q: '' })],
  () => (limit.value = PAGE),
)

const total = computed(() =>
  pf2e.value
    ? (pf2eSpells.value ?? []).filter((s) => state.value.rare || s.rarity === 'common').length
    : SPELLS.length,
)
const loading = computed(() => pf2e.value && !pf2eSpells.value && !failed.value)

function sortBy(key: string) {
  const dir: SortDir = sortKey.value === key && state.value.dir === 'asc' ? 'desc' : 'asc'
  update({ sort: key === DEFAULT_SPELL_SORT[sys.value?.id ?? ''] && dir === 'asc' ? '' : key, dir })
}
const ariaSort = (key: string) =>
  sortKey.value === key ? (state.value.dir === 'desc' ? 'descending' : 'ascending') : undefined

const phoneSort = computed({
  get: () => sortKey.value,
  set: (key: string) =>
    update({ sort: key === DEFAULT_SPELL_SORT[sys.value?.id ?? ''] ? '' : key, dir: 'asc' }),
})
function flipDir() {
  update({ sort: state.value.sort, dir: state.value.dir === 'asc' ? 'desc' : 'asc' })
}

// --- Filters -----------------------------------------------------------------------
function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
}
const activeFilters = computed(() => {
  const s = state.value
  return [
    s.rank,
    s.kind.length,
    s.trad.length,
    s.cls,
    s.trait,
    s.tier,
    s.school.length,
    s.rare,
  ].filter(Boolean).length
})
/** Phones fold the filters away behind a button, so the list starts near the top. */
const filtersOpen = ref(false)
const filtering = computed(() => {
  const s = state.value
  return !!(
    s.rank ||
    s.kind.length ||
    s.trad.length ||
    s.cls ||
    s.trait ||
    s.tier ||
    s.school.length
  )
})
function clearFilters() {
  update({ rank: '', kind: [], trad: [], cls: '', trait: '', tier: '', school: [] })
}
const selectModel = (key: 'rank' | 'cls' | 'trait' | 'tier') =>
  computed({
    get: () => state.value[key],
    set: (value: string) => update({ [key]: value }),
  })
const rank = selectModel('rank')
const cls = selectModel('cls')
const trait = selectModel('trait')
const tier = selectModel('tier')

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

// --- Reading a spell ---------------------------------------------------------------
const reading = ref<SpellView | null>(null)
const readingOpen = computed({
  get: () => reading.value !== null,
  set: (open) => {
    if (!open) reading.value = null
  },
})

const toolbarEl = ref<HTMLElement | null>(null)
const toolbarStuck = useStuck(toolbarEl)
</script>

<template>
  <div class="spells">
    <div ref="toolbarEl" class="toolbar sticky-bar" :class="{ 'is-stuck': toolbarStuck }">
      <LibrarySystemPicker
        :current="sys?.id"
        :is-ready="isReady"
        what="spells"
        @pick="pickSystem"
      />
      <div class="search">
        <label for="spells-q" class="sr-only">Search {{ sys?.label }} spells</label>
        <input
          id="spells-q"
          v-model="q"
          class="input"
          type="search"
          :placeholder="`Search ${sys?.label ?? ''} spells`"
        />
      </div>
    </div>

    <button
      v-if="sys && phone"
      type="button"
      class="btn btn--ghost filters__toggle"
      :aria-expanded="filtersOpen"
      aria-controls="spells-filters"
      @click="filtersOpen = !filtersOpen"
    >
      Filters<template v-if="activeFilters"> ({{ activeFilters }})</template>
      <span aria-hidden="true">{{ filtersOpen ? '▲' : '▼' }}</span>
    </button>
    <div
      v-if="sys"
      v-show="!phone || filtersOpen"
      id="spells-filters"
      class="filters"
      role="group"
      aria-label="Filter spells"
    >
      <template v-if="pf2e">
        <div class="field">
          <label for="spells-rank">Rank</label>
          <select id="spells-rank" v-model="rank" class="input">
            <option value="">Any rank</option>
            <option value="0">Cantrip</option>
            <option v-for="r in pf2eRanks" :key="r" :value="String(r)">Rank {{ r }}</option>
          </select>
        </div>
        <div class="field">
          <label for="spells-class">Class</label>
          <select id="spells-class" v-model="cls" class="input">
            <option value="">Any class</option>
            <option v-for="c in pf2eClasses" :key="c" :value="c.toLowerCase()">{{ c }}</option>
          </select>
        </div>
        <div class="field">
          <label for="spells-trait">Trait</label>
          <select id="spells-trait" v-model="trait" class="input">
            <option value="">Any trait</option>
            <option v-for="t in pf2eTraits" :key="t" :value="t.toLowerCase()">{{ t }}</option>
          </select>
        </div>
        <div class="chips" role="group" aria-label="Kind">
          <button
            v-for="k in KINDS"
            :key="k.id"
            type="button"
            class="chip"
            :aria-pressed="state.kind.includes(k.id)"
            @click="update({ kind: toggle(state.kind, k.id) })"
          >
            {{ k.label }}
          </button>
        </div>
        <div class="chips" role="group" aria-label="Tradition">
          <button
            v-for="t in pf2eTraditions"
            :key="t"
            type="button"
            class="chip"
            :aria-pressed="state.trad.includes(t.toLowerCase())"
            @click="update({ trad: toggle(state.trad, t.toLowerCase()) })"
          >
            {{ t }}
          </button>
        </div>
      </template>
      <template v-else>
        <div class="field">
          <label for="spells-tier">Tier</label>
          <select id="spells-tier" v-model="tier" class="input">
            <option value="">Any tier</option>
            <option value="cantrip">Cantrip</option>
            <option value="utility">Utility</option>
            <option v-for="t in nimbleTiers" :key="t" :value="String(t)">Tier {{ t }}</option>
          </select>
        </div>
        <div class="chips" role="group" aria-label="School">
          <button
            v-for="s in SCHOOLS"
            :key="s"
            type="button"
            class="chip"
            :aria-pressed="state.school.includes(s)"
            @click="update({ school: toggle(state.school, s) })"
          >
            {{ SCHOOL_LABELS[s] }}
          </button>
        </div>
      </template>
      <div class="filters__switches">
        <UiSwitch v-model="full" label="Search the rules text too" small />
        <UiSwitch v-if="pf2e" v-model="rare" label="Show uncommon and rare" small />
      </div>
    </div>

    <div class="summary">
      <p class="small muted" role="status">
        <template v-if="loading">Loading spells…</template>
        <template v-else>
          {{ all.length }} of {{ total }} spells<template v-if="all.length > shown.length"
            >, showing the first {{ shown.length }}</template
          >
        </template>
      </p>
      <button v-if="filtering" type="button" class="btn btn--quiet btn--sm" @click="clearFilters">
        Clear filters
      </button>
      <div v-if="phone" class="summary__sort">
        <label for="spells-sort" class="sr-only">Sort by</label>
        <select id="spells-sort" v-model="phoneSort" class="input">
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
      <button type="button" class="btn btn--ghost btn--sm" @click="load">Try again</button>
    </p>

    <section v-else class="panel panel--flush" :aria-label="`${sys?.label ?? ''} spells`">
      <div v-if="loading" class="spinner" role="status" aria-label="Loading spells" />

      <ul v-else-if="phone" class="cards">
        <li v-for="v in shown" :key="v.id">
          <button type="button" class="card" aria-haspopup="dialog" @click="reading = v">
            <span class="card__head">
              <strong>{{ v.name }}</strong>
              <span v-if="v.glyph" class="glyph"
                ><span aria-hidden="true">{{ v.glyph }}</span
                ><span class="sr-only">{{ v.glyphWords }}</span></span
              >
              <span v-if="v.rarity" class="rarity">{{ v.rarity }}</span>
              <span class="card__level">{{ v.level }}</span>
            </span>
            <span v-if="v.meta" class="card__meta">{{ v.meta }}</span>
          </button>
        </li>
      </ul>

      <div
        v-else
        class="table-wrap"
        tabindex="0"
        role="region"
        aria-label="Spells, scroll sideways for more"
      >
        <table class="table spell-table">
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
          <tbody>
            <tr v-for="v in shown" :key="v.id" @click="reading = v">
              <td v-for="c in columns" :key="c.key" :class="`col-${c.key}`">
                <template v-if="c.key === 'name'">
                  <button type="button" class="name" aria-haspopup="dialog">
                    <strong>{{ v.name }}</strong>
                  </button>
                  <span v-if="v.rarity" class="rarity">{{ v.rarity }}</span>
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
          </tbody>
        </table>
      </div>

      <p v-if="!loading && !all.length" class="empty-list muted">
        {{ q.trim() ? `No spells match “${q.trim()}”.` : 'No spells match these filters.' }}
        <button v-if="filtering" type="button" class="btn btn--ghost btn--sm" @click="clearFilters">
          Clear filters
        </button>
      </p>
    </section>

    <button
      v-if="all.length > shown.length"
      type="button"
      class="btn btn--ghost more"
      @click="limit += PAGE"
    >
      Show {{ Math.min(PAGE, all.length - shown.length) }} more
    </button>

    <LibraryNotice v-if="sys" :text="sys.attribution" />

    <UiDialog v-model="readingOpen" :title="reading?.name ?? ''" width="640px" sheet>
      <template #eyebrow>
        <p v-if="reading" class="eyebrow read__eyebrow">
          <span v-if="reading.glyph" class="glyph"
            ><span aria-hidden="true">{{ reading.glyph }}</span
            ><span class="sr-only">{{ reading.glyphWords }}</span></span
          >
          {{ reading.level }}<template v-if="reading.rarity"> · {{ reading.rarity }}</template>
        </p>
      </template>
      <template v-if="reading">
        <ul v-if="reading.traits.length" class="read__traits" aria-label="Traits">
          <li v-for="t in reading.traits" :key="t" class="badge badge--outline">{{ t }}</li>
        </ul>
        <dl class="read__stats">
          <div v-for="st in reading.stats" :key="st.label">
            <dt>{{ st.label }}</dt>
            <dd>{{ st.value }}</dd>
          </div>
        </dl>
        <!-- eslint-disable-next-line vue/no-v-html -- loreHtml escapes everything first -->
        <div class="read__text" v-html="loreHtml(reading.text, { headingBase: 3 })" />
        <p v-if="reading.source" class="read__source">{{ reading.source }}</p>
      </template>
      <template #actions>
        <button type="button" class="btn btn--ghost" @click="reading = null">Close</button>
      </template>
    </UiDialog>
  </div>
</template>

<style scoped lang="scss">
.spells {
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

.spell-table {
  min-width: 860px;
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

  tbody tr {
    cursor: pointer;

    &:hover td {
      background: var(--accent-tint);
    }
  }

  .col-name {
    min-width: 200px;
  }

  .col-rank,
  .col-tier,
  .col-cost {
    white-space: nowrap;
  }

  .col-source,
  .col-traditions,
  .col-defense,
  .col-range {
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
  align-items: baseline;
  gap: 8px;
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

.more {
  align-self: center;
}

.read__eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 4px;
  text-transform: capitalize;
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

.read__text {
  font-size: 15px;
  line-height: 1.6;

  :deep(p),
  :deep(ul),
  :deep(ol) {
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
