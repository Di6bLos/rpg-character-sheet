// The Nimble turn tracker for the hero in the current sheet editor: actions left, the
// action pips, the Rushed note and the turn steps (New encounter, Roll Initiative,
// Start / End turn, New round, End encounter). Shared by the sheet's Turn panel and
// the battle board's turn bar; the rules are in utils/nimblePlay.ts.
import type { NimbleSheet } from '~/types/sheets'
import {
  actionPips,
  actionsLeft,
  beginEncounter,
  endEncounter,
  endTurn,
  gainAction,
  initiativeRoll,
  newRound,
  startTurn,
  stopCasting,
  toggleActionPip,
  turnActions,
} from '~/utils/nimblePlay'
import { turnSteps, typesInitiative } from '~/utils/turnSteps'

export function useTurnSteps(
  options: {
    /** Gets New encounter, Initiative and End encounter results (the board posts them). */
    onResult?: (message: string) => void
  } = {},
) {
  const { draft, canEdit, say } = useSheet<NimbleSheet>()
  const sheet = computed(() => draft.value.sheet)

  const perTurn = computed(() => turnActions(sheet.value))
  const left = computed(() => actionsLeft(sheet.value))
  const pips = computed(() => actionPips(sheet.value))
  const steps = computed(() => turnSteps(sheet.value))
  const typed = computed(() => typesInitiative(sheet.value))
  const rushedNote = computed(() =>
    sheet.value.rushed
      ? `Next attack: ${sheet.value.rushed}× disadvantage (Rushed)`
      : 'No attacks yet this turn',
  )

  function report(message: string) {
    say(message)
    options.onResult?.(message)
  }

  function toggleAction(n: number) {
    if (canEdit.value) toggleActionPip(sheet.value, n)
  }

  function extraAction() {
    if (canEdit.value) say(gainAction(sheet.value))
  }

  function cancelCasting() {
    if (canEdit.value) say(stopCasting(sheet.value))
  }

  function beginTurn() {
    if (canEdit.value) say(startTurn(sheet.value, draft.value.level))
  }

  function finishTurn() {
    if (canEdit.value) say(endTurn(sheet.value, draft.value.level))
  }

  function nextRound() {
    if (canEdit.value) say(newRound(sheet.value, draft.value.level))
  }

  function startEncounter() {
    if (canEdit.value) report(beginEncounter(sheet.value))
  }

  function finishEncounter() {
    if (canEdit.value) report(endEncounter(sheet.value, draft.value.level))
  }

  const sendInitiative = useSendInitiative()

  /** Rolls Initiative, or takes the typed total (`values[0]`) when rolling your own dice. */
  async function initiative(values?: number[]) {
    if (!canEdit.value) return
    const { message, total } = initiativeRoll(
      sheet.value,
      draft.value.level,
      Math.random,
      values?.[0],
    )
    report(message)
    const sent = await sendInitiative(total)
    if (sent) say(`${message}${sent}`)
  }

  return {
    sheet,
    perTurn,
    left,
    pips,
    steps,
    typed,
    rushedNote,
    toggleAction,
    extraAction,
    cancelCasting,
    beginTurn,
    finishTurn,
    nextRound,
    startEncounter,
    finishEncounter,
    initiative,
  }
}
