<script setup lang="ts">
// Gives the quick-action panel its own sheet editor (autosaving working copy,
// roster refresh on save) and the board's automatic turn steps.
import type { Character } from '~/types'
import type { AnySheet } from '~/types/sheets'

const props = defineProps<{
  character: Character<AnySheet>
  canEdit: boolean
  campaignName: string
  drawer: boolean
  downSummons: string[]
  turnCharacterId: string | null
  round: number | null
}>()
const emit = defineEmits<{ dismiss: [] }>()

const editor = provideBoardSheetEditor(props.character, {
  canEdit: toRef(props, 'canEdit'),
  campaignName: props.campaignName,
})
useBoardTurnSteps(editor, {
  characterId: props.character.id,
  turnCharacterId: toRef(props, 'turnCharacterId'),
  round: toRef(props, 'round'),
  downSummons: toRef(props, 'downSummons'),
})
</script>

<template>
  <BoardActionPanelMenus :drawer="drawer" @dismiss="emit('dismiss')" />
</template>
