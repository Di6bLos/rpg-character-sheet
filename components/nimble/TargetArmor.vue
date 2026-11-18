<script setup lang="ts">
// The armor of the creature being attacked; damage results count it (Core p. 14).
import { TARGET_ARMORS } from '~/utils/nimbleTargetArmor'

const { canEdit } = useSheet()
const armor = useTargetArmor()
</script>

<template>
  <div class="target-armor" role="radiogroup" aria-label="Target armor">
    <span class="caps">Target armor</span>
    <button
      v-for="a in TARGET_ARMORS"
      :key="a.value"
      type="button"
      role="radio"
      class="chip"
      :class="{ 'chip--on': armor === a.value }"
      :aria-checked="armor === a.value"
      :disabled="!canEdit"
      @click="armor = a.value"
    >
      {{ a.label }}
    </button>
    <UiHelp
      label="About target armor"
      text="Medium armor takes only the dice (positive modifiers are ignored); Heavy armor takes half the dice. Crits and attacks that ignore armor deal full damage. Results show the damage after armor."
    />
  </div>
</template>

<style scoped lang="scss">
.target-armor {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;

  .chip--on {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    color: var(--page-text);
  }
}
</style>
