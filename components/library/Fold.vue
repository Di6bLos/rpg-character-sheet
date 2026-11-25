<script setup lang="ts">
// A folding entry inside a Library class (a feature, an option, a subclass): its name and a
// short meta line as the summary; the body renders only while it's open, so a class with
// dozens of features stays light until they're read.
const props = defineProps<{ title: string; meta?: string; open?: boolean }>()

const isOpen = ref(props.open ?? false)
watch(
  () => props.open,
  (open) => (isOpen.value = open ?? false),
)
</script>

<template>
  <details
    class="fold"
    :open="isOpen"
    @toggle="isOpen = ($event.target as HTMLDetailsElement).open"
  >
    <summary>
      <span class="fold__title">{{ title }}</span>
      <span v-if="meta" class="fold__meta">{{ meta }}</span>
      <svg
        class="fold__chev"
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
    </summary>
    <div v-if="isOpen" class="fold__body">
      <slot />
    </div>
  </details>
</template>

<style scoped lang="scss">
.fold {
  border: 1px solid var(--line);
  border-radius: var(--radius-sm, 8px);

  & + & {
    margin-top: 6px;
  }

  &[open] > summary .fold__chev {
    transform: rotate(180deg);
  }
}

summary {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 8px 12px;
  cursor: pointer;
  list-style: none;

  &::-webkit-details-marker {
    display: none;
  }

  &:hover .fold__title {
    color: var(--accent-text);
  }

  &:focus-visible {
    outline: 2px solid var(--accent-text);
    outline-offset: -2px;
    border-radius: inherit;
  }
}

.fold__title {
  font-weight: 600;
  min-width: 0;
  overflow-wrap: anywhere;
}

.fold__meta {
  font-size: 13px;
  color: var(--page-muted);
}

.fold__chev {
  flex: none;
  margin-left: auto;
  color: var(--accent-text);
  transition: transform 0.15s;
}

.fold__body {
  padding: 2px 12px 12px;
  font-size: 15px;
  line-height: 1.6;

  :deep(p),
  :deep(ul),
  :deep(ol) {
    margin: 0 0 10px;
  }

  :deep(> :last-child) {
    margin-bottom: 0;
  }

  :deep(ul),
  :deep(ol) {
    padding-left: 22px;
  }

  :deep(hr) {
    margin: 14px 0;
    border: 0;
    border-top: 1px solid var(--line);
  }

  :deep(h5),
  :deep(h6) {
    margin: 14px 0 4px;
    font-size: 15px;
  }
}
</style>
