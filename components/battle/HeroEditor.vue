<script setup lang="ts">
// The battle board's sheet editor for the player's hero (see HeroScope): provides
// it (and the board's last action result) to everything in the slot, runs the board's
// automatic turn steps and, through HeroLive, applies changes sent to the hero.
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
provideBattleResult()
</script>

<template>
  <BattleHeroLive>
    <slot />
  </BattleHeroLive>
</template>
