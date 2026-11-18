<script setup lang="ts">
const props = defineProps<{
  name: string
  tier: number
  at: number
  max: number
  price?: string
  disabled?: boolean
}>()
const emit = defineEmits<{ set: [tier: number] }>()
</script>

<template>
  <div class="upcast">
    <span>Cast at</span>
    <button
      type="button"
      class="step step--xs"
      :aria-label="`Lower the cast tier of ${props.name}`"
      :disabled="disabled || at <= tier"
      @click="emit('set', at - 1)"
    >
      −
    </button>
    <strong aria-live="polite">Tier {{ at }}</strong>
    <button
      type="button"
      class="step step--xs"
      :aria-label="`Upcast ${props.name}`"
      :disabled="disabled || at >= max"
      @click="emit('set', at + 1)"
    >
      +
    </button>
    <small v-if="price">{{ price }}</small>
  </div>
</template>

<style scoped lang="scss">
.upcast {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--page-soft);

  > span {
    margin-right: auto;
    white-space: nowrap;
  }

  strong {
    min-width: 42px;
    white-space: nowrap;
    text-align: center;
    color: var(--page-text);
  }

  small {
    white-space: nowrap;
    text-align: right;
    font-size: 11px;
    color: var(--page-muted);
  }
}
</style>
