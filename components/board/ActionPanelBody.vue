<script setup lang="ts">
// Gives the quick-action panel its own sheet editor (autosaving working copy),
// and refreshes the roster once a save lands so the party sees the change.
import type { Character } from '~/types'
import type { AnySheet } from '~/types/sheets'

const props = defineProps<{
  character: Character<AnySheet>
  canEdit: boolean
  campaignName: string
  drawer: boolean
}>()
const emit = defineEmits<{ dismiss: [] }>()

const editor = provideSheetEditor(props.character, {
  canEdit: props.canEdit,
  campaignName: props.campaignName,
})
watch(
  () => props.canEdit,
  (on) => (editor.canEdit.value = on),
)

const { reloadRoster } = useCampaignBoard()
watch(editor.saving, (now, before) => {
  if (before && !now && !editor.dirty.value) reloadRoster().catch(() => undefined)
})
</script>

<template>
  <BoardActionPanelMenus :drawer="drawer" @dismiss="emit('dismiss')" />
</template>
