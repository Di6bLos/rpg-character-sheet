<script setup lang="ts">
import type { NimbleSheet } from '~/types/sheets'
import { abilityTrigger } from '~/utils/nimblePlay'

const props = defineProps<{ name: string; text: string }>()

const { draft, canEdit, say } = useSheet<NimbleSheet>()
const trigger = computed(() => abilityTrigger(draft.value.sheet, draft.value.level, props.text))

function fire() {
  if (canEdit.value && trigger.value) say(`${props.name}: ${trigger.value.fire()}`)
}
</script>

<template>
  <button
    v-if="trigger"
    type="button"
    class="btn btn--ghost btn--sm btn--wrap trigger"
    :disabled="!canEdit"
    :title="`Apply ${name} when it triggers`"
    @click="fire"
  >
    {{ trigger.label }}
  </button>
</template>

<style scoped lang="scss">
.trigger {
  align-self: flex-start;
}
</style>
