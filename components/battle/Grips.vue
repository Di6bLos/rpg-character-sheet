<script setup lang="ts">
// A 5e weapon tile's toggles before its attack, as the sheet's weapon card has them: Two
// hands, Thrown, Off-hand, Long range and Sneak Attack (useDnd5eAttacks' grips and Sneak
// Attack pick; the tile's damage and odds follow them). In the tile's popover and in
// ActionDetails.
import type { BattleGrip } from '~/composables/useBattleActions'

defineProps<{
  name: string
  grips: BattleGrip[]
  disabled?: boolean
}>()
</script>

<template>
  <div class="grips" role="group" :aria-label="`Grip for ${name}`">
    <button
      v-for="g in grips"
      :key="g.key"
      type="button"
      class="chip grip"
      :aria-pressed="g.on"
      :title="g.title"
      :disabled="disabled"
      @click="g.toggle"
    >
      {{ g.label }}
    </button>
  </div>
</template>

<style scoped lang="scss">
.grips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.grip {
  min-height: 30px;
  padding: 0 10px;
  font-size: 12px;

  &[aria-pressed='true'] {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    color: var(--page-text);
  }
}

@media (pointer: coarse) {
  .grip {
    min-height: 44px;
  }
}
</style>
