<script setup lang="ts">
// The player's seated hero on the battle board: loads it and gives the whole board (either
// frame) one sheet editor, so the hero column, turn bar and actions share one autosaving
// working copy and the board's automatic turn steps run once. The editor lives in
// HeroEditor, beside the slot, so the board itself stays mounted while the hero loads, changes (Playing as) or the frame switches
// (rotation). `hero` is true while the seated hero's editor is ready; it goes false for
// a moment across a change of hero, so the parts that use the editor start over with
// the new one. False for the GM, a player without a seated hero, or while loading.
// `enabled` is false for systems without the sheet-editor hero column (5e, PF2e): then the
// slot renders with `hero: false`, and the seated player's hero still gets an editor (no
// turn steps or Nimble statuses) only so the GM's HP and condition changes apply and
// autosave while the board is open; HeroBasic reads its live values through BOARD_HERO.
// It is read once at setup; View keys this component by it.
const props = defineProps<{
  enabled: boolean
  turnCharacterId: string | null
  round: number | null
  downSummons: string[]
}>()
defineSlots<{ default: (props: { hero: boolean }) => unknown }>()

const { campaign } = useCampaignBoard()
const { character, canEdit } = useSeatedCharacter(
  'Could not load your character for the battle board',
  { anySystem: !props.enabled },
)

const current = provideBoardHero()
// The last action result, for the action panel and the phone's result bar; a new hero
// starts with none. Nimble only, as before.
if (props.enabled) {
  const result = provideBattleResult()
  watch(current, () => result.set(''))
}

const ready = computed(
  () => !!current.value && !!character.value && current.value.draft.value.id === character.value.id,
)
</script>

<template>
  <BattleHeroEditor
    v-if="character"
    :key="character.id"
    :character="character"
    :can-edit="canEdit"
    :campaign-name="campaign?.name ?? ''"
    :turn-character-id="props.turnCharacterId"
    :round="props.round"
    :down-summons="props.downSummons"
    :basic="!enabled"
  />
  <BattleHeroLive v-if="ready" :key="`live-${character?.id}`" :basic="!enabled" />
  <slot :hero="enabled && ready" />
</template>
