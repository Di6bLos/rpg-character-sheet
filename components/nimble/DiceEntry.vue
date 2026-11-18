<script setup lang="ts">
const props = defineProps<{ label: string; action: string; alt?: string; disabled?: boolean }>()
const emit = defineEmits<{ submit: [values: number[]]; alt: [values: number[]] }>()

const id = useId()
const text = ref('')
const values = computed(() =>
  text.value
    .split(/[\s,+]+/)
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0),
)

function send(kind: 'submit' | 'alt') {
  if (!values.value.length) return
  if (kind === 'submit') emit('submit', values.value)
  else emit('alt', values.value)
  text.value = ''
}
</script>

<template>
  <form class="entry" @submit.prevent="send('submit')">
    <label :for="id" class="sr-only">{{ props.label }}</label>
    <input
      :id="id"
      v-model="text"
      class="input"
      inputmode="numeric"
      :placeholder="props.label"
      :disabled="props.disabled"
    />
    <button type="submit" class="btn btn--sm" :disabled="props.disabled || !values.length">
      {{ props.action }}
    </button>
    <button
      v-if="props.alt"
      type="button"
      class="btn btn--ghost btn--sm"
      :disabled="props.disabled || !values.length"
      @click="send('alt')"
    >
      {{ props.alt }}
    </button>
  </form>
</template>

<style scoped lang="scss">
.entry {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;

  .input {
    flex: 1 1 120px;
    min-width: 0;
  }
}
</style>
