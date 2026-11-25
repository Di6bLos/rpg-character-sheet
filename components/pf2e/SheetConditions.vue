<script setup lang="ts">
// The PF2e sheet's conditions: a chip per condition (its effect on hover and to screen
// readers), and a value stepper on valued ones that are on (frightened 2). What they do to
// the numbers is `conditionMods` in utils/pf2ePlay.ts; the sheet shows the changed values.
import type { Pf2eSheet } from '~/types/sheets'
import { PF2E_CONDITION_DEFS, activeConditions, conditionValue } from '~/utils/pf2ePlay'

const { draft, canEdit } = useSheet<Pf2eSheet>()
const sheet = computed(() => draft.value.sheet)
const implied = computed(() => {
  const on = activeConditions(sheet.value)
  return new Set([...on].filter((c) => !sheet.value.conditions.includes(c)))
})

function toggle(name: string) {
  if (!canEdit.value) return
  const s = sheet.value
  if (s.conditions.includes(name)) {
    s.conditions = s.conditions.filter((c) => c !== name)
    if (s.conditionValues) delete s.conditionValues[name]
  } else s.conditions = [...s.conditions, name]
}

function step(name: string, by: number) {
  if (!canEdit.value) return
  const s = sheet.value
  const next = conditionValue(s, name) + by
  if (next < 1) return toggle(name)
  s.conditionValues = { ...s.conditionValues, [name]: Math.min(9, next) }
}
</script>

<template>
  <div class="stack" style="gap: 8px">
    <div class="caps">Conditions</div>
    <div class="conds">
      <div
        v-for="c in PF2E_CONDITION_DEFS"
        :key="c.name"
        class="cond"
        :class="{ 'is-on': sheet.conditions.includes(c.name), 'is-implied': implied.has(c.name) }"
      >
        <button
          type="button"
          class="chip cond__chip"
          :aria-pressed="sheet.conditions.includes(c.name)"
          :aria-describedby="`cond-${c.name}`"
          :title="implied.has(c.name) ? `${c.effect} (from another condition)` : c.effect"
          :disabled="!canEdit"
          @click="toggle(c.name)"
        >
          {{ c.name
          }}{{
            c.valued && sheet.conditions.includes(c.name) ? ` ${conditionValue(sheet, c.name)}` : ''
          }}
        </button>
        <span :id="`cond-${c.name}`" class="sr-only">{{ c.effect }}</span>
        <span v-if="c.valued && sheet.conditions.includes(c.name)" class="cond__step">
          <button
            type="button"
            class="step step--xs"
            :aria-label="`Lower ${c.name}`"
            :disabled="!canEdit"
            @click="step(c.name, -1)"
          >
            −
          </button>
          <button
            type="button"
            class="step step--xs"
            :aria-label="`Raise ${c.name}`"
            :disabled="!canEdit"
            @click="step(c.name, 1)"
          >
            +
          </button>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.conds {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.cond {
  display: inline-flex;
  align-items: center;
  gap: 4px;

  &.is-on {
    padding-right: 4px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 14%, transparent);
  }
}

.cond__chip[aria-pressed='true'] {
  border-color: var(--accent);
  color: var(--page-text);
  font-weight: 700;
}

// On because another condition gives it (prone → off-guard): outlined, not filled.
.is-implied .cond__chip {
  border-style: dashed;
  border-color: var(--accent);
}

.cond__step {
  display: inline-flex;
  gap: 2px;
}
</style>
