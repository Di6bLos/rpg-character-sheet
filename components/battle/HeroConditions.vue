<script setup lang="ts">
// The hero column's conditions: the active ones as chips (with when each ends; tap a
// set one to remove it), statuses from spells and abilities with End, what they do,
// and + Add, which opens the sheet's own Conditions picker. Same rules
// (useNimbleConditions).
const { canEdit } = useSheet()
const { active, effects, statuses, end, toggle, END_LABELS } = useNimbleConditions()

const addOpen = ref(false)

const chips = computed(() =>
  active.value
    .filter((c) => !c.fromEffect)
    .map((c) => ({
      name: c.name,
      fixed: c.automatic,
      title: c.automatic ? `${c.desc} Set automatically.` : `${c.desc} Ends ${END_LABELS[c.end]}.`,
    })),
)
</script>

<template>
  <div class="cond">
    <div class="cond__head">
      <span class="sect">Conditions</span>
      <button
        type="button"
        class="btn btn--ghost btn--sm cond__add"
        :disabled="!canEdit"
        @click="addOpen = true"
      >
        + Add
      </button>
    </div>
    <div v-if="chips.length || statuses.length" class="cond__chips">
      <template v-for="c in chips" :key="c.name">
        <span v-if="c.fixed" class="cond__chip" :title="c.title">{{ c.name }}</span>
        <button
          v-else
          type="button"
          class="cond__chip cond__chip--set"
          :title="`${c.title} Click to remove.`"
          :aria-label="`Remove ${c.name}`"
          :disabled="!canEdit"
          @click="toggle(c.name)"
        >
          {{ c.name }} <span aria-hidden="true">×</span>
        </button>
      </template>
      <button
        v-for="st in statuses"
        :key="st.source"
        type="button"
        class="cond__chip cond__chip--status"
        :title="`${st.until} Click to end it.`.trim()"
        :aria-label="`End ${st.label}`"
        :disabled="!canEdit"
        @click="end(st.source)"
      >
        {{ st.label }} <span aria-hidden="true">×</span>
      </button>
    </div>
    <p v-else class="cond__none">No conditions</p>
    <ul v-if="effects.length" class="cond__effects">
      <li v-for="e in effects" :key="e">{{ e }}</li>
    </ul>
    <UiDialog v-model="addOpen" title="Conditions" width="560px">
      <NimbleSheetConditions />
    </UiDialog>
  </div>
</template>

<style scoped lang="scss">
.cond {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cond__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.cond__add {
  min-height: 26px;
  padding: 0 8px;
  font-size: 12px;
}

.cond__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.cond__chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 24px;
  padding: 0 9px;
  border-radius: 999px;
  border: 1px solid var(--line-strong);
  background: transparent;
  color: var(--page-soft);
  font-size: 12px;
  font-weight: 600;

  &--set {
    background: var(--warn-bg);
    color: var(--warn-text);
    border-color: var(--accent);
  }

  &--status {
    background: color-mix(in srgb, var(--secondary) 16%, transparent);
    border-color: var(--secondary);
    color: var(--page-text);
  }

  &:disabled {
    opacity: 1;
    cursor: default;
  }
}

.cond__none {
  margin: 0;
  font-size: 12px;
  color: var(--page-muted);
}

.cond__effects {
  margin: 0;
  padding-left: 16px;
  font-size: 11px;
  line-height: 1.3;
  color: var(--page-soft);
}
</style>
