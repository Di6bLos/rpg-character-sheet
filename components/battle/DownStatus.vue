<script setup lang="ts">
// A downed 5e / PF2e hero's one status line, the same wherever a hero shows (HeroBasic,
// HeroVitals, the party cards, the roster): "Down · 1 saved · 2 failed" (5e death saves),
// "Down · Dying 2" (PF2e), "Dead" (5e: three failed death saves), or just "Down". Words,
// not only colour, carry it; the colour is `--danger-ink` (readable on the panel,
// parchment included). Screen readers hear the death saves spelled out. Nimble's Wounds
// and Dying keep their own display.
import type { RosterEntry } from '~/types'
import { deadBySaves, dyingLine } from '~/utils/roster'

const props = defineProps<{
  /** The hero's death saves (5e) and Dying value (PF2e), as the roster summary has them. */
  summary: Pick<NonNullable<RosterEntry['summary']>, 'deathSaves' | 'dying'> | null | undefined
}>()

const dead = computed(() => deadBySaves(props.summary))
const line = computed(() => dyingLine(props.summary))
const spoken = computed(() => dyingLine(props.summary, true))
</script>

<template>
  <span class="down-status">
    <b class="down-status__tag">{{ dead ? 'Dead' : 'Down' }}</b>
    <template v-if="line">
      <span class="down-status__dot" aria-hidden="true">·</span>
      <template v-if="spoken !== line">
        <span aria-hidden="true">{{ line }}</span>
        <span class="sr-only">{{ spoken }}</span>
      </template>
      <span v-else>{{ line }}</span>
    </template>
  </span>
</template>

<style scoped lang="scss">
.down-status {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0 5px;
  font-size: 12px;
  line-height: 1.35;
  font-weight: 600;
  color: var(--danger-ink);
  font-variant-numeric: tabular-nums lining-nums;
}

.down-status__tag {
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
</style>
