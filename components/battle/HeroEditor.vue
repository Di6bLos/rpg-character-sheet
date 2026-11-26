<script setup lang="ts">
// The battle board's sheet editor for the player's hero (see HeroScope): creates it, runs
// the board's automatic turn steps and hands it to HeroScope (BOARD_HERO), which gives it
// to the board, with the live link to the table (`useBattleLiveHero`). It renders nothing: it sits beside the board, so the board stays mounted
// when the hero loads or changes. `basic` (5e, PF2e): the editor only, no turn steps.
import type { Character } from '~/types'
import type { AnySheet } from '~/types/sheets'

const props = defineProps<{
  character: Character<AnySheet>
  canEdit: boolean
  campaignName: string
  turnCharacterId: string | null
  round: number | null
  downSummons: string[]
  basic?: boolean
}>()

const editor = provideBoardSheetEditor(props.character, {
  canEdit: toRef(props, 'canEdit'),
  campaignName: props.campaignName,
})
if (!props.basic) {
  useBoardTurnSteps(editor, {
    characterId: props.character.id,
    turnCharacterId: toRef(props, 'turnCharacterId'),
    round: toRef(props, 'round'),
    downSummons: toRef(props, 'downSummons'),
  })
  // Party cards stay live, and the turn passes once the hero is out of actions.
  useBattleLiveHero(editor, {
    characterId: props.character.id,
    turnCharacterId: toRef(props, 'turnCharacterId'),
    round: toRef(props, 'round'),
  })
}

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
