import type { Ref } from 'vue'
import type { SheetEditor } from '~/composables/useSheetEditor'
import type { NimbleSheet } from '~/types/sheets'
import { endTurn, newRound, startTurn } from '~/utils/nimblePlay'
import { slaySummon } from '~/utils/nimbleSummons'

/**
 * The turn steps the GM's initiative tracker drives on a seated hero's sheet editor:
 * End turn / Start turn / New round as the tracker moves, and a one-time line-up with a
 * tracker already mid-turn. The board runs it through useBoardTurnSteps; the full sheet
 * runs it on its own editor with the tracker read by useCampaignEncounter. Call once
 * per editor.
 */
export function useTrackerTurnSteps(
  editor: SheetEditor,
  props: {
    characterId: string
    turnCharacterId: Ref<string | null>
    round: Ref<number | null>
  },
): void {
  watch(
    () => [props.turnCharacterId.value, props.round.value] as const,
    ([now, round], [before, prevRound]) => {
      if (!editor.canEdit.value) return
      const sheet = editor.draft.value.sheet as NimbleSheet
      const level = editor.draft.value.level
      const mine = props.characterId
      const wrapped = round !== null && prevRound !== null && round > prevRound
      const again = wrapped && now === before && now === mine
      if ((before === mine && now !== mine) || again)
        if (sheet.turnActive) editor.say(endTurn(sheet, level))
      if (wrapped && sheet.inEncounter) editor.say(newRound(sheet, level))
      // Roll Initiative first: it sets the starting actions, which Start turn then uses.
      if (now === mine && (now !== before || again) && !sheet.turnActive) {
        if (sheet.awaitingInitiative) editor.say('Your turn: roll Initiative, then Start turn.')
        else editor.say(startTurn(sheet, level))
      }
    },
  )

  // The tracker may already be on a turn when this sheet loads: line the sheet
  // up with it once, skipping "no encounter" (null) and turns already taken this round.
  let synced = false
  watch(
    props.turnCharacterId,
    (now) => {
      if (synced || now === null || !editor.canEdit.value) return
      synced = true
      const sheet = editor.draft.value.sheet as NimbleSheet
      const level = editor.draft.value.level
      const mine = props.characterId
      if (
        now === mine &&
        sheet.inEncounter &&
        !sheet.turnActive &&
        !sheet.turnDone &&
        !sheet.awaitingInitiative
      )
        editor.say(startTurn(sheet, level))
      else if (now !== mine && sheet.turnActive) editor.say(endTurn(sheet, level))
    },
    { immediate: true },
  )
}

/**
 * The board's automatic turn steps for the player's seated hero, run on the board's
 * own sheet editor (the battle board's hero scope): the
 * tracker's turn steps (useTrackerTurnSteps), and marking summons the GM dropped to
 * 0 HP slain (posted to party chat). Call once per editor.
 */
export function useBoardTurnSteps(
  editor: SheetEditor,
  props: {
    characterId: string
    turnCharacterId: Ref<string | null>
    round: Ref<number | null>
    downSummons: Ref<string[]>
  },
): void {
  const chat = useBoardChat()
  useTrackerTurnSteps(editor, props)

  watch(
    props.downSummons,
    (keys) => {
      if (!editor.canEdit.value) return
      const sheet = editor.draft.value.sheet as NimbleSheet
      const prefix = `${props.characterId}:`
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
}
