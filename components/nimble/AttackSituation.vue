<script setup lang="ts">
// Chips for conditions whose attack disadvantage depends on the target
// (Taunted, Frightened): on means the next attacks take the extra die. Then
// Disadvantage and Advantage steppers for what the GM calls, counted on every attack.
import type { NimbleSheet } from '~/types/sheets'
import { SITUATIONAL } from '~/utils/nimbleConditions'

const { draft, canEdit } = useSheet<NimbleSheet>()
const situation = useAttackSituation()
const odds = useAttackOdds()

const present = computed(() =>
  SITUATIONAL.filter((s) => draft.value.sheet.conditions.includes(s.name)),
)

const STEPPERS = [
  { key: 'disadvantage', label: 'Disadvantage', hint: 'disadvantage' },
  { key: 'advantage', label: 'Advantage', hint: 'advantage' },
] as const

function toggle(name: string) {
  situation.value = situation.value.includes(name)
    ? situation.value.filter((n) => n !== name)
    : [...situation.value, name]
}

function step(key: 'disadvantage' | 'advantage', by: number) {
  odds.value = { ...odds.value, [key]: Math.max(0, Math.min(6, odds.value[key] + by)) }
}
</script>

<template>
  <div class="situation">
    <template v-if="present.length">
      <span class="caps">Conditions</span>
      <button
        v-for="s in present"
        :key="s.name"
        type="button"
        class="chip"
        :class="{ 'chip--on': situation.includes(s.name) }"
        :aria-pressed="situation.includes(s.name)"
        :disabled="!canEdit"
        @click="toggle(s.name)"
      >
        {{ s.name }}: {{ s.when }} · +1 disadvantage
      </button>
    </template>
    <div
      v-for="o in STEPPERS"
      :key="o.key"
      class="odds-step"
      :class="{ 'is-on': odds[o.key] > 0 }"
      role="group"
      :aria-label="`${o.label}: ${odds[o.key]} ${o.hint}`"
    >
      <span>{{ o.label }}</span>
      <button
        type="button"
        class="step step--xs"
        :aria-label="`Less ${o.label.toLowerCase()}`"
        :disabled="!canEdit || odds[o.key] === 0"
        @click="step(o.key, -1)"
      >
        −
      </button>
      <strong aria-live="polite">{{ odds[o.key] }}</strong>
      <button
        type="button"
        class="step step--xs"
        :aria-label="`More ${o.label.toLowerCase()}`"
        :disabled="!canEdit || odds[o.key] >= 6"
        @click="step(o.key, 1)"
      >
        +
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.situation {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;

  .chip--on {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    color: var(--page-text);
  }
}

.odds-step {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 4px 2px 10px;
  border: 1px solid var(--line);
  border-radius: 999px;
  font-size: 13px;

  strong {
    min-width: 1ch;
    text-align: center;
  }

  &.is-on {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, transparent);
  }
}
</style>
