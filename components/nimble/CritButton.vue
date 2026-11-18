<script setup lang="ts">
// For players who roll their own dice: they rolled a crit (or a minion's max),
// so set off what the app would have on its own roll.
defineProps<{ triggers: string[]; disabled?: boolean }>()
defineEmits<{ crit: [] }>()
</script>

<template>
  <button
    type="button"
    class="btn btn--ghost btn--sm btn--wrap crit"
    :disabled="disabled"
    :title="`A crit sets off: ${triggers.join(', ')}`"
    @click="$emit('crit')"
  >
    It crit: {{ triggers.join(', ') }}
  </button>
</template>

<style scoped lang="scss">
.crit {
  align-self: flex-start;
  font-size: 12px;
}
</style>
