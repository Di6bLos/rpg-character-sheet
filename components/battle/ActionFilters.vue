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
</script>

<template>
  <div class="filters">
    <div class="filters__chips" role="group" aria-label="Show actions">
      <button
        v-for="c in CHIPS"
        :key="c.id"
        type="button"
        class="filters__chip"
        :aria-pressed="filter === c.id"
        @click="filter = c.id"
      >
        {{ c.label }}<span v-if="c.id === 'ready'" class="filters__count">{{ readyCount }}</span>
      </button>
    </div>
    <input
      v-model="query"
      class="filters__search"
      type="search"
      placeholder="Find an action…"
      aria-label="Find an action"
    />
  </div>
</template>

<style scoped lang="scss">
.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
}

.filters__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  flex: 1 1 auto;
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
  flex: 1 0 140px;
  max-width: 220px;
  min-width: 0;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--field);
  color: var(--page-text);
  font: inherit;
  font-size: 12px;
}
</style>
