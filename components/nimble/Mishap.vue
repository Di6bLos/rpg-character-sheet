<script setup lang="ts">
defineProps<{ name: string; text: string }>()
</script>

<template>
  <div class="mishap" role="note">
    <span class="mishap__head">Mishap · {{ name }}</span>
    <span>{{ text }}</span>
  </div>
</template>

<style scoped lang="scss">
.mishap {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 10px;
  border-left: 3px solid var(--danger, #e2735f);
  border-radius: 4px;
  background: color-mix(in srgb, var(--danger, #e2735f) 12%, transparent);
  font-size: 12px;
  line-height: 1.45;
  color: var(--page-soft);
  text-align: left;
}

.mishap__head {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--danger, #e2735f);
}
</style>
