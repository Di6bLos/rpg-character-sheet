import type { Ref } from 'vue'
import type { SheetEditor } from '~/composables/useSheetEditor'
import type { NimbleSheet, Pf2eSheet } from '~/types/sheets'
import { endTurn, newRound, startTurn } from '~/utils/nimblePlay'
import { slaySummon } from '~/utils/nimbleSummons'
import { endPf2eTurn, startPf2eTurn } from '~/utils/pf2eActions'
import { trackerTurnStep } from '~/utils/turnSteps'

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
 * The tracker's turn steps on a seated PF2e hero's sheet editor (Player Core p. 436): Start
 * turn when initiative reaches the hero, End turn when it moves past (or comes back to them
 * alone in a new round), and a one-time line-up with a tracker already running
 * (`trackerTurnStep`). A turn the tracker started records its round (`turn.trackerRound`),
 * so a reload mid-round doesn't start it again. New round needs nothing more in PF2e: the
 * reaction comes back with the hero's own turn. End encounter is the sheet editor's
 * (leaving the tracker). The full sheet (Shell) and the board (HeroEditor) run it.
 */
export function usePf2eTrackerTurnSteps(
  editor: SheetEditor,
  props: {
    characterId: string
    turnCharacterId: Ref<string | null>
    round: Ref<number | null>
  },
): void {
  let synced = false
  function step(now: string | null, before: string | null, prevRound: number | null) {
    if (!editor.canEdit.value) return
    const sheet = editor.draft.value.sheet as Pf2eSheet
    const round = props.round.value
    const { end, start } = trackerTurnStep({
      mine: props.characterId,
      now,
      before,
      round,
      prevRound,
      active: !!sheet.turn?.active,
      startedRound: sheet.turn?.trackerRound,
      synced,
    })
    if (now !== null) synced = true
    if (end) editor.say(endPf2eTurn(sheet))
    if (!start) return
    const line = startPf2eTurn(sheet)
    if (round !== null && sheet.turn) sheet.turn.trackerRound = round
    editor.say(line)
  }
  watch(
    () => [props.turnCharacterId.value, props.round.value] as const,
    ([now], [before, prevRound]) => step(now, before, prevRound),
  )
  step(props.turnCharacterId.value, null, null)
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
