<script setup lang="ts">
// A small icon button for the right column: fold a panel (up/down) or collapse the
// column sideways (right/left).
defineProps<{ label: string; dir: 'up' | 'down' | 'left' | 'right' }>()

const PATHS = {
  up: 'm6 15 6-6 6 6',
  down: 'm6 9 6 6 6-6',
  left: 'm15 6-6 6 6 6',
  right: 'm9 6 6 6-6 6',
} as const
</script>

<template>
  <button type="button" class="ptoggle" :aria-label="label" :title="label">
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      stroke-width="2.2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path :d="PATHS[dir]" />
    </svg>
  </button>
</template>

<style scoped lang="scss">
.ptoggle {
  flex: none;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: transparent;
  color: var(--accent-text);
  cursor: pointer;

  &:hover {
    border-color: var(--accent);
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
}
</style>
