<script setup lang="ts">
// The PF2e sheet's conditions in the shared SheetConditions block (usePf2eConditions): a chip
// per condition with its effect, valued ones with their value and −/+ (frightened 2), those
// another condition gives dashed; each active one with when it ends; what they do to the
// numbers; then the effects allies give (Bless, Heroism +2), folded to those on you.
import type { Pf2eConditionEnd } from '~/types/sheets'

const { canEdit } = useSheet()
const {
  chips,
  active,
  effects,
  toggle,
  step,
  setEnd,
  ENDS,
  given,
  alliesOpen,
  shownGiven,
  giveToggle,
  setValue,
  always,
  withToggle,
  givenNotes,
} = usePf2eConditions()
const groups = computed(() => [{ chips: chips.value }])
const allEffects = computed(() => [...effects.value, ...givenNotes.value])

function onEnd(name: string, end: string) {
  setEnd(name, end as Pf2eConditionEnd | 'manual')
}
</script>

<template>
  <SheetConditions
    :groups="groups"
    :active="active"
    :ends="ENDS"
    :effects="allEffects"
    @toggle="toggle"
    @step="step"
    @set-end="onEnd"
  >
    <template #after-groups>
      <div class="chips" style="gap: 6px">
        <button
          type="button"
          class="cond-group fx-fold"
          :aria-expanded="alliesOpen"
          @click="alliesOpen = !alliesOpen"
        >
          Ally effects{{ given.size ? ` · ${given.size} on` : '' }}
          <span aria-hidden="true">{{ alliesOpen ? '▴' : '▾' }}</span>
        </button>
        <span v-for="e in shownGiven" :key="e.name" class="fx-given">
          <button
            type="button"
            class="chip cond"
            :aria-pressed="given.has(e.name)"
            :title="e.note"
            :disabled="!canEdit"
            @click="giveToggle(e.name, e.values)"
          >
            {{ e.name.replace(' (ally)', '') }}
          </button>
          <select
            v-if="e.values && given.has(e.name)"
            class="input fx-value"
            :aria-label="`${e.name} bonus`"
            :value="given.get(e.name)?.value ?? e.values[0]"
            :disabled="!canEdit"
            @change="setValue(e.name, Number(($event.target as HTMLSelectElement).value))"
          >
            <option v-for="v in e.values" :key="v" :value="v">+{{ v }}</option>
          </select>
        </span>
      </div>
      <p v-if="always.length" class="small muted fx-line">
        Always on: {{ always.map((e) => e.name).join(', ') }}
      </p>
      <p v-for="[toggleName, names] in withToggle" :key="toggleName" class="small muted fx-line">
        With {{ toggleName }}: {{ names.join(', ') }}
      </p>
    </template>
  </SheetConditions>
</template>

<style scoped lang="scss">
.cond-group {
  align-self: center;
  margin-right: 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--page-muted);
}

.fx-fold {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
}

.fx-given {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.cond {
  min-height: 34px;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 600;

  &[aria-pressed='true'] {
    background: var(--warn-bg);
    color: var(--warn-text);
    border-color: var(--accent);
  }
}

.fx-value {
  width: auto;
  min-height: 34px;
  padding: 2px 6px;
  font-size: 13px;
}

.fx-line {
  margin: 0;
}

@media (pointer: coarse) {
  .fx-fold,
  .cond,
  .fx-value {
    min-height: 44px;
  }
}
</style>
