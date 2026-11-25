<script setup lang="ts">
const props = withDefaults(defineProps<{ name: string; open?: boolean; startFolded?: boolean }>(), {
  open: undefined,
  startFolded: false,
})

const storageKey = computed(() => `lantern:fold:${props.name}`)
const folded = ref(false)

onMounted(() => {
  if (props.open !== undefined) {
    folded.value = !props.open
    return
  }
  try {
    const stored = localStorage.getItem(storageKey.value)
    folded.value = stored === null ? props.startFolded : stored === '1'
  } catch {
    folded.value = props.startFolded
  }
})

watch(
  () => props.open,
  (open) => {
    if (open !== undefined) folded.value = !open
  },
)

function toggle() {
  folded.value = !folded.value
  try {
    if (folded.value) localStorage.setItem(storageKey.value, '1')
    else if (props.startFolded) localStorage.setItem(storageKey.value, '0')
    else localStorage.removeItem(storageKey.value)
  } catch {
    return
  }
}
</script>

<template>
  <button
    type="button"
    class="ui-fold"
    :aria-expanded="!folded"
    :aria-label="`${folded ? 'Show' : 'Hide'} ${name}`"
    :title="folded ? `Show ${name}` : `Hide ${name}`"
    @click="toggle"
  >
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      stroke-width="2.2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path :d="folded ? 'm6 9 6 6 6-6' : 'm6 15 6-6 6 6'" />
    </svg>
  </button>
</template>

<style scoped lang="scss">
.ui-fold {
  position: absolute;
  top: 14px;
  right: 14px;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid color-mix(in srgb, currentColor 60%, transparent);
  border-radius: 8px;
  background: transparent;
  color: var(--accent-text);
  cursor: pointer;

  &:hover {
    border-color: var(--accent);
  }

  @media (pointer: coarse) {
    &::after {
      content: '';
      position: absolute;
      inset: -7px;
    }
  }
}
</style>
