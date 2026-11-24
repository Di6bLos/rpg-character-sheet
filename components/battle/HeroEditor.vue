<script setup lang="ts">
// The battle board's sheet editor for the player's hero (see HeroScope): creates it, runs
// the board's automatic turn steps and hands it to HeroScope (BOARD_HERO), which gives it
// to the board. It renders nothing: it sits beside the board, so the board stays mounted
// when the hero loads or changes.
import type { Character } from '~/types'
import type { AnySheet } from '~/types/sheets'

const props = defineProps<{
  character: Character<AnySheet>
  canEdit: boolean
  campaignName: string
  turnCharacterId: string | null
  round: number | null
  downSummons: string[]
}>()

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

const host = inject(BOARD_HERO, null)
if (host) {
  host.value = editor
  onBeforeUnmount(() => {
    if (host.value === editor) host.value = null
  })
}
</script>

<!-- eslint-disable-next-line vue/valid-template-root -->
<template></template>
