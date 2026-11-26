<script setup lang="ts">
// The source filter's menu: one checkbox per book (`useDnd5eSourceFilter`), every one on until
// the player turns some off.
const filter = useDnd5eSourceFilter()

const summary = computed(() => {
  const shown = DND5E_FILTER_BOOKS.length - filter.off.value.length
  return shown === DND5E_FILTER_BOOKS.length
    ? 'All books'
    : `${shown} of ${DND5E_FILTER_BOOKS.length} books`
})
const KIND_LABEL = { core: 'Core', supplement: 'Supplement', setting: 'Setting', drop: 'Drop' }
</script>

<template>
  <UiCheckMenu label="Sources" :value="summary" class="source-filter">
    <button
      v-if="filter.off.value.length"
      type="button"
      class="btn btn--ghost btn--sm source-filter__all"
      @click="filter.showAll()"
    >
      Show every book
    </button>
    <label
      v-for="b in DND5E_FILTER_BOOKS"
      :key="b.name"
      class="check-menu__item"
      :class="{ on: filter.shows(b.name) }"
    >
      <input
        type="checkbox"
        :checked="filter.shows(b.name)"
        @change="filter.set(b.name, ($event.target as HTMLInputElement).checked)"
      />
      <span
        >{{ b.name }} <small>{{ KIND_LABEL[b.kind] }}</small></span
      >
    </label>
  </UiCheckMenu>
</template>

<style scoped lang="scss">
.source-filter {
  width: min(280px, 100%);
}

.source-filter__all {
  align-self: flex-start;
  margin-bottom: 4px;
}
</style>
