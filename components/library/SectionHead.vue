<script setup lang="ts">
// The header of a folding Library list section (a spell level, a feat category): its name and
// how many rows match, as one button that folds or opens it. Sits in a table's row-group
// header on wide screens and above a section's cards on phones.
defineProps<{ label: string; count: number; open: boolean; controls: string }>()
defineEmits<{ toggle: [] }>()
</script>

<template>
  <button
    type="button"
    class="group-head"
    :aria-expanded="open"
    :aria-controls="controls"
    @click="$emit('toggle')"
  >
    <span class="group-head__label">{{ label }}</span>
    <span class="sr-only">, </span>
    <span class="group-head__count">{{ count }}</span>
    <svg
      class="group-head__chev"
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
      <path d="m6 9 6 6 6-6" />
    </svg>
  </button>
</template>

<style scoped lang="scss">
.group-head {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 48px;
  padding: 8px 20px;
  border: 0;
  background: color-mix(in srgb, var(--page-text) 5%, transparent);
  color: var(--page-text);
  font: inherit;
  font-size: 15px;
  letter-spacing: normal;
  text-transform: none;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--accent-tint);

    .group-head__label {
      color: var(--accent-text);
    }
  }

  &:focus-visible {
    outline: 2px solid var(--accent-text);
    outline-offset: -2px;
  }

  &[aria-expanded='true'] .group-head__chev {
    transform: rotate(180deg);
  }
}

.group-head__label {
  font-weight: 700;
}

.group-head__count {
  min-width: 24px;
  padding: 2px 8px;
  border-radius: 999px;
  box-shadow: inset 0 0 0 1px var(--line-strong);
  font-size: 12px;
  font-weight: 700;
  color: var(--page-soft);
  text-align: center;
}

.group-head__chev {
  flex: none;
  margin-left: auto;
  color: var(--accent-text);
  transition: transform 0.15s;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}
</style>
