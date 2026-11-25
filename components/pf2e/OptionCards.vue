<script setup lang="ts">
// A grid of PF2e options to pick one (pressed toggle buttons) or several (checkbox) of: a search
// box for long lists, uncommon and rare options hidden until asked for, and each option's rules
// text behind a disclosure. Shows the first 60 matches, plus the picked ones wherever they are;
// the rest on request.
import { loreHtml } from '~/utils/loreText'

export interface Pf2eOption {
  id: string
  name: string
  /** One line under the name: numbers, prerequisites, price… */
  meta?: string
  /** Rules text (markdown); its first lines are the card's summary. */
  text?: string
  rarity?: string
  /** Why it can't be picked right now. */
  disabled?: string
  /** What the rules data leaves out, to add on the sheet (a druidic order's mechanics). */
  gap?: string
}

const props = withDefaults(
  defineProps<{
    options: Pf2eOption[]
    label: string
    multiple?: boolean
    max?: number
    /** Show the search box; on by default for more than 12 options. */
    search?: boolean
  }>(),
  { multiple: false, max: Infinity, search: undefined },
)
const model = defineModel<string[]>({ required: true })

const PAGE = 60
const query = ref('')
const showRare = ref(false)
const shown = ref(PAGE)

const hasRare = computed(() => props.options.some((o) => o.rarity && o.rarity !== 'common'))
const searchable = computed(() => props.search ?? props.options.length > 12)
const matches = computed(() => {
  const q = query.value.trim().toLowerCase()
  return props.options.filter(
    (o) =>
      model.value.includes(o.id) ||
      ((showRare.value || !o.rarity || o.rarity === 'common') &&
        (!q || o.name.toLowerCase().includes(q) || o.meta?.toLowerCase().includes(q))),
  )
})
const visible = computed(() => {
  const page = matches.value.slice(0, shown.value)
  // A pick past the shown page (or the 61st background) stays on screen.
  const later = matches.value.slice(shown.value).filter((o) => model.value.includes(o.id))
  return [...page, ...later]
})
watch(query, () => (shown.value = PAGE))

/** The first paragraph of rules text as plain words, cut to a card's length. */
function summary(text = '') {
  const para = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .find(
      (p) =>
        p &&
        !p.startsWith('**') &&
        !p.startsWith('#') &&
        p !== '---' &&
        // A bare page reference ("pg. 74") is source info, not a summary.
        !/^pg\. \d+$/.test(p) &&
        // AoN's own notes ("Nethys Note: no description…") belong in the full text only.
        !/^_?(Nethys Note|Note from Nethys)/.test(p),
    )
  const plain = (para ?? '').replace(/[*_#]/g, '').replace(/\s+/g, ' ')
  return plain.length > 180 ? `${plain.slice(0, 177).trimEnd()}…` : plain
}

function pick(o: Pf2eOption) {
  const on = model.value.includes(o.id)
  // A disabled option can still be taken off (gear the new class isn't trained in).
  if (o.disabled && !on) return
  if (!props.multiple) model.value = on ? [] : [o.id]
  else if (on) model.value = model.value.filter((id) => id !== o.id)
  else if (model.value.length < props.max) model.value = [...model.value, o.id]
}

const full = computed(() => props.multiple && model.value.length >= props.max)
</script>

<template>
  <div class="options">
    <div v-if="searchable || hasRare" class="options__tools">
      <input
        v-if="searchable"
        v-model="query"
        type="search"
        class="input options__search"
        :placeholder="`Search ${label.toLowerCase()}`"
        :aria-label="`Search ${label.toLowerCase()}`"
      />
      <UiSwitch v-if="hasRare" v-model="showRare" label="Show uncommon and rare (ask your GM)" />
      <span class="small muted" aria-live="polite">{{ matches.length }} shown</span>
    </div>
    <div class="options__grid" role="group" :aria-label="label">
      <div
        v-for="o in visible"
        :key="o.id"
        class="option"
        :class="{ 'is-on': model.includes(o.id), 'is-off': !!o.disabled }"
      >
        <button
          type="button"
          class="option__pick"
          :role="multiple ? 'checkbox' : undefined"
          :aria-checked="multiple ? model.includes(o.id) : undefined"
          :aria-pressed="multiple ? undefined : model.includes(o.id)"
          :aria-disabled="(!!o.disabled || full) && !model.includes(o.id)"
          :title="o.disabled || undefined"
          @click="pick(o)"
        >
          <span class="option__head">
            <strong>{{ o.name }}</strong>
            <span v-if="o.rarity && o.rarity !== 'common'" class="option__rarity">{{
              o.rarity
            }}</span>
          </span>
          <span v-if="o.meta" class="option__meta">{{ o.meta }}</span>
          <span v-if="o.gap" class="option__gap">{{ o.gap }}</span>
          <span v-if="o.disabled" class="option__why">{{ o.disabled }}</span>
          <span v-else-if="o.text" class="option__sum">{{ summary(o.text) }}</span>
        </button>
        <details v-if="o.text" class="option__text">
          <summary>
            Rules text<span class="sr-only">: {{ o.name }}</span>
          </summary>
          <!-- eslint-disable-next-line vue/no-v-html -- loreHtml escapes everything first -->
          <div class="option__body" v-html="loreHtml(o.text)" />
        </details>
      </div>
    </div>
    <button
      v-if="matches.length > shown"
      type="button"
      class="btn btn--ghost btn--sm"
      @click="shown += PAGE"
    >
      Show {{ Math.min(PAGE, matches.length - shown) }} more of {{ matches.length - shown }}
    </button>
    <p v-if="!matches.length" class="small muted">Nothing matches “{{ query }}”.</p>
  </div>
</template>

<style scoped lang="scss">
.options {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.options__tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 16px;
}

.options__search {
  flex: 1 1 240px;
  max-width: 360px;
}

.options__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(260px, 100%), 1fr));
  gap: 10px;
}

.option {
  display: flex;
  flex-direction: column;
  background: var(--panel-bg);
  color: var(--panel-text);
  border: 1px solid var(--panel-line);
  border-radius: min(var(--radius-panel), 12px);

  &:hover:not(.is-off) {
    border-color: var(--accent);
  }

  &.is-on {
    border: 2px solid var(--accent);
    margin: -1px;
    // Tint layered over the panel surface: --panel-bg is a gradient on Cursed.
    background:
      linear-gradient(color-mix(in srgb, var(--accent) 10%, transparent) 0 0), var(--panel-bg);
  }

  &.is-off {
    border-style: dashed;
    background: transparent;
  }
}

.option__pick {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px 8px;
  text-align: left;
  background: transparent;
  color: inherit;
  border: 0;
  border-radius: inherit;
  min-height: 44px;

  &[aria-disabled='true'] {
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }
}

.option__head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;

  strong {
    font-size: 15px;
  }
}

.option__rarity {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent-text);
}

.option__meta {
  font-size: 12px;
  font-weight: 600;
  color: var(--panel-soft);
}

.option__sum {
  font-size: 13px;
  line-height: 1.45;
  color: var(--panel-soft);
}

.option__gap {
  font-size: 12px;
  font-style: italic;
  color: var(--panel-soft);
}

.option__why {
  font-size: 12px;
  font-weight: 600;
  color: var(--danger-text);
}

.option__text {
  padding: 0 14px 10px;
  font-size: 13px;

  summary {
    cursor: pointer;
    font-weight: 600;
    color: var(--accent-text);
    min-height: 32px;
    display: flex;
    align-items: center;

    @media (pointer: coarse) {
      min-height: 44px;
    }
  }
}

.option__body {
  line-height: 1.5;
  color: var(--panel-text);

  :deep(p) {
    margin: 0.4em 0;
  }
}
</style>
