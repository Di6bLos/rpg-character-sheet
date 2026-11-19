<script setup lang="ts">
// The player's seated hero on the battle board: loads it (as the quick-action panel
// does) and wraps the left and centre columns in one sheet editor, so the hero
// column, turn bar and actions share one autosaving working copy and the board's
// automatic turn steps run once. Renders its slot as is (`hero: false`) for the GM,
// a player without a seated hero, or while loading.
const props = defineProps<{
  turnCharacterId: string | null
  round: number | null
  downSummons: string[]
}>()
defineSlots<{ default: (props: { hero: boolean }) => unknown }>()

const { campaign } = useCampaignBoard()
const { character, canEdit } = useSeatedCharacter(
  'Could not load your character for the battle board',
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
  >
    <slot :hero="true" />
  </BattleHeroEditor>
  <slot v-else :hero="false" />
</template>
