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

const editor = provideSheetEditor(props.character, {
  canEdit: props.canEdit,
  campaignName: props.campaignName,
})
watch(
  () => props.canEdit,
  (on) => (editor.canEdit.value = on),
)

const { reloadRoster } = useCampaignBoard()
const chat = useBoardChat()

watch(
  () => props.turnCharacterId,
  (now, before) => {
    if (!editor.canEdit.value || now === before) return
    const sheet = editor.draft.value.sheet as NimbleSheet
    const level = editor.draft.value.level
    const mine = props.character.id
    if (before === mine && sheet.turnActive) editor.say(endTurn(sheet, level))
    if (now === mine && !sheet.turnActive) editor.say(startTurn(sheet, level))
  },
)

watch(
  () => props.round,
  (now, before) => {
    if (!editor.canEdit.value || now === null || before === null || now <= before) return
    const sheet = editor.draft.value.sheet as NimbleSheet
    if (sheet.inEncounter) editor.say(newRound(sheet, editor.draft.value.level))
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
