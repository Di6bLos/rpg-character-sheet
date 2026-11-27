<script setup lang="ts">
// The battle board's sheet editor for the player's hero (see HeroScope): creates it, runs
// the board's automatic turn steps and hands it to HeroScope (BOARD_HERO), which gives it
// to the board. It renders nothing: it sits beside the board, so the board stays mounted
// when the hero loads or changes. Nimble runs the board's turn steps (useBoardTurnSteps); a 5e
// or PF2e hero's turn follows the tracker as on the full sheet (useDnd5eTrackerTurnSteps,
// usePf2eTrackerTurnSteps). A 5e hero also gets the 5e sheet state (BattleDnd5eApis).
// `basic` (PF2e): the editor is only there for the GM's HP and condition changes.
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
const tracker = {
  characterId: props.character.id,
  turnCharacterId: toRef(props, 'turnCharacterId'),
  round: toRef(props, 'round'),
}
const system = props.character.system
if (system === 'nimble' && !props.basic)
  useBoardTurnSteps(editor, { ...tracker, downSummons: toRef(props, 'downSummons') })
else if (system === 'pf2e') usePf2eTrackerTurnSteps(editor, tracker)
else if (system === 'dnd5e') useDnd5eTrackerTurnSteps(editor, tracker)

const host = inject(BOARD_HERO, null)
if (host) {
  host.value = editor
  onBeforeUnmount(() => {
    if (host.value === editor) host.value = null
  })
}
</script>

<template>
  <BattleDnd5eApis v-if="system === 'dnd5e' && !basic" />
</template>
