<script setup lang="ts">
// The license notice at the foot of a Library tab, from the system's entry in data/rules.
defineProps<{ text: string }>()
</script>

<template>
  <footer class="library-notice">{{ text }}</footer>
</template>

<style scoped lang="scss">
.library-notice {
  margin-top: 28px;
  padding-top: 14px;
  border-top: 1px solid var(--line);
  font-size: 12px;
  line-height: 1.5;
  color: var(--page-muted);
}
</style>
