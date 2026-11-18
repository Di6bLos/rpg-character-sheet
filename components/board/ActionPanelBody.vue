<script setup lang="ts">
// Gives the quick-action panel its own sheet editor (autosaving working copy),
// and refreshes the roster once a save lands so the party sees the change.
import type { Character } from '~/types'
import type { AnySheet, NimbleSheet } from '~/types/sheets'
import { endTurn, newRound, startTurn } from '~/utils/nimblePlay'
import { slaySummon } from '~/utils/nimbleSummons'

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

const { reloadRoster, campaignId } = useCampaignBoard()
const editor = provideSheetEditor(props.character, {
  canEdit: props.canEdit,
  campaignName: props.campaignName,
  campaignId: campaignId.value,
})
watch(
  () => props.canEdit,
  (on) => (editor.canEdit.value = on),
)

const chat = useBoardChat()

watch(
  () => [props.turnCharacterId, props.round] as const,
  ([now, round], [before, prevRound]) => {
    if (!editor.canEdit.value) return
    const sheet = editor.draft.value.sheet as NimbleSheet
    const level = editor.draft.value.level
    const mine = props.character.id
    const wrapped = round !== null && prevRound !== null && round > prevRound
    const again = wrapped && now === before && now === mine
    if ((before === mine && now !== mine) || again)
      if (sheet.turnActive) editor.say(endTurn(sheet, level))
    if (wrapped && sheet.inEncounter) editor.say(newRound(sheet, level))
    if (now === mine && (now !== before || again) && !sheet.turnActive)
      editor.say(startTurn(sheet, level))
  },
)

watch(
  () => props.downSummons,
  (keys) => {
    if (!editor.canEdit.value) return
    const sheet = editor.draft.value.sheet as NimbleSheet
    const prefix = `${props.character.id}:`
    for (const key of keys) {
      if (!key.startsWith(prefix)) continue
      const summon = sheet.summons?.find((s) => s.id === key.slice(prefix.length))
      if (!summon) continue
      const message = slaySummon(sheet, editor.draft.value.level, summon.id)
      editor.say(message)
      void chat.send(`${editor.draft.value.name} · ${message}`, 'party', 'action')
    }
  },
  { immediate: true },
)
watch(editor.saving, (now, before) => {
  if (before && !now && !editor.dirty.value) reloadRoster().catch(() => undefined)
})
</script>

<template>
  <BoardActionPanelMenus :drawer="drawer" @dismiss="emit('dismiss')" />
</template>
