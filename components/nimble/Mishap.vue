<script setup lang="ts">
defineProps<{ name: string; text: string }>()
</script>

<template>
  <details class="mishap">
    <summary>Mishap · {{ name }}</summary>
    <p>{{ text }}</p>
  </details>
</template>

<style scoped lang="scss">
.mishap {
  padding: 6px 10px;
  border-left: 3px solid var(--danger, #e2735f);
  border-radius: 4px;
  background: color-mix(in srgb, var(--danger, #e2735f) 12%, transparent);
  text-align: left;

  > summary {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--danger, #e2735f);
    cursor: pointer;
    list-style: none;

    &::-webkit-details-marker {
      display: none;
    }

    &::after {
      content: '▾';
      margin-left: auto;
      font-size: 11px;
      letter-spacing: normal;
    }
  }

  &[open] > summary::after {
    content: '▴';
  }

  p {
    margin: 4px 0 0;
    font-size: 12px;
    line-height: 1.45;
    color: var(--page-soft);
  }
}
</style>
