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
import { type TurnModel, turnSteps, typesInitiative } from '~/utils/turnSteps'

const NIMBLE_TURN_HELP =
  'Attacks, spells and reactions spend actions for you; tap a circle to spend or restore one. Your actions come back at the END of your turn, so reactions you take on others’ turns come out of your next one. Start turn refills once-per-turn abilities and pays spells still being cast; New encounter refills once-per-encounter abilities; then Roll Initiative (or type your total if you roll your own dice): 9 or less starts you with 1 action, 10–19 with 2, 20+ with all. On the board, Start and End turn happen by themselves as initiative reaches and leaves you.'

export function useTurnSteps(
  options: {
    /** Gets New encounter, Initiative and End encounter results (the board posts them). */
    onResult?: (message: string) => void
  } = {},
) {
  const { draft, canEdit, say, gmEncounter, trackerTurnId } = useSheet<NimbleSheet>()
  const sheet = computed(() => draft.value.sheet)

  const perTurn = computed(() => turnActions(sheet.value))
  const left = computed(() => actionsLeft(sheet.value))
  /** "2 of 3 left", "4 left (1 extra)", with "(Dying)" while dying: the turn bar and Hero tab. */
  const leftText = computed(
    () =>
      `${left.value > perTurn.value ? `${left.value} left (${left.value - perTurn.value} extra)` : `${left.value} of ${perTurn.value} left`}${sheet.value.dying ? ' (Dying)' : ''}`,
  )
  const pips = computed(() => actionPips(sheet.value))
  /** Seated in the GM's encounter: the tracker is on this hero. */
  const myTurn = computed(() => trackerTurnId.value === draft.value.id)
  // Seated in the GM's encounter, the tracker runs the encounter and the rounds.
  const steps = computed(() =>
    turnSteps({
      inEncounter: sheet.value.inEncounter,
      turnActive: sheet.value.turnActive,
      turnDone: sheet.value.turnDone,
      ownDice: sheet.value.ownDice,
      awaitingInitiative: sheet.value.awaitingInitiative,
      gmEncounter: gmEncounter.value,
      myTurn: myTurn.value,
    }),
  )
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
    if (!canEdit.value || !steps.value.includes('start')) return
    say(startTurn(sheet.value, draft.value.level))
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
  /** A total the tracker didn't get (the write failed): offered again, never rerolled. */
  const unsent = ref<number | null>(null)

  async function send(total: number, message: string) {
    const { note, failed } = await sendInitiative(total)
    unsent.value = failed ? total : null
    if (note) say(`${message}${note}`)
  }

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
    await send(total, message)
  }

  /** Sends the total that failed to reach the tracker again. */
  async function resendInitiative() {
    const total = unsent.value
    if (!canEdit.value || total === null) return
    await send(total, `Initiative ${total}.`)
  }

  /** The shared Turn panel's model (components/sheet/TurnPanel.vue). */
  const model = computed<TurnModel>(() => ({
    help: NIMBLE_TURN_HELP,
    active: sheet.value.turnActive,
    inEncounter: sheet.value.inEncounter,
    initiative: sheet.value.initiative ?? null,
    pips: Array.from({ length: pips.value }, (_, i) => ({
      n: i + 1,
      on: i + 1 <= left.value,
      extra: i + 1 > perTurn.value,
    })),
    leftText: leftText.value,
    note: rushedNote.value,
    casting: sheet.value.casting,
    steps: steps.value,
    typed: typed.value,
    unsent: unsent.value,
    extraTitle:
      'An ally or ability gave you an extra action (Stim Pack, Chorus of Champions…); it lasts until your turn ends',
    endEncounterTitle: 'The battle is over: Rage, unused combat charges and minions end',
    toggleAction,
    extraAction,
    cancelCasting,
    startEncounter,
    rollInitiative: initiative,
    resendInitiative,
    beginTurn,
    finishTurn,
    nextRound,
    finishEncounter,
  }))

  return {
    model,
    sheet,
    gmEncounter,
    perTurn,
    left,
    leftText,
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
    unsent,
    resendInitiative,
  }
}
