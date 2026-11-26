<script setup lang="ts">
// Chips for conditions whose attack disadvantage depends on the target
// (Taunted, Frightened): on means the next attacks take the extra die. Then
// Disadvantage and Advantage steppers for what the GM calls, counted on every attack.
// The row is the shared SheetSituation.
import type { NimbleSheet } from '~/types/sheets'
import { SITUATIONAL } from '~/utils/nimbleConditions'

const { draft } = useSheet<NimbleSheet>()
const situation = useAttackSituation()
const odds = useAttackOdds()

const chips = computed(() =>
  SITUATIONAL.filter((s) => draft.value.sheet.conditions.includes(s.name)).map((s) => ({
    key: s.name,
    label: `${s.name}: ${s.when} · +1 disadvantage`,
    on: situation.value.includes(s.name),
  })),
)

const steppers = computed(() =>
  (
    [
      { key: 'disadvantage', label: 'Disadvantage', hint: 'disadvantage' },
      { key: 'advantage', label: 'Advantage', hint: 'advantage' },
    ] as const
  ).map((o) => ({ ...o, value: odds.value[o.key], max: 6 })),
)

function toggle(name: string) {
  situation.value = situation.value.includes(name)
    ? situation.value.filter((n) => n !== name)
    : [...situation.value, name]
}

function step(key: string, by: number) {
  const k = key as 'disadvantage' | 'advantage'
  odds.value = { ...odds.value, [k]: Math.max(0, Math.min(6, odds.value[k] + by)) }
}
</script>

<template>
  <SheetSituation
    chips-label="Conditions"
    :chips="chips"
    :steppers="steppers"
    @toggle="toggle"
    @step="step"
  />
</template>
