<script setup lang="ts">
// The player's seated hero on the battle board: loads it and gives the whole board (either frame) one sheet editor, so the hero column,
// turn bar and actions share one autosaving working copy and the board's automatic turn
// steps run once. The editor lives in HeroEditor, beside the slot, so the board itself
// stays mounted while the hero loads, changes (Playing as) or the frame switches
// (rotation). `hero` is true while the seated hero's editor is ready; it goes false for
// a moment across a change of hero, so the parts that use the editor start over with
// the new one. False for the GM, a player without a seated hero, or while loading.
// `enabled` is false for systems without the sheet-editor hero column (5e, PF2e): then
// only the slot renders, with `hero: false`, and no editor is loaded or provided. It is
// read once at setup; View keys this component by it.
import type { Character } from '~/types'
import type { AnySheet } from '~/types/sheets'

const props = defineProps<{
  enabled: boolean
  turnCharacterId: string | null
  round: number | null
  downSummons: string[]
}>()
defineSlots<{ default: (props: { hero: boolean }) => unknown }>()

const { campaign } = useCampaignBoard()
const { character, canEdit } = props.enabled
  ? useSeatedCharacter('Could not load your character for the battle board')
  : { character: ref<Character<AnySheet> | null>(null), canEdit: computed(() => false) }

const current = props.enabled ? provideBoardHero() : null
// The last action result, for the action panel and the phone's result bar; a new hero
// starts with none.
if (current) {
  const result = provideBattleResult()
  watch(current, () => result.set(''))
}

const ready = computed(
  () =>
    !!current?.value && !!character.value && current.value.draft.value.id === character.value.id,
)
</script>

<template>
  <BattleHeroEditor
    v-if="enabled && character"
    :key="character.id"
    :character="character"
    :can-edit="canEdit"
    :campaign-name="campaign?.name ?? ''"
    :turn-character-id="props.turnCharacterId"
    :round="props.round"
    :down-summons="props.downSummons"
  />
  <BattleHeroLive v-if="enabled && ready" :key="`live-${character?.id}`" />
  <slot :hero="ready" />
</template>
