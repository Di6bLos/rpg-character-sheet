<script setup lang="ts">
// Library → Classes: an index of every class of a game system (name, key stat, HP, source;
// Nimble classes with their sigil) that the search narrows, saying what matched ("Feature:
// Sneak Attack"). A class opens in a modal with its summary, advancement table, features by
// level, subclasses and options, and spell slots, under a sticky section nav. The open class
// is in the URL (?tab=classes&system=pf2e&class=rogue&q=sneak), so a link opens it, with what
// the search matched opened and scrolled to.
import { loadPf2e } from '~/data/pf2e'
import type { Pf2eClassDef } from '~/data/pf2e/types'
import { NIMBLE_CLASSES } from '~/data/nimble/classes'
import type { ClassDef } from '~/data/nimble/types'
import type { RulesSystem } from '~/data/rules'
import type { GameSystem } from '~/types'
import {
  COMPENDIUM_SYSTEMS,
  NIMBLE_CLASS_SOURCES,
  classSummary,
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
  blurb: string
  facts: string[]
  sigil: boolean
  /** What the search matched inside the class (empty when its name matched). */
  hits: string[]
  pf2e?: { cls: Pf2eClassDef; match: Pf2eClassMatch | null }
  nimble?: { cls: ClassDef; match: NimbleClassMatch | null }
}

function pf2eEntry(cls: Pf2eClassDef, match: Pf2eClassMatch | null): ClassEntry {
  return {
    slug: cls.slug,
    name: cls.name,
    blurb: classSummary(cls.text),
    facts: [
      `Key ${cls.keyAttributes.map((a) => PF2E_ATTR_NAME[a]).join(' or ')}`,
      `${cls.hp} HP + Con per level`,
      sourceLabel(cls.source),
    ],
    sigil: false,
    hits: match?.hits ?? [],
    pf2e: { cls, match },
  }
}

function nimbleEntry(cls: ClassDef, match: NimbleClassMatch | null): ClassEntry {
  return {
    slug: cls.slug,
    name: cls.name,
    blurb: cls.tagline,
    facts: [
      `Key ${cls.keyStats.join(', ')}`,
      `${cls.startingHp} HP, d${cls.hitDie} Hit Dice`,
      NIMBLE_CLASS_SOURCES[cls.slug] ?? '',
    ].filter(Boolean),
    sigil: true,
    hits: match?.hits ?? [],
    nimble: { cls, match },
  }
}

/** Every class with what the search matched in it; null matches drop out of the index. */
const all = computed<{ entry: ClassEntry; matched: boolean }[]>(() =>
  pf2e.value
    ? (pf2eClasses.value ?? []).map((cls) => {
        const match = searching.value ? pf2eClassMatch(cls, terms.value) : null
        return { entry: pf2eEntry(cls, match), matched: !searching.value || !!match }
      })
    : NIMBLE_CLASSES.map((cls) => {
        const match = searching.value ? nimbleClassMatch(cls, terms.value) : null
        return { entry: nimbleEntry(cls, match), matched: !searching.value || !!match }
      }),
)
const entries = computed(() => all.value.filter((x) => x.matched).map((x) => x.entry))
const total = computed(() => all.value.length)

const HITS_SHOWN = 3

// --- The open class --------------------------------------------------------------------
const reading = computed(() => {
  const slug = route.query.class
  return typeof slug === 'string' ? all.value.find((x) => x.entry.slug === slug)?.entry : undefined
})
function readClass(slug?: string) {
  void router.replace({ query: { ...route.query, class: slug } })
}
const readingOpen = computed({
  get: () => !!reading.value,
  set: (open) => {
    if (!open) readClass()
  },
})

/** A class opened from a search scrolls to the first thing that matched. */
watch(
  () => reading.value?.slug,
  async (slug) => {
    if (!slug || !reading.value?.hits.length) return
    await nextTick()
    await nextTick()
    document
      .querySelector('dialog[open] .fold.is-hit, dialog[open] .cbody__ability.is-hit')
      ?.scrollIntoView({ block: 'start' })
  },
  { flush: 'post' },
)

/** The jump links pinned over the open class: only the sections it has. */
const sections = computed(() => {
  const e = reading.value
  if (!e) return []
  const id = (part: string) => `cls-${e.slug}-${part}`
  const c = e.pf2e?.cls
  const n = e.nimble?.cls
  return [
    { id: id('overview'), label: 'Overview' },
    { id: id('advancement'), label: 'Advancement' },
    ...(!c || c.features.length ? [{ id: id('features'), label: 'Features' }] : []),
    ...(c?.subclasses.length || n?.pools.length || n?.subclasses.length
      ? [{ id: id('options'), label: 'Options' }]
      : []),
    ...(c?.spellSlots?.length ? [{ id: id('spells'), label: 'Spells' }] : []),
  ]
})
// Buttons rather than #hash links, so the router doesn't see them.
function jump(id: string) {
  const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  document
    .getElementById(id)
    ?.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' })
}

// The nav's band paints the panel's background (Cursed's parchment is a gradient across the
// whole panel), sized and placed like the panel's own so the two line up as content scrolls.
const navEl = ref<HTMLElement | null>(null)
const bandStyle = ref<Record<string, string>>({})
function alignBand() {
  const nav = navEl.value
  const panel = nav?.closest<HTMLElement>('.dialog__body')
  if (!nav || !panel) return
  const p = panel.getBoundingClientRect()
  const n = nav.getBoundingClientRect()
  bandStyle.value = {
    backgroundSize: `${p.width}px ${p.height}px`,
    backgroundPosition: `${p.left - n.left}px ${p.top - n.top}px`,
  }
}
let bandObserver: ResizeObserver | null = null
watch(navEl, (nav, old) => {
  bandObserver?.disconnect()
  old?.parentElement?.removeEventListener('scroll', alignBand)
  const panel = nav?.closest<HTMLElement>('.dialog__body')
  if (!nav || !panel) return
  nav.parentElement?.addEventListener('scroll', alignBand, { passive: true })
  panel.addEventListener('animationend', alignBand, { once: true })
  bandObserver = new ResizeObserver(alignBand)
  bandObserver.observe(panel)
  alignBand()
})
onBeforeUnmount(() => bandObserver?.disconnect())

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
      <template v-else>{{ total }} classes</template>
    </p>

    <p v-if="failed" class="notice notice--error" role="alert">
      {{ failed }}
      <button type="button" class="btn btn--ghost btn--sm" @click="load">Try again</button>
    </p>
    <div v-else-if="loading" class="spinner" role="status" aria-label="Loading classes" />

    <template v-else>
      <ul class="grid" :aria-label="`${sys?.label ?? ''} classes`">
        <li v-for="e in entries" :key="e.slug">
          <button
            type="button"
            class="panel ccard"
            aria-haspopup="dialog"
            @click="readClass(e.slug)"
          >
            <span v-if="e.sigil" class="ccard__sigil"
              ><NimbleSigil :slug="e.slug" :size="48"
            /></span>
            <span class="ccard__main">
              <strong class="ccard__name">{{ e.name }}</strong>
              <span class="ccard__facts">
                <span v-for="f in e.facts" :key="f">{{ f }}</span>
              </span>
              <span v-if="!e.hits.length" class="ccard__blurb">{{ e.blurb }}</span>
              <span v-else class="ccard__hits">
                <span v-for="h in e.hits.slice(0, HITS_SHOWN)" :key="h">{{ h }}</span>
                <span v-if="e.hits.length > HITS_SHOWN" class="muted"
                  >and {{ e.hits.length - HITS_SHOWN }} more</span
                >
              </span>
            </span>
          </button>
        </li>
      </ul>
      <p v-if="!entries.length" class="empty">
        Nothing in the {{ sys?.label }} classes matches “{{ term.trim() }}”.
      </p>
    </template>

    <LibraryNotice v-if="sys" :text="sys.attribution" />

    <UiDialog v-model="readingOpen" :title="reading?.name ?? ''" width="960px" sheet>
      <template #eyebrow>
        <p v-if="reading" class="read__eyebrow">
          <span v-if="reading.sigil" class="read__sigil"
            ><NimbleSigil :slug="reading.slug" :size="28"
          /></span>
          <span v-for="f in reading.facts" :key="f">{{ f }}</span>
        </p>
      </template>
      <nav
        v-if="reading"
        ref="navEl"
        class="class-nav"
        :style="bandStyle"
        aria-label="Class sections"
      >
        <button
          v-for="sec in sections"
          :key="sec.id"
          type="button"
          class="chip"
          @click="jump(sec.id)"
        >
          {{ sec.label }}
        </button>
      </nav>
      <div v-if="reading" class="cls__body">
        <LibraryClassPf2e v-if="reading.pf2e" :cls="reading.pf2e.cls" :match="reading.pf2e.match" />
        <LibraryClassNimble
          v-else-if="reading.nimble"
          :cls="reading.nimble.cls"
          :match="reading.nimble.match"
        />
      </div>
      <template #actions>
        <button type="button" class="btn btn--ghost" @click="readClass()">Close</button>
      </template>
    </UiDialog>
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

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr));
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    display: flex;
  }
}

.ccard {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  width: 100%;
  min-height: 44px;
  padding: 16px 18px;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s;

  &:hover,
  &:focus-visible {
    border-color: var(--accent);
  }

  &:hover .ccard__name {
    color: var(--accent-text);
  }
}

.ccard__sigil {
  flex: none;
  display: grid;
  place-items: center;
  color: var(--page-text);
}

.ccard__main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.ccard__name {
  font-family: var(--font-heading);
  font-size: 20px;
  line-height: 1.2;
}

.ccard__facts {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 12px;
  font-size: 13px;
  color: var(--page-muted);
}

.ccard__blurb {
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  font-size: 14px;
  line-height: 1.45;
  color: var(--page-soft);
}

.ccard__hits {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 2px;
  font-size: 13px;
  color: var(--accent-text);
  overflow-wrap: anywhere;
}

.read__eyebrow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 14px;
  margin: 0 0 4px;
  font-size: 13px;
  color: var(--page-muted);
}

.class-nav {
  position: sticky;
  top: -4px;
  z-index: 1;
  flex: none;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0 -4px -20px;
  padding: 4px 4px 10px;
  // The panel's own parchment (Cursed) or colour, with the sticky bars' divider.
  background: var(--panel-bg);
  background-repeat: no-repeat;
  box-shadow: 0 1px 0 var(--line);
}

// Cursed's panel darkens towards its edges (an inset shadow the band covers): carry a little
// of that vignette across the band's sides.
:root[data-theme='cursed'] .class-nav {
  box-shadow:
    inset 16px 0 20px -14px rgba(70, 35, 10, 0.18),
    inset -16px 0 20px -14px rgba(70, 35, 10, 0.18),
    0 1px 0 var(--line);
}

.read__sigil {
  display: inline-grid;
  color: var(--page-text);
}

.cls__body {
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

  :deep(.cbody__section) {
    scroll-margin-top: 64px;
  }

  :deep(.cbody__section > h3:first-child),
  :deep(.cbody__section > .cbody__summary:nth-child(2)) {
    margin-top: 18px;
  }

  :deep(.fold.is-hit) {
    border-color: var(--accent);
    scroll-margin-top: 64px;
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
</style>
