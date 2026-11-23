<script setup lang="ts">
// The action panel's filter chips (Ready now with its count, All, Attacks, Spells,
// Reactions, Abilities) and the search box.
import type { ActionFilter } from '~/utils/battleActions'

defineProps<{ readyCount: number }>()
const filter = defineModel<ActionFilter>('filter', { required: true })
const query = defineModel<string>('query', { required: true })

const CHIPS: { id: ActionFilter; label: string }[] = [
  { id: 'ready', label: 'Ready now' },
  { id: 'all', label: 'All' },
  { id: 'attack', label: 'Attacks' },
  { id: 'spell', label: 'Spells' },
  { id: 'react', label: 'Reactions' },
  { id: 'ability', label: 'Abilities' },
]

// The chips scroll sideways when the column is narrow: a vertical wheel scrolls them too,
// and a picked chip scrolls fully into view (keyboard focus already does).
function onWheel(event: WheelEvent) {
  const el = event.currentTarget as HTMLElement
  if (el.scrollWidth <= el.clientWidth || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return
  el.scrollLeft += event.deltaY
  event.preventDefault()
}

function pick(id: ActionFilter, event: MouseEvent) {
  filter.value = id
  const chip = event.currentTarget as HTMLElement
  chip.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}
</script>

<template>
  <div class="filters">
    <div class="filters__chips" role="group" aria-label="Show actions" @wheel="onWheel">
      <button
        v-for="c in CHIPS"
        :key="c.id"
        type="button"
        class="filters__chip"
        :aria-pressed="filter === c.id"
        @click="pick(c.id, $event)"
      >
        {{ c.label }}<span v-if="c.id === 'ready'" class="filters__count">{{ readyCount }}</span>
      </button>
    </div>
    <input
      v-model="query"
      class="filters__search"
      type="search"
      placeholder="Find…"
      aria-label="Find an action"
    />
  </div>
</template>

<style scoped lang="scss">
.filters {
  display: flex;
  align-items: center;
  gap: 8px;
}

// One row: the chips scroll sideways when they don't fit beside the search.
.filters__chips {
  display: flex;
  gap: 4px;
  flex: 1 1 auto;
  min-width: 0;
  overflow-x: auto;
  // Room for the chips' focus ring inside the scroller.
  padding: 2px;
  margin: -2px;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.filters__chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: transparent;
  color: var(--page-muted);
  font: inherit;
  font-size: 12px;
  white-space: nowrap;
  flex: none;

  &:hover {
    color: var(--page-text);
  }

  &[aria-pressed='true'] {
    color: var(--page-text);
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 14%, transparent);
  }
}

.filters__count {
  min-width: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--accent);
  color: var(--on-accent);
  font-size: 10.5px;
  font-weight: 700;
  text-align: center;
}

.filters__search {
  // Compact until used: it grows while focused or holding a search.
  flex: 0 1 110px;
  min-width: 80px;
  max-width: 220px;
  transition: flex-basis 0.15s ease;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--field);
  color: var(--page-text);
  font: inherit;
  font-size: 12px;

  &:focus,
  &:not(:placeholder-shown) {
    flex-basis: 200px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}
</style>
