<script setup lang="ts">
// The GM's left column when a hero is picked on the initiative strip (or the encounter
// grid): that hero's vitals, with the GM's HP and condition controls that reach the hero's
// sheet (every system; `gmHeroControls`).
// A party card still opens the full stats modal.
import type { RosterEntry } from '~/types'

const props = defineProps<{ characterId: string; roster: RosterEntry[] }>()

const { card, loading, error, load, entry, title, live } = useHeroCard(
  toRef(props, 'characterId'),
  toRef(props, 'roster'),
)
</script>

<template>
  <section class="panel gmh" :aria-label="`Selected hero: ${title}`">
    <span class="gmh__eyebrow">Selected hero · click a creature to switch</span>
    <h2 class="gmh__name">{{ title }}</h2>
    <p v-if="loading" class="gmh__state" role="status">Loading vitals…</p>
    <div v-else-if="error" class="notice notice--error gmh__state" role="alert">
      <span>{{ error }}</span>
      <button type="button" class="btn btn--sm btn--ghost" @click="load(characterId)">
        Try again
      </button>
    </div>
    <BattleHeroVitals
      v-else-if="card && live"
      :character-id="characterId"
      :card="card"
      :live="live"
      :entry="entry"
      gm
    />
  </section>
</template>

<style scoped lang="scss">
.gmh {
  // Contains the .sr-only text, which would otherwise escape the scroller and scroll the page.
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
}

.gmh__eyebrow {
  font-size: 11px;
  color: var(--page-muted);
}

.gmh__name {
  margin: 0;
  font-family: var(--font-heading);
  font-size: 18px;
}

.gmh__state {
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  color: var(--page-muted);
}
</style>
