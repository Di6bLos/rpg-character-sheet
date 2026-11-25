<script setup lang="ts">
// "End the encounter?": the confirm behind the GM's End encounter button (the desktop
// top bar's, and the phone bar's ⋯ menu). Ending drops every combatant from initiative
// and puts the round back to 1.
import type { useInitiative } from '~/composables/useInitiative'

const props = defineProps<{ init: ReturnType<typeof useInitiative> }>()
const open = defineModel<boolean>({ required: true })

const ending = ref(false)

async function endEncounter() {
  ending.value = true
  try {
    // On failure endEncounter shows its error; the confirm stays open to try again.
    if (await props.init.endEncounter()) open.value = false
  } finally {
    ending.value = false
  }
}
</script>

<template>
  <UiDialog v-model="open" title="End the encounter?" width="420px" alert>
    <div class="stack">
      <p>Every combatant leaves initiative and the round goes back to 1.</p>
      <div class="row" style="justify-content: flex-end">
        <button type="button" class="btn btn--ghost" @click="open = false">Cancel</button>
        <button type="button" class="btn btn--danger" :disabled="ending" @click="endEncounter">
          End encounter
        </button>
      </div>
    </div>
  </UiDialog>
</template>
