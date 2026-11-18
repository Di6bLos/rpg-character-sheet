<script setup lang="ts">
// "+3 disadvantage" on an attack card; what adds up to it shows on hover.
const props = defineProps<{ rushed: number; advantage: number; why: string }>()

const text = computed(() =>
  props.rushed
    ? `+${props.rushed} disadvantage`
    : props.advantage
      ? `+${props.advantage} advantage`
      : '',
)
</script>

<template>
  <span
    v-if="text"
    class="odds"
    :class="{ 'odds--adv': !rushed }"
    :title="why || undefined"
    :aria-label="why ? `${text}: ${why}` : undefined"
    tabindex="0"
    >{{ text }}</span
  >
</template>

<style scoped lang="scss">
.odds {
  align-self: flex-start;
  font-size: 12px;
  font-weight: 700;
  color: var(--danger-text);
  text-decoration: underline dotted;
  text-underline-offset: 3px;
  cursor: help;

  &--adv {
    color: var(--accent-text);
  }
}
</style>
