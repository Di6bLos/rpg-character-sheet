<script setup lang="ts">
// Library → Rules: basic rules for each game system (data/rules). Pick a system, then a
// topic; the search box looks through every section of that system's topics. The system,
// topic and search are in the URL (?tab=rules&system=pf2e&topic=combat&q=flank) so a link
// opens the same page, and the last system is remembered per browser.
import { loadPf2e } from '~/data/pf2e'
import { loadRulesFile, rulesSystem, type RulesSystem, type RulesTopic } from '~/data/rules'
import type { GameSystem } from '~/types'
import { loreHtml } from '~/utils/loreText'
import {
  expandRules,
  loadTopics,
  rulesMatch,
  rulesNeeds,
  rulesPlain,
  rulesSections,
  rulesTerms,
  type RulesData,
  type RulesSection,
} from '~/utils/rulesText'

const route = useRoute()
const router = useRouter()

const hasTopics = (s: RulesSystem) => s.topics.length > 0
const sys = useLibrarySystem(hasTopics)
const topic = computed<RulesTopic | undefined>(
  () => sys.value?.topics.find((t) => t.slug === route.query.topic) ?? sys.value?.topics[0],
)

function query(changes: Record<string, string | undefined>) {
  return { path: '/library', query: { ...route.query, tab: 'rules', ...changes } }
}
// RouterLink ignores the query when it marks a link as the current page, so every rules link
// would claim aria-current; the template sets it (or clears it) on each one instead.
const topicLink = (t: RulesTopic) => query({ system: sys.value?.id, topic: t.slug, q: undefined })

/** Switching systems keeps the topic when the new system has one by that name. */
function pickSystem(id: GameSystem) {
  const next = rulesSystem(id)
  if (!next?.topics.length || id === sys.value?.id) return
  const slug = next.topics.some((t) => t.slug === topic.value?.slug)
    ? topic.value?.slug
    : next.topics[0]?.slug
  void router.push(query({ system: id, topic: slug }))
}

function pickTopic(slug: string) {
  void router.push(query({ system: sys.value?.id, topic: slug, q: undefined }))
}

// --- Search ------------------------------------------------------------------------
const q = ref(typeof route.query.q === 'string' ? route.query.q : '')
const terms = computed(() => rulesTerms(q.value))
let typing: ReturnType<typeof setTimeout> | undefined
watch(q, (value) => {
  clearTimeout(typing)
  typing = setTimeout(() => {
    if ((route.query.q ?? '') !== value.trim())
      void router.replace(query({ q: value.trim() || undefined }))
  }, 400)
})
watch(
  () => route.query.q,
  (value) => {
    const next = typeof value === 'string' ? value : ''
    if (next !== q.value.trim()) q.value = next
  },
)
onBeforeUnmount(() => clearTimeout(typing))

// --- Loading -----------------------------------------------------------------------
/** Each topic's markdown with its data tables filled in, by file. */
const texts = shallowReactive(new Map<string, string>())
const failed = ref('')
const loading = ref(false)

async function expanded(file: string): Promise<string> {
  const raw = await loadRulesFile(file)
  const data: RulesData = {}
  for (const need of rulesNeeds(raw)) {
    if (need === 'pf2eActions') data.pf2eActions = await loadPf2e('actions')
    if (need === 'pf2eConditions') data.pf2eConditions = await loadPf2e('conditions')
  }
  return expandRules(raw, data)
}

const names = (list: string[]) =>
  list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list.at(-1)}` : (list[0] ?? '')

/** Only the latest load says whether it failed, so an older one can't flag a newer page. */
let loads = 0
async function ensure(topics: RulesTopic[]) {
  const run = ++loads
  failed.value = ''
  const missing = topics.filter((t) => !texts.has(t.file))
  loading.value = missing.length > 0
  if (!missing.length) return
  const { loaded, lost } = await loadTopics(missing, (t) => expanded(t.file))
  for (const [t, md] of loaded) texts.set(t.file, md)
  for (const { error } of lost) console.error(error)
  if (run !== loads) return
  loading.value = false
  if (!lost.length) return
  const titles = lost.map((l) => l.topic.title)
  failed.value = searching.value
    ? `Could not load ${names(titles)}, so the results leave ${titles.length === 1 ? 'it' : 'them'} out.`
    : 'Could not load these rules.'
}

/**
 * The browser keeps a failed module import failed, so trying again means reloading the page;
 * the URL keeps the system, topic and search.
 */
function retry() {
  window.location.reload()
}

const searching = computed(() => terms.value.length > 0)
function load() {
  const all = sys.value?.topics ?? []
  void ensure(searching.value ? all : topic.value ? [topic.value] : [])
}
watch([() => topic.value?.file, searching, () => sys.value?.id], load, { immediate: true })

const html = (md: string, base = 3) => loreHtml(md, { headingBase: base })
const topicHtml = computed(() => {
  const md = topic.value && texts.get(topic.value.file)
  return md ? html(md) : ''
})

interface TopicHits {
  topic: RulesTopic
  sections: RulesSection[]
}
const hits = computed<TopicHits[]>(() => {
  if (!searching.value) return []
  return (sys.value?.topics ?? []).flatMap((t) => {
    const md = texts.get(t.file)
    if (!md) return []
    const sections = rulesSections(md).filter((s) => rulesMatch(rulesPlain(s.markdown), q.value))
    return sections.length ? [{ topic: t, sections }] : []
  })
})
const hitCount = (t: RulesTopic) =>
  hits.value.find((h) => h.topic.slug === t.slug)?.sections.length ?? 0
const totalHits = computed(() => hits.value.reduce((n, h) => n + h.sections.length, 0))
const allLoaded = computed(() => (sys.value?.topics ?? []).every((t) => texts.has(t.file)))
/** Every topic loaded, or the rest failed: the results are as complete as they'll get. */
const searched = computed(() => allLoaded.value || (!!failed.value && !loading.value))

/** A search hit: the topic's name over its section (the intro gets none of its own). */
const hitHtml = (h: TopicHits) => html(h.sections.map((s) => s.markdown).join('\n\n'), 4)

// --- Highlighting search words in the rendered text ----------------------------------
const textEl = ref<HTMLElement | null>(null)
function mark(root: HTMLElement, words: string[]) {
  if (!words.length) return
  const re = new RegExp(
    `(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
    'gi',
  )
  // Text already marked is skipped: the results re-mark when another topic loads.
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      n.parentElement?.closest('mark') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  })
  const nodes: Text[] = []
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text)
  for (const node of nodes) {
    const text = node.nodeValue ?? ''
    re.lastIndex = 0
    if (!re.test(text)) continue
    const frag = document.createDocumentFragment()
    for (const part of text.split(re)) {
      if (!part) continue
      if (words.includes(part.toLowerCase())) {
        const m = document.createElement('mark')
        m.textContent = part
        frag.append(m)
      } else frag.append(part)
    }
    node.replaceWith(frag)
  }
}
watch(
  [hits, terms],
  () => nextTick(() => textEl.value && searching.value && mark(textEl.value, terms.value)),
  { flush: 'post' },
)

// --- Reading position ----------------------------------------------------------------
const toolbarEl = ref<HTMLElement | null>(null)
const toolbarStuck = useStuck(toolbarEl)
watch(
  () => topic.value?.slug,
  (now, before) => before && nextTick(() => revealAfterStickyBar(toolbarEl.value)),
)

const index = computed(() => sys.value?.topics.findIndex((t) => t.slug === topic.value?.slug) ?? -1)
const prev = computed(() => sys.value?.topics[index.value - 1])
const next = computed(() => sys.value?.topics[index.value + 1])

const phoneTopic = computed({
  get: () => topic.value?.slug ?? '',
  set: (slug: string) => pickTopic(slug),
})
</script>

<template>
  <div class="rules">
    <div ref="toolbarEl" class="toolbar sticky-bar" :class="{ 'is-stuck': toolbarStuck }">
      <LibrarySystemPicker
        :current="sys?.id"
        :is-ready="hasTopics"
        what="rules"
        @pick="pickSystem"
      />
      <div class="search">
        <label for="rules-q" class="sr-only">Search {{ sys?.label }} rules</label>
        <input
          id="rules-q"
          v-model="q"
          class="input"
          type="search"
          :placeholder="`Search ${sys?.label ?? ''} rules`"
        />
      </div>
    </div>

    <div v-if="sys" class="rules__body">
      <nav class="rules__topics" :aria-label="`${sys.label} topics`">
        <ul>
          <li v-for="t in sys.topics" :key="t.slug">
            <NuxtLink
              :to="topicLink(t)"
              :aria-current="!searching && t.slug === topic?.slug ? 'page' : undefined"
              :class="{ 'is-dim': searching && allLoaded && !hitCount(t) }"
            >
              <span class="rules__topic-title">{{ t.title }}</span>
              <span class="rules__topic-blurb">{{ t.blurb }}</span>
              <span v-if="searching && hitCount(t)" class="rules__hits">
                {{ hitCount(t) }}<span class="sr-only"> matching sections</span>
              </span>
            </NuxtLink>
          </li>
        </ul>
      </nav>

      <div class="rules__phone-topic">
        <label for="rules-topic" class="sr-only">Topic</label>
        <select id="rules-topic" v-model="phoneTopic" class="input">
          <option v-for="t in sys.topics" :key="t.slug" :value="t.slug">{{ t.title }}</option>
        </select>
      </div>

      <article class="panel rules__text" :aria-busy="loading">
        <p v-if="failed" class="rules__error" role="alert">
          {{ failed }}
          <button type="button" class="btn btn--ghost btn--sm" @click="retry">Try again</button>
        </p>

        <template v-if="searching">
          <header class="rules__head">
            <div class="eyebrow">{{ sys.label }}</div>
            <h2>Search results</h2>
            <p class="rules__meta" role="status">
              <template v-if="!searched">Searching…</template>
              <template v-else-if="totalHits">
                {{ totalHits }} {{ totalHits === 1 ? 'section' : 'sections' }} in {{ hits.length }}
                {{ hits.length === 1 ? 'topic' : 'topics' }} match “{{ q.trim() }}”
              </template>
              <template v-else
                >Nothing in the {{ sys.label }} rules matches “{{ q.trim() }}”.</template
              >
            </p>
          </header>
          <!-- Keyed on the words so a new search starts from unmarked text. -->
          <div ref="textEl" :key="terms.join(' ')">
            <section v-for="h in hits" :key="h.topic.slug" class="rules__hit">
              <h3 class="rules__hit-title">
                <NuxtLink :to="topicLink(h.topic)" :aria-current="undefined">{{
                  h.topic.title
                }}</NuxtLink>
              </h3>
              <!-- eslint-disable-next-line vue/no-v-html -- loreHtml escapes everything first -->
              <div class="rules-text" v-html="hitHtml(h)" />
            </section>
          </div>
        </template>

        <template v-else-if="topic && !failed">
          <header class="rules__head">
            <div class="eyebrow">{{ sys.label }}</div>
            <h2>{{ topic.title }}</h2>
            <p class="rules__meta">
              {{ sys.credit ?? `Summarised from ${sys.sources}, with printed page numbers.` }}
            </p>
          </header>
          <div v-if="!topicHtml" class="spinner" role="status" aria-label="Loading the rules" />
          <!-- eslint-disable-next-line vue/no-v-html -- loreHtml escapes everything first -->
          <div v-else ref="textEl" class="rules-text" v-html="topicHtml" />
          <nav v-if="topicHtml" class="rules__pager" aria-label="More topics">
            <NuxtLink
              v-if="prev"
              :to="topicLink(prev)"
              :aria-current="undefined"
              class="btn btn--ghost btn--sm"
            >
              ← {{ prev.title }}
            </NuxtLink>
            <span v-else />
            <NuxtLink
              v-if="next"
              :to="topicLink(next)"
              :aria-current="undefined"
              class="btn btn--ghost btn--sm rules__next"
            >
              {{ next.title }} →
            </NuxtLink>
          </nav>
        </template>

        <LibraryNotice :text="sys.attribution" />
      </article>
    </div>
  </div>
</template>

<style scoped lang="scss">
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

.rules__body {
  display: grid;
  grid-template-columns: 250px minmax(0, 1fr);
  align-items: start;
  gap: 24px;
  margin-top: 24px;
}

.rules__topics {
  position: sticky;
  top: calc(var(--subnav-h, 0px) + 84px);
  max-height: calc(100vh - var(--subnav-h, 0px) - 100px);
  overflow-y: auto;

  ul {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  a {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    column-gap: 8px;
    min-height: 44px;
    padding: 8px 12px;
    border-radius: var(--radius-sm, 8px);
    color: var(--page-soft);
    text-decoration: none;

    &:hover {
      background: var(--accent-tint);
      color: var(--page-text);
    }

    &[aria-current='page'] {
      background: var(--accent-tint);
      color: var(--page-text);
      box-shadow: inset 3px 0 0 var(--accent);
    }

    &.is-dim {
      opacity: 0.5;
    }
  }
}

.rules__topic-title {
  font-weight: 600;
}

.rules__topic-blurb {
  grid-column: 1;
  font-size: 13px;
  color: var(--page-muted);
}

.rules__hits {
  grid-column: 2;
  grid-row: 1 / span 2;
  min-width: 24px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--accent);
  color: var(--on-accent);
  font-size: 12px;
  font-weight: 700;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.rules__phone-topic {
  display: none;
}

.rules__text {
  min-width: 0;
  padding: 24px 28px;
}

.rules__head {
  margin-bottom: 16px;

  h2 {
    margin-top: 4px;
    font-size: 28px;
  }
}

.rules__meta {
  margin-top: 6px;
  font-size: 14px;
  color: var(--page-muted);
}

.rules__error {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.rules__hit + .rules__hit {
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px solid var(--line);
}

.rules__hit-title a {
  color: var(--accent-text);
}

.rules-text {
  font-size: 15px;
  line-height: 1.6;
  color: var(--page-text);

  :deep(h3) {
    margin: 28px 0 8px;
    font-size: 20px;
  }

  :deep(h4) {
    margin: 22px 0 6px;
    font-size: 17px;
  }

  :deep(h5) {
    margin: 16px 0 4px;
    font-size: 15px;
  }

  :deep(> :first-child) {
    margin-top: 0;
  }

  :deep(p),
  :deep(ul),
  :deep(ol) {
    margin: 0 0 10px;
  }

  :deep(ul),
  :deep(ol) {
    padding-left: 22px;
  }

  :deep(li + li) {
    margin-top: 4px;
  }

  // A section's page cite sits on its own line under the section.
  :deep(p:has(> em:only-child)) {
    font-size: 13px;
    color: var(--page-muted);
  }

  :deep(mark) {
    border-radius: 2px;
    background: var(--warn-bg);
    color: var(--warn-text);
  }
}

.rules__pager {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 12px;
  margin-top: 24px;
}

.rules__next {
  margin-left: auto;
}

// Phones and narrow tablets: a topic select over the text instead of the side list.
@media (max-width: 860px) {
  .rules__body {
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
    margin-top: 16px;
  }

  .rules__topics {
    display: none;
  }

  .rules__phone-topic {
    display: block;
  }

  .rules__text {
    padding: 18px 16px;
  }

  // Narrow tables: let the name column wrap too, so the text column keeps its width.
  .rules-text :deep(.table--rules td:first-child) {
    min-width: 6em;
    white-space: normal;
  }

  .rules-text :deep(.table--rules) {
    th,
    td {
      padding: 7px 8px;
    }
  }

  .search {
    flex: 1 1 100%;
  }
}
</style>
