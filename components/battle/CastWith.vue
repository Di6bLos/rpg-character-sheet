<script setup lang="ts">
// How a 5e spell tile is cast (the sheet's upcast select): a slot level, a Pact slot, a free
// cast or a ritual, each with what's left. In the tile's popover and in ActionDetails.
import type { BattleTile } from '~/composables/useBattleActions'

defineProps<{
  name: string
  castWith: NonNullable<BattleTile['castWith']>
  disabled?: boolean
}>()
const uid = useId()
</script>

<template>
  <div class="cw">
    <label class="cw__label" :for="`${uid}-cw`">Cast {{ name }} with</label>
    <select
      :id="`${uid}-cw`"
      class="input cw__select"
      :value="castWith.at"
      :disabled="disabled"
      @change="castWith.set(($event.target as HTMLSelectElement).value)"
    >
      <option v-for="o in castWith.options" :key="o.key" :value="o.key">{{ o.label }}</option>
    </select>
  </div>
</template>

<style scoped lang="scss">
.cw {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 200px;
}

.cw__label {
  font-size: 11px;
  font-weight: 600;
  color: var(--page-muted);
}

.cw__select {
  min-height: 36px;
  font-size: 13px;
}

@media (pointer: coarse) {
  .cw__select {
    min-height: 44px;
    font-size: 16px;
  }
}
</style>
