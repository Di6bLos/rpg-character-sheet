<script setup lang="ts">
// Expand all / Collapse all for a Library list's folding sections, beside its filters; each
// is disabled when every section already is.
defineProps<{ allOpen: boolean; allClosed: boolean }>()
defineEmits<{ expand: []; collapse: [] }>()
</script>

<template>
  <div class="section-tools" role="group" aria-label="Sections">
    <button
      type="button"
      class="btn btn--quiet btn--sm"
      :disabled="allOpen"
      @click="$emit('expand')"
    >
      Expand all
    </button>
    <button
      type="button"
      class="btn btn--quiet btn--sm"
      :disabled="allClosed"
      @click="$emit('collapse')"
    >
      Collapse all
    </button>
  </div>
</template>

<style scoped lang="scss">
.section-tools {
  display: flex;
  gap: 4px;
  margin-left: auto;

  .btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  @media (max-width: 640px) {
    margin-left: 0;

    .btn {
      min-height: 44px;
    }
  }
}
</style>
