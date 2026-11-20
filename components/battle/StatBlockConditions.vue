<script setup lang="ts">
// The stat block's conditions: chips (click to remove) and + Add, a list of Nimble's
// conditions and spell statuses (not the ones the sheet works out itself). Monster
// conditions are plain names with no end timing.
import type { TurnRow, useInitiative } from '~/composables/useInitiative'
import { AUTO_CONDITIONS, CONDITIONS } from '~/data/nimble/core'
import { SPELL_STATUSES } from '~/utils/nimbleConditions'

const props = defineProps<{ init: ReturnType<typeof useInitiative>; c: TurnRow }>()
const c = computed(() => props.c)

const CONDITION_NAMES = [...CONDITIONS, ...SPELL_STATUSES]
  .map((x) => x.name)
  .filter((n) => !AUTO_CONDITIONS.includes(n) && n !== 'Helped')
const conditions = computed(() => c.value.conditions ?? [])
const addable = computed(() => CONDITION_NAMES.filter((n) => !conditions.value.includes(n)))
function addCondition(event: Event) {
  const el = event.target as HTMLSelectElement
  const value = el.value
  el.value = ''
  if (value) void props.init.setConditions(c.value, [...conditions.value, value])
}
function removeCondition(n: string) {
  void props.init.setConditions(
    c.value,
    conditions.value.filter((x) => x !== n),
  )
}
</script>

<template>
  <div class="sbk__cond">
    <div class="sbk__cond-head">
      <span class="sbk__label">Conditions</span>
      <select
        class="sbk__add"
        :aria-label="`Add a condition to ${c.name}`"
        :disabled="!addable.length"
        @change="addCondition"
      >
        <option value="">+ Add</option>
        <option v-for="n in addable" :key="n" :value="n">{{ n }}</option>
      </select>
    </div>
    <div v-if="conditions.length" class="sbk__chips">
      <button
        v-for="n in conditions"
        :key="n"
        type="button"
        class="sbk__chip"
        :aria-label="`Remove ${n}`"
        :title="`Remove ${n}`"
        @click="removeCondition(n)"
      >
        {{ n }} <span aria-hidden="true">×</span>
      </button>
    </div>
    <p v-else class="sbk__muted">None</p>
  </div>
</template>

<style scoped lang="scss">
.sbk__cond {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sbk__cond-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.sbk__label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--page-muted);
}

.sbk__add {
  min-height: 28px;
  padding: 0 8px;
  border-radius: var(--radius-control);
  border: 1px solid var(--line-strong);
  background: var(--field);
  color: var(--page-text);
  font: inherit;
  font-size: 12px;
}

.sbk__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.sbk__chip {
  min-height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--danger) 45%, transparent);
  background: var(--danger-bg);
  color: var(--danger-text);
  font-size: 11.5px;
  font-weight: 600;
}

.sbk__muted {
  margin: 0;
  font-size: 12.5px;
  color: var(--page-muted);
}
</style>
