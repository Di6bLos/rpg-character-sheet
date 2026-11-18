<script setup lang="ts">
// Chips for conditions whose attack disadvantage depends on the target
// (Taunted, Frightened): on means the next attacks take the extra die.
import type { NimbleSheet } from '~/types/sheets'
import { SITUATIONAL } from '~/utils/nimbleConditions'

const { draft, canEdit } = useSheet<NimbleSheet>()
const situation = useAttackSituation()

const present = computed(() =>
  SITUATIONAL.filter((s) => draft.value.sheet.conditions.includes(s.name)),
)

function toggle(name: string) {
  situation.value = situation.value.includes(name)
    ? situation.value.filter((n) => n !== name)
    : [...situation.value, name]
}
</script>

<template>
  <div v-if="present.length" class="situation">
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
</style>
