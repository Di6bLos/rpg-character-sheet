<script setup lang="ts">
// What a PF2e Strike, ability or spell costs, as the pill Nimble's attack cards show
// ("1 action"): ◆ 1 action, ◆◆ 2 actions, ↺ reaction, ◇ free, or the time it takes.
import type { Pf2eCost } from '~/utils/pf2eAbilityRules'
import { actionCostLabel, costGlyph } from '~/utils/pf2eActions'

const props = defineProps<{ cost: Pf2eCost | undefined }>()
const glyph = computed(() => costGlyph(props.cost))
const words = computed(() => {
  const c = props.cost
  if (!c) return ''
  if (c.kind === 'actions')
    return c.min === c.max
      ? `${c.min} action${c.min === 1 ? '' : 's'}`
      : `${c.min}–${c.max} actions`
  if (c.kind === 'reaction') return 'reaction'
  if (c.kind === 'free') return 'free'
  return c.text
})
</script>

<template>
  <span v-if="cost" class="boost"
    ><span v-if="glyph" class="boost__glyph" aria-hidden="true">{{ glyph }}</span>
    <span aria-hidden="true">{{ words }}</span
    ><span class="sr-only">{{ actionCostLabel(cost) }}</span></span
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
  letter-spacing: 1px;
}
</style>
