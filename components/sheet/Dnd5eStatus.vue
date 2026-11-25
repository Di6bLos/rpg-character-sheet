<script setup lang="ts">
// Temp HP and conditions for every D&D 5e theme (Classic, Gothic, Eldritch, Cursed): the
// player edits them here, and the GM's battle board changes reach them through the
// hero_hp_changes / hero_condition_changes pickups. Chips toggle as on the PF2e sheet;
// colours come from the theme's variables; a theme off the panel palette (Cursed's
// parchment) sets the --d5-* properties on it.
import type { Dnd5eSheet } from '~/types/sheets'
import { DND5E_CONDITIONS } from '~/utils/sheetDefaults'

const { draft, canEdit } = useSheet<Dnd5eSheet>()
const sheet = computed(() => draft.value.sheet)
const uid = useId()

const tempHp = computed({
  get: () => sheet.value.tempHp ?? 0,
  set: (v: number | string) => {
    if (!canEdit.value) return
    const n = Math.floor(Number(v))
    sheet.value.tempHp = Number.isFinite(n) ? Math.min(999, Math.max(0, n)) : 0
  },
})

function has(name: string): boolean {
  return (sheet.value.conditions ?? []).includes(name)
}

function toggle(name: string) {
  if (!canEdit.value) return
  if (!Array.isArray(sheet.value.conditions)) sheet.value.conditions = []
  const list = sheet.value.conditions
  const at = list.indexOf(name)
  if (at >= 0) list.splice(at, 1)
  else list.push(name)
}
</script>

<template>
  <div class="d5-status">
    <div class="d5-status__temp">
      <label class="d5-status__label" :for="`${uid}-temp`">Temp HP</label>
      <input
        :id="`${uid}-temp`"
        v-model.number="tempHp"
        class="input d5-status__input"
        type="number"
        min="0"
        max="999"
        inputmode="numeric"
        :readonly="!canEdit"
      />
    </div>
    <div class="d5-status__conds">
      <div :id="`${uid}-cond`" class="d5-status__label">Conditions</div>
      <div class="chips" role="group" :aria-labelledby="`${uid}-cond`">
        <button
          v-for="c in DND5E_CONDITIONS"
          :key="c"
          type="button"
          class="chip d5-status__chip"
          :aria-pressed="has(c)"
          :disabled="!canEdit"
          @click="toggle(c)"
        >
          {{ c }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.d5-status {
  --d5-label: var(--page-muted);
  --d5-field: var(--field);
  --d5-field-text: var(--page-text);
  --d5-line: var(--line);
  --d5-chip-text: var(--page-soft);
  --d5-on: var(--accent);
  --d5-on-text: var(--on-accent);

  display: flex;
  flex-direction: column;
  gap: 10px;
}

.d5-status__temp {
  display: flex;
  align-items: center;
  gap: 10px;
}

.d5-status__label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--d5-label);
}

.d5-status__input {
  width: 84px;
  min-height: 36px;
  font-variant-numeric: tabular-nums;
  background: var(--d5-field);
  border-color: var(--d5-line);
  color: var(--d5-field-text);
}

.d5-status__conds {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.d5-status .chips {
  gap: 6px;
}

// As the PF2e sheet's condition chips.
.d5-status__chip {
  min-height: 32px;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 600;
  background: var(--d5-field);
  border-color: var(--d5-line);
  color: var(--d5-chip-text);

  &[aria-pressed='true'] {
    background: var(--d5-on);
    border-color: var(--d5-on);
    color: var(--d5-on-text);
  }

  &:disabled {
    cursor: default;
  }
}
</style>
