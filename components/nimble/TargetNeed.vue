<script setup lang="ts">
// A checkbox on a spell's card for the target status it needs (Ignite: a Smoldering
// target). It sets the same status as the Target row's chip above the attacks.
import type { SpellDef } from '~/data/nimble/types'
import type { NimbleSheet } from '~/types/sheets'
import { targetNeed } from '~/utils/nimbleSpellRules'

const props = defineProps<{ spell: SpellDef }>()

const { canEdit } = useSheet<NimbleSheet>()
const target = useAttackTarget()
const need = computed(() => targetNeed(props.spell))

function set(on: boolean) {
  if (need.value) target.value = { ...target.value, [need.value.key]: on }
}
</script>

<template>
  <label v-if="need" class="need">
    <input
      type="checkbox"
      :checked="target[need.key]"
      :disabled="!canEdit"
      @change="set(($event.target as HTMLInputElement).checked)"
    />
    <span>Target is {{ need.label }}</span>
  </label>
</template>

<style scoped lang="scss">
.need {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  cursor: pointer;
}
</style>
