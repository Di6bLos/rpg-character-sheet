<script setup lang="ts">
// The Skills panel's "Next check" choice on the Nimble and PF2e sheets (Nimble: Normal /
// Advantage / Disadvantage; PF2e: Fortune / Normal / Misfortune); the sheet resets it after a
// check. The `extra` slot takes what sits beside it (Nimble's Frightened chip, PF2e's DC).
defineProps<{ options: { value: string | number; label: string }[]; disabled?: boolean }>()
const model = defineModel<string | number>({ required: true })
</script>

<template>
  <div class="check-odds" role="group" aria-label="Next skill check">
    <span class="caps">Next check</span>
    <button
      v-for="o in options"
      :key="o.value"
      type="button"
      class="chip"
      :class="{ 'chip--on': model === o.value }"
      :aria-pressed="model === o.value"
      :disabled="disabled"
      @click="model = o.value"
    >
      {{ o.label }}
    </button>
    <slot name="extra" />
  </div>
</template>

<style scoped lang="scss">
.check-odds {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;

  .chip--on {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    color: var(--page-text);
  }
}
</style>
