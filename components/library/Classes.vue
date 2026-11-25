<script setup lang="ts">
// Library → Classes: every class of a game system as a folding section (closed until opened),
// with its advancement table, features by level, subclasses and options, and spell slots.
// The search narrows the list to the classes, features and options that match and opens them.
// `?tab=classes&system=pf2e&class=bard` opens and scrolls to that class; opening a class puts
// it in the URL so the link can be shared.
import { loadPf2e } from '~/data/pf2e'
import type { Pf2eClassDef } from '~/data/pf2e/types'
import { NIMBLE_CLASSES } from '~/data/nimble/classes'
import type { RulesSystem } from '~/data/rules'
import type { GameSystem } from '~/types'
import {
  COMPENDIUM_SYSTEMS,
  NIMBLE_CLASS_SOURCES,
  nimbleClassMatch,
  pf2eClassMatch,
  searchTerms,
  sourceLabel,
  type NimbleClassMatch,
  type Pf2eClassMatch,
} from '~/utils/libraryCompendium'
import { PF2E_ATTR_NAME } from '~/utils/pf2eBuild'

const route = useRoute()
const router = useRouter()

const isReady = (s: RulesSystem) => COMPENDIUM_SYSTEMS.includes(s.id)
const sys = useLibrarySystem(isReady)
const pf2e = computed(() => sys.value?.id === 'pf2e')

function pickSystem(id: GameSystem) {
  if (id === sys.value?.id) return
  void router.push({ path: '/library', query: { tab: 'classes', system: id } })
}

// --- Search ------------------------------------------------------------------------
const q = ref(typeof route.query.q === 'string' ? route.query.q : '')
const term = ref(q.value)
let typing: ReturnType<typeof setTimeout> | undefined
watch(q, (value) => {
  clearTimeout(typing)
  typing = setTimeout(() => {
    term.value = value
    if ((route.query.q ?? '') !== value.trim())
      void router.replace({ query: { ...route.query, q: value.trim() || undefined } })
  }, 200)
})
onBeforeUnmount(() => clearTimeout(typing))
const terms = computed(() => searchTerms(term.value))
const searching = computed(() => terms.value.length > 0)

// --- Data --------------------------------------------------------------------------
const pf2eClasses = shallowRef<Pf2eClassDef[] | null>(null)
const failed = ref('')
async function load() {
  if (!pf2e.value || pf2eClasses.value) return
  failed.value = ''
  try {
    pf2eClasses.value = await loadPf2e('classes')
  } catch (err) {
    console.error(err)
    failed.value = 'Could not load the classes.'
  }
}
watch(pf2e, load, { immediate: true })
const loading = computed(() => pf2e.value && !pf2eClasses.value && !failed.value)

interface ClassEntry {
  slug: string
  name: string
  facts: string[]
  sigil: boolean
  pf2e?: { cls: Pf2eClassDef; match: Pf2eClassMatch }
  nimble?: { cls: (typeof NIMBLE_CLASSES)[number]; match: NimbleClassMatch }
}

const entries = computed<ClassEntry[]>(() => {
  if (pf2e.value)
    return (pf2eClasses.value ?? []).flatMap((cls) => {
      const match = pf2eClassMatch(cls, terms.value)
      if (!match) return []
      return [
        {
          slug: cls.slug,
          name: cls.name,
          facts: [
            `Key ${cls.keyAttributes.map((a) => PF2E_ATTR_NAME[a]).join(' or ')}`,
            `${cls.hp} HP + Con per level`,
            sourceLabel(cls.source),
          ],
          sigil: false,
          pf2e: { cls, match },
        },
      ]
    })
  return NIMBLE_CLASSES.flatMap((cls) => {
    const match = nimbleClassMatch(cls, terms.value)
    if (!match) return []
    return [
      {
        slug: cls.slug,
        name: cls.name,
        facts: [
          `Key ${cls.keyStats.join(', ')}`,
          `${cls.startingHp} HP, d${cls.hitDie} Hit Dice`,
          NIMBLE_CLASS_SOURCES[cls.slug] ?? '',
        ].filter(Boolean),
        sigil: true,
        nimble: { cls, match },
      },
    ]
  })
})
const total = computed(() =>
  pf2e.value ? (pf2eClasses.value?.length ?? 0) : NIMBLE_CLASSES.length,
)

// --- Opening -------------------------------------------------------------------------
const linked = () => (typeof route.query.class === 'string' ? route.query.class : '')
const opened = reactive(new Set<string>(linked() ? [linked()] : []))
/** Classes folded by hand during a search (a search opens every class it finds). */
const foldedInSearch = reactive(new Set<string>())
watch(term, () => foldedInSearch.clear())

const isOpen = (slug: string) => (searching.value ? !foldedInSearch.has(slug) : opened.has(slug))

function onToggle(slug: string, event: Event) {
  const open = (event.target as HTMLDetailsElement).open
  if (open === isOpen(slug)) return
  if (searching.value) {
    if (open) foldedInSearch.delete(slug)
    else foldedInSearch.add(slug)
    return
  }
  if (open) opened.add(slug)
  else opened.delete(slug)
  const now = open ? slug : linked() === slug ? undefined : linked() || undefined
  // Opened by hand, it's already in view: the link shouldn't scroll it.
  if (open) scrolled.value = slug
  if (now !== (linked() || undefined))
    void router.replace({ query: { ...route.query, tab: 'classes', class: now } })
}

/** A linked class opens and scrolls into view once its system's classes are on the page. */
const scrolled = ref('')
watch(
  [() => linked(), entries],
  async ([slug]) => {
    if (!slug || scrolled.value === slug || !entries.value.some((e) => e.slug === slug)) return
    opened.add(slug)
    scrolled.value = slug
    await nextTick()
    document.getElementById(`class-${slug}`)?.scrollIntoView({ block: 'start' })
  },
  { immediate: true, flush: 'post' },
)

const toolbarEl = ref<HTMLElement | null>(null)
const toolbarStuck = useStuck(toolbarEl)
</script>

<template>
  <div class="classes">
    <div ref="toolbarEl" class="toolbar sticky-bar" :class="{ 'is-stuck': toolbarStuck }">
      <LibrarySystemPicker
        :current="sys?.id"
        :is-ready="isReady"
        what="classes"
        @pick="pickSystem"
      />
      <div class="search">
        <label for="classes-q" class="sr-only">Search {{ sys?.label }} classes and features</label>
        <input
          id="classes-q"
          v-model="q"
          class="input"
          type="search"
          :placeholder="`Search ${sys?.label ?? ''} classes and features`"
        />
      </div>
    </div>

    <p class="small muted summary" role="status">
      <template v-if="loading">Loading classes…</template>
      <template v-else-if="searching">
        {{ entries.length }} of {{ total }} classes match “{{ term.trim() }}”
      </template>
      <template v-else>{{ total }} classes. Open one to read its levels and options.</template>
    </p>

    <p v-if="failed" class="notice notice--error" role="alert">
      {{ failed }}
      <button type="button" class="btn btn--ghost btn--sm" @click="load">Try again</button>
    </p>
    <div v-else-if="loading" class="spinner" role="status" aria-label="Loading classes" />

    <div v-else class="list">
      <details
        v-for="e in entries"
        :id="`class-${e.slug}`"
        :key="e.slug"
        class="panel cls"
        :open="isOpen(e.slug)"
        @toggle="onToggle(e.slug, $event)"
      >
        <summary class="cls__head">
          <span v-if="e.sigil" class="cls__sigil"><NimbleSigil :slug="e.slug" :size="44" /></span>
          <span class="cls__title">
            <h2>{{ e.name }}</h2>
            <span class="cls__facts">
              <span v-for="f in e.facts" :key="f">{{ f }}</span>
            </span>
          </span>
          <svg
            class="chev"
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </summary>
        <div v-if="isOpen(e.slug)" class="cls__body">
          <LibraryClassPf2e
            v-if="e.pf2e"
            :cls="e.pf2e.cls"
            :match="e.pf2e.match"
            :searching="searching"
          />
          <LibraryClassNimble
            v-else-if="e.nimble"
            :cls="e.nimble.cls"
            :match="e.nimble.match"
            :searching="searching"
          />
        </div>
      </details>
      <p v-if="!entries.length" class="empty">
        Nothing in the {{ sys?.label }} classes matches “{{ term.trim() }}”.
      </p>
    </div>

    <LibraryNotice v-if="sys" :text="sys.attribution" />
  </div>
</template>

<style scoped lang="scss">
.classes {
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
  flex: 0 1 320px;
}

.summary {
  margin: 0;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cls {
  padding: 0;
  scroll-margin-top: calc(var(--subnav-h, 0px) + 84px);

  &[open] > .cls__head .chev {
    transform: rotate(180deg);
  }
}

.cls__head {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 64px;
  padding: 12px 20px;
  cursor: pointer;
  list-style: none;

  &::-webkit-details-marker {
    display: none;
  }

  &:hover h2 {
    color: var(--accent-text);
  }

  &:focus-visible {
    outline: 2px solid var(--accent-text);
    outline-offset: -2px;
    border-radius: inherit;
  }
}

.cls__sigil {
  flex: none;
  display: grid;
  place-items: center;
  color: var(--page-text);
}

.cls__title {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;

  h2 {
    margin: 0;
    font-size: 22px;
  }
}

.cls__facts {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 14px;
  font-size: 13px;
  color: var(--page-muted);
}

.chev {
  flex: none;
  color: var(--accent-text);
  transition: transform 0.15s;
}

.cls__body {
  padding: 4px 20px 20px;
  border-top: 1px solid var(--line);

  // The class bodies (ClassPf2e, ClassNimble) share these.
  :deep(h3) {
    margin: 22px 0 10px;
    font-size: 18px;
  }

  :deep(h4) {
    margin: 14px 0 6px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--page-muted);
  }

  :deep(.cbody__summary) {
    margin: 14px 0 0;
    font-style: italic;
    line-height: 1.6;
    color: var(--page-soft);
  }

  :deep(.cbody__list) {
    margin: 10px 0 0;
    padding-left: 22px;
    line-height: 1.6;
  }

  :deep(.cbody__facts) {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(240px, 100%), 1fr));
    gap: 10px 20px;
    margin: 16px 0 0;

    dt {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--page-muted);
    }

    dd {
      margin: 2px 0 0;
      font-size: 14px;
      line-height: 1.5;
    }
  }

  :deep(.notice) {
    margin: 12px 0 0;
  }

  :deep(.fold .notice) {
    margin: 0 0 10px;
  }

  :deep(.cbody__chips) {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    margin: 0 0 10px;
    padding: 0;
    list-style: none;
    font-size: 13px;
    color: var(--page-soft);
  }

  :deep(.cbody__text) {
    margin: 0;
    white-space: pre-line;
  }

  :deep(.cbody__notes) {
    margin: 6px 0 0;
    padding-left: 22px;
    font-size: 13px;
    color: var(--page-soft);
  }

  :deep(.cbody__ability) {
    margin: 0 0 8px;
    padding-left: 10px;
    border-left: 2px solid transparent;

    &.is-hit {
      border-left-color: var(--accent);
    }
  }

  :deep(.cbody__source) {
    margin: 8px 0 0;
    font-size: 13px;
    color: var(--page-muted);
  }

  :deep(.cbody__slots td),
  :deep(.cbody__slots th) {
    text-align: center;
  }

  :deep(.cbody__slots td:first-child),
  :deep(.cbody__slots th:first-child) {
    text-align: left;
  }
}

@media (max-width: 860px) {
  .search {
    flex: 1 1 100%;
  }
}

@media (max-width: 640px) {
  .cls__head {
    padding: 10px 14px;
  }

  .cls__body {
    padding: 4px 14px 16px;
  }
}
</style>
