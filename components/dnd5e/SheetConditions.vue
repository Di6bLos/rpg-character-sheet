<script setup lang="ts">
// The 5e sheet's conditions in the shared SheetConditions block (SRD 5.2.1 pp. 177–181): a chip
// per condition with its rules on hover, Exhaustion with its level and −/+; the effects on the
// hero (Rage, Dodge, Shield, Bless…) with when they end and End; each active condition with
// when it ends; what they all do to the numbers; then the effects allies give (Bless, Help,
// Bardic Inspiration), folded to those on the hero, and the states the hero's own features let
// it pick (a Wild Heart's Bear, Eagle or Wolf spirit while raging). Rules in
// utils/dnd5eConditions.ts and utils/dnd5eEffects.ts.
import type { Dnd5eConditionEnd, Dnd5eSheet } from '~/types/sheets'
import {
  DND5E_CONDITION_RULES,
  DND5E_END_LABELS,
  activeConditions,
  conditionSummary,
  exhaustionOf,
  setConditionEnd,
  setExhaustion,
  toggleCondition,
} from '~/utils/dnd5eConditions'
import { DND5E_EFFECTS, activeEffectDefs, addEffect, removeEffect } from '~/utils/dnd5eEffects'
import { dnd5eHero, endConcentration, endOnIncapacitated } from '~/utils/dnd5ePlay'

const { draft, canEdit, say } = useSheet<Dnd5eSheet>()
const sheet = computed(() => draft.value.sheet)
const ENDS = Object.entries(DND5E_END_LABELS) as [string, string][]
const EFFECT_END: Record<string, string> = {
  ...DND5E_END_LABELS,
  concentration: 'while you concentrate',
  long: 'until a Long Rest',
  attack: 'until your next attack',
  manual: 'until ended',
}

const implied = computed(() => {
  const on = activeConditions(sheet.value)
  return new Set([...on].filter((c) => !sheet.value.conditions.includes(c)))
})

const chips = computed(() =>
  DND5E_CONDITION_RULES.map((c) => {
    const on = sheet.value.conditions.includes(c.name)
    const ex = c.name === 'Exhaustion' ? exhaustionOf(sheet.value) : 0
    return {
      name: c.name,
      label: ex ? `Exhaustion ${ex}` : c.name,
      on: on || implied.value.has(c.name),
      implied: implied.value.has(c.name),
      stepper: c.name === 'Exhaustion' && on,
      title: implied.value.has(c.name) ? `${c.effect} (from another condition)` : c.effect,
    }
  }),
)

const active = computed(() =>
  DND5E_CONDITION_RULES.filter((c) => sheet.value.conditions.includes(c.name)).map((c) => ({
    name: c.name,
    label: c.name === 'Exhaustion' ? `Exhaustion ${exhaustionOf(sheet.value)}` : c.name,
    desc: c.effect,
    end: c.name === 'Exhaustion' ? null : (sheet.value.conditionEnds?.[c.name] ?? 'manual'),
    ...(c.name === 'Exhaustion' ? { auto: 'A Long Rest lowers it by 1.' } : {}),
  })),
)

const effects = computed(() => [
  ...conditionSummary(sheet.value),
  ...activeEffectDefs(sheet.value).map((d) => `${d.name}: ${d.note}`),
])

const statuses = computed(() =>
  (sheet.value.effects ?? []).map((e) => ({
    source: e.key,
    label: e.name,
    until: EFFECT_END[e.ends] ?? '',
  })),
)

function toggle(name: string) {
  if (!canEdit.value) return
  const s = sheet.value
  const was = s.conditions.includes(name)
  toggleCondition(s, name)
  if (!was) {
    const ended = endOnIncapacitated(s)
    if (ended.length) say(`${name}: ${ended.join(', ')} ended.`)
  }
}

function step(name: string, by: number) {
  if (canEdit.value && name === 'Exhaustion') {
    setExhaustion(sheet.value, exhaustionOf(sheet.value) + by)
    if (exhaustionOf(sheet.value) >= 6) say('Exhaustion 6: your hero dies.')
  }
}

function onEnd(name: string, end: string) {
  if (canEdit.value) setConditionEnd(sheet.value, name, end as Dnd5eConditionEnd | 'manual')
}

function endStatus(key: string) {
  if (!canEdit.value) return
  const name = removeEffect(sheet.value, key)
  const c = sheet.value.concentration
  if (c && DND5E_EFFECTS[key]?.ends === 'concentration') endConcentration(sheet.value)
  if (name)
    say(
      `${name} ended${c && DND5E_EFFECTS[key]?.ends === 'concentration' ? `, and your Concentration on ${c.name}` : ''}.`,
    )
}

const ALLY = Object.values(DND5E_EFFECTS).filter((d) => d.ally)
const on = computed(() => new Set((sheet.value.effects ?? []).map((e) => e.key)))
const alliesOpen = ref(false)
const shownAllies = computed(() =>
  alliesOpen.value ? ALLY : ALLY.filter((d) => on.value.has(d.key)),
)

const OWN = Object.values(DND5E_EFFECTS).filter((d) => d.feature)
const own = computed(() => {
  const hero = dnd5eHero(sheet.value, draft.value.level)
  return OWN.filter((d) => hero.has(d.feature!))
})

function ownToggle(key: string) {
  if (!canEdit.value) return
  if (on.value.has(key)) removeEffect(sheet.value, key)
  else addEffect(sheet.value, key)
}

function giveToggle(key: string) {
  if (!canEdit.value) return
  if (on.value.has(key)) removeEffect(sheet.value, key)
  else addEffect(sheet.value, key, { ends: 'manual', name: `${DND5E_EFFECTS[key]!.name} (ally)` })
}
</script>

<template>
  <SheetConditions
    :groups="[{ chips }]"
    :active="active"
    :ends="ENDS"
    :effects="effects"
    :statuses="statuses"
    @toggle="toggle"
    @step="step"
    @set-end="onEnd"
    @end="endStatus"
  >
    <template #after-groups>
      <div v-if="own.length" class="chips" style="gap: 6px">
        <span class="cond-group">Your states</span>
        <button
          v-for="d in own"
          :key="d.key"
          type="button"
          class="chip cond"
          :aria-pressed="on.has(d.key)"
          :title="d.note"
          :disabled="!canEdit"
          @click="ownToggle(d.key)"
        >
          {{ d.name }}
        </button>
      </div>
      <div class="chips" style="gap: 6px">
        <button
          type="button"
          class="cond-group fx-fold"
          :aria-expanded="alliesOpen"
          @click="alliesOpen = !alliesOpen"
        >
          Ally effects
          <span aria-hidden="true">{{ alliesOpen ? '▴' : '▾' }}</span>
        </button>
        <button
          v-for="d in shownAllies"
          :key="d.key"
          type="button"
          class="chip cond"
          :aria-pressed="on.has(d.key)"
          :title="d.note"
          :disabled="!canEdit"
          @click="giveToggle(d.key)"
        >
          {{ d.name }}
        </button>
      </div>
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

@media (pointer: coarse) {
  .fx-fold,
  .cond {
    min-height: 44px;
  }
}
</style>
