// The PF2e turn tracker for the hero in the current sheet editor, as the shared Turn panel's
// model (Player Core pp. 434–437): Roll initiative starts the encounter (or a typed total with
// Manual dice) and goes to the GM's tracker; Start turn gives 3 actions plus quickened, less
// what stunned and slowed take, and the reaction; End turn; End encounter. Seated in the GM's
// encounter the tracker starts and ends the turn (usePf2eTrackerTurnSteps). Rules in
// utils/pf2eActions.ts; results show in the panel (`turn:`).
import type { Pf2eSheet } from '~/types/sheets'
import { rollCheck, showOutcome, sign } from '~/utils/dice'
import {
  endPf2eEncounter,
  endPf2eTurn,
  gainPf2eAction,
  inEncounter,
  newTurn,
  pf2eTurnView,
  startPf2eTurn,
  togglePf2eAction,
} from '~/utils/pf2eActions'
import { initiativeCheck } from '~/utils/pf2ePlay'
import { type TurnModel, pf2eTurnSteps, pf2eTypesInitiative } from '~/utils/turnSteps'

const PF2E_TURN_HELP =
  'At the start of your turn you get 3 actions and your reaction (Player Core p. 436): quickened adds one, stunned and slowed take some away (struck out). Strikes, spells and abilities spend them for you; tap a circle to spend or restore one, and ↺ for your reaction. Roll initiative to start an encounter (or type your total if you roll your own dice); in a campaign it goes to the GM’s tracker. Each attack after the first in a turn takes the multiple attack penalty: −5, then −10 (agile −4, −8; p. 402). In the GM’s encounter, Start and End turn happen by themselves as initiative reaches and leaves you.'

export function usePf2eTurnSteps() {
  const { draft, canEdit, say, gmEncounter, trackerTurnId, trackerRound } = useSheet<Pf2eSheet>()
  const { claim, resultIn } = useResultOwner()
  const auth = useAuthStore()
  const sheet = computed(() => draft.value.sheet)
  const turn = computed(() => sheet.value.turn)
  const active = computed(() => !!turn.value?.active)
  const ownDice = computed(() => auth.profile?.own_dice ?? false)

  const state = computed(() => {
    const t = turn.value
    const round = trackerRound.value
    return {
      // Seated in the GM's encounter counts before the hero rolls (Nimble joins it then too).
      inEncounter: inEncounter(sheet.value) || gmEncounter.value,
      active: active.value,
      rolled: t?.initiative !== undefined,
      ownDice: ownDice.value,
      gmEncounter: gmEncounter.value,
      myTurn: trackerTurnId.value === draft.value.id,
      turnDone: round !== null && t?.trackerRound === round && !t?.active,
    }
  })
  const steps = computed(() => pf2eTurnSteps(state.value))
  const typed = computed(() => pf2eTypesInitiative(state.value))
  const view = computed(() => pf2eTurnView(sheet.value))

  function toggleAction(n: number) {
    if (canEdit.value) togglePf2eAction(sheet.value, n)
  }

  function extraAction() {
    if (canEdit.value) claim('turn:extra', () => say(gainPf2eAction(sheet.value)))
  }

  function toggleReaction() {
    if (!canEdit.value) return
    const t = (sheet.value.turn ??= newTurn())
    t.reaction = !t.reaction
  }

  function beginTurn() {
    if (!canEdit.value || !steps.value.includes('start')) return
    claim('turn:step', () => {
      const line = startPf2eTurn(sheet.value)
      const round = trackerRound.value
      if (gmEncounter.value && round !== null && sheet.value.turn)
        sheet.value.turn.trackerRound = round
      say(line)
    })
  }

  function finishTurn() {
    if (canEdit.value) claim('turn:step', () => say(endPf2eTurn(sheet.value)))
  }

  function finishEncounter() {
    if (canEdit.value) claim('turn:end', () => say(endPf2eEncounter(sheet.value)))
  }

  const sendInitiative = useSendInitiative()
  /** A total the tracker didn't get (the write failed): offered again, never rerolled. */
  const unsent = ref<number | null>(null)

  async function send(total: number, line: string) {
    const { note, failed } = await sendInitiative(total)
    unsent.value = failed ? total : null
    if (note) claim('turn:init', () => say(`${line}${note}`))
  }

  /**
   * Initiative (p. 436): Perception with its initiative bonuses, rolled once an encounter and
   * kept on the sheet, or the total typed with Manual dice (`values[0]`).
   */
  async function initiative(values?: number[]) {
    if (!canEdit.value || state.value.rolled) return
    const check = initiativeCheck(sheet.value)
    const typedTotal = values?.[0]
    let line: string
    let total: number
    if (typedTotal !== undefined) {
      total = typedTotal
      line = `Initiative: ${total} (rolled at the table).`
    } else {
      const r = rollCheck(check.value)
      total = r.total
      const nat = r.natural ? `, natural ${r.natural}` : ''
      const note = check.note ? ` (${check.note})` : ''
      line = `Initiative: ${r.total} (${r.d20} ${sign(check.value)}${nat})${note}`
      showOutcome({ label: 'Initiative', total: r.total, detail: line })
    }
    const t = (sheet.value.turn ??= newTurn())
    t.initiative = total
    claim('turn:init', () => say(line))
    await send(total, line)
  }

  async function resendInitiative() {
    const total = unsent.value
    if (!canEdit.value || total === null) return
    await send(total, `Initiative ${total}.`)
  }

  const model = computed<TurnModel>(() => ({
    help: PF2E_TURN_HELP,
    active: active.value,
    inEncounter: state.value.inEncounter,
    initiative: turn.value?.initiative ?? null,
    pips: view.value.pips,
    pipsLocked: !active.value,
    reaction: { ready: turn.value?.reaction !== false },
    leftText: view.value.leftText,
    note: view.value.note,
    steps: steps.value,
    typed: typed.value,
    unsent: unsent.value,
    extraTitle:
      'Quickened during your turn, or an extra action the GM gives you; it goes when your turn ends',
    endEncounterTitle: 'The battle is over: Rage and the encounter’s effects end',
    result: resultIn('turn:'),
    toggleAction,
    extraAction,
    toggleReaction,
    startEncounter: () => initiative(),
    rollInitiative: initiative,
    resendInitiative,
    beginTurn,
    finishTurn,
    nextRound: () => {},
    finishEncounter,
  }))

  return { model, steps, typed, beginTurn, finishTurn, finishEncounter, initiative }
}
