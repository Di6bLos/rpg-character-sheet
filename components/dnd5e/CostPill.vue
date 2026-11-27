<script setup lang="ts">
// What a 5e attack, spell or ability takes on the turn, as the pill Nimble's attack cards show
// ("1 action"): ◆ Action, ◆ Attack, ◇ Bonus Action, ↺ Reaction, free, or the time it takes.
import { COST_LABEL, type Dnd5eCost } from '~/utils/dnd5ePlay'

const props = defineProps<{ cost: Dnd5eCost | null | undefined; text?: string }>()
const GLYPH: Partial<Record<Dnd5eCost, string>> = {
  action: '◆',
  attack: '◆',
  magic: '◆',
  bonus: '◇',
  reaction: '↺',
}
const glyph = computed(() => (props.cost ? (GLYPH[props.cost] ?? '') : ''))
</script>

<template>
  <span v-if="cost" class="boost" :class="`boost--${cost}`"
    ><span v-if="glyph" class="boost__glyph" aria-hidden="true">{{ glyph }}</span>
    {{ text ?? COST_LABEL[cost] }}</span
  >
</template>

<style scoped lang="scss">
.boost {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-text);
  white-space: nowrap;
}

.boost__glyph {
  color: var(--secondary);
}

.boost--bonus .boost__glyph {
  color: #c07a1e;
}

.boost--reaction .boost__glyph {
  color: #7a5ccc;
}
</style>
