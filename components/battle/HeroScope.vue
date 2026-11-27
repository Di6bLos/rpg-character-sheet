<script setup lang="ts">
// The player's seated hero on the battle board: loads it and gives the whole board (either
// frame) one sheet editor, so the hero column, turn bar and actions share one autosaving
// working copy and the board's automatic turn steps run once. The editor lives in
// HeroEditor, beside the slot, so the board itself stays mounted while the hero loads,
// changes (Playing as) or the frame switches (rotation). `hero` is true while the seated
// hero's editor is ready; it goes false for a moment across a change of hero, so the parts
// that use the editor start over with the new one. False for the GM, a player without a seated hero, or while loading.
// The slot's `system` is the hero's, so the board picks its Nimble or 5e parts; a 5e hero is
// ready once its 5e sheet state is too (provideBoardDnd5e).
// `enabled` is false for systems without the sheet-editor hero column (PF2e): then the
// slot renders with `hero: false`, and the seated player's hero still gets an editor (no
// turn steps or Nimble statuses) only so the GM's HP and condition changes apply and
// autosave while the board is open; HeroBasic reads its live values through BOARD_HERO.
// It is read once at setup; View keys this component by it.
import type { GameSystem } from '~/types'

const props = defineProps<{
  enabled: boolean
  turnCharacterId: string | null
  round: number | null
  downSummons: string[]
}>()
defineSlots<{
  default: (props: { hero: boolean; system: GameSystem | null }) => unknown
}>()

const { campaign } = useCampaignBoard()
const { character, canEdit } = useSeatedCharacter(
  'Could not load your character for the battle board',
  { anySystem: true },
)
const system = computed(() => character.value?.system ?? null)
/** The hero column, tiles and turn steps: Nimble and 5e heroes, while `enabled`. */
const full = computed(
  () => props.enabled && (system.value === 'nimble' || system.value === 'dnd5e'),
)

const current = provideBoardHero()
const dnd5e = provideBoardDnd5e()
// The last action result, for the action panel and the phone's result bar; a new hero
// starts with none.
if (props.enabled) {
  const result = provideBattleResult()
  watch(current, () => result.set(''))
}

const ready = computed(
  () =>
    !!current.value &&
    !!character.value &&
    current.value.draft.value.id === character.value.id &&
    (system.value !== 'dnd5e' || !full.value || !!dnd5e.value),
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
    :basic="!full"
  />
  <BattleHeroLive v-if="ready" :key="`live-${character?.id}`" :basic="!full" />
  <slot :hero="full && ready" :system="full && ready ? system : null" />
</template>
