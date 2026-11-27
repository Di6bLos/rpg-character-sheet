// The 5e (2024) turn tracker for the hero in the current sheet editor, as the shared Turn
// panel's model (SRD 5.2.1 pp. 9–13): New encounter → Roll Initiative (a Dexterity check, or
// the typed total with Manual dice, sent to the GM's tracker) → Start turn → End turn → New
// round → … with End encounter between turns. The circles are the action (more with Action
// Surge or Haste), the Reaction, the Bonus Action and the free object interaction, with the
// movement used. Seated in the GM's encounter the tracker starts and ends the turn
// (useDnd5eTrackerTurnSteps). Rules in utils/dnd5ePlay.ts; results show in the panel (`turn:`).
import type { Dnd5eSheet } from '~/types/sheets'
import { showOutcome } from '~/utils/dice'
import {
  attacksPerAction,
  beginEncounter,
  endEncounter,
  endTurn,
  initiativeTest,
  isDying,
  newRound,
  newTurn,
  rollTest,
  setInitiative,
  speedNow,
  onInitiative,
  startTurn,
} from '~/utils/dnd5ePlay'
import { hasEffect } from '~/utils/dnd5eEffects'
import { type TurnModel, turnSteps, typesInitiative } from '~/utils/turnSteps'

const DND5E_TURN_HELP =
  'On your turn you have an action, a Bonus Action, your movement and one free object interaction; your Reaction is one a round and comes back at the start of your turn (SRD 5.2.1 p. 13). Attacks, spells and abilities spend them for you; tap a circle to spend or restore one. The Attack action makes all your Extra Attacks; Action Surge or Haste adds an action (+1). Roll Initiative (or type your total if you roll your own dice); in a campaign it goes to the GM’s tracker, and Start and End turn happen by themselves as initiative reaches and leaves you.'

export function useDnd5eTurnSteps(options: { onResult?: (message: string) => void } = {}) {
  const { draft, canEdit, say, gmEncounter, trackerTurnId } = useSheet<Dnd5eSheet>()
  const { claim, resultIn } = useResultOwner()
  const sheet = computed(() => draft.value.sheet)
  const level = computed(() => draft.value.level)
  const turn = computed(() => sheet.value.turn ?? newTurn())
  const active = computed(() => !!sheet.value.turn?.active)

  const state = computed(() => ({
    inEncounter: !!sheet.value.inEncounter,
    turnActive: active.value,
    turnDone: !!sheet.value.turnDone,
    ownDice: !!sheet.value.ownDice,
    awaitingInitiative: !!sheet.value.awaitingInitiative,
    gmEncounter: gmEncounter.value,
    myTurn: trackerTurnId.value === draft.value.id,
  }))
  const steps = computed(() => turnSteps(state.value))
  const typed = computed(() => typesInitiative(state.value))

  function report(key: string, line: string) {
    claim(key, () => say(line))
    options.onResult?.(line)
  }

  const t = () => (sheet.value.turn ??= newTurn())

  function toggleAction(n: number) {
    if (!canEdit.value) return
    const x = t()
    x.actions = x.actions >= n ? n - 1 : n
  }

  function extraAction() {
    if (!canEdit.value) return
    const x = t()
    x.actions += 1
    x.actionsMax += 1
    report('turn:extra', 'One more action this turn.')
  }

  function toggleReaction() {
    if (canEdit.value) t().reaction = !t().reaction
  }

  function toggleEconomy(key: string) {
    if (!canEdit.value) return
    const x = t()
    if (key === 'bonus') x.bonus = !x.bonus
    else if (key === 'object') x.object = !x.object
  }

  const movementMax = computed(() => {
    const speed = speedNow(sheet.value, level.value).value
    return hasEffect(sheet.value, 'dash') ? speed * 2 : speed
  })

  function move(by: number) {
    if (!canEdit.value) return
    const x = t()
    x.moved = Math.max(0, Math.min(movementMax.value, x.moved + by))
  }

  function beginTurn() {
    if (canEdit.value && steps.value.includes('start'))
      report('turn:step', startTurn(sheet.value, level.value))
  }

  function finishTurn() {
    if (canEdit.value) report('turn:step', endTurn(sheet.value))
  }

  function nextRound() {
    if (canEdit.value) report('turn:step', newRound(sheet.value))
  }

  function startEncounter() {
    if (canEdit.value) report('turn:step', beginEncounter(sheet.value))
  }

  function finishEncounter() {
    if (canEdit.value) report('turn:end', endEncounter(sheet.value))
  }

  const sendInitiative = useSendInitiative()
  /** A total the tracker didn't get (the write failed): offered again, never rerolled. */
  const unsent = ref<number | null>(null)

  async function send(total: number, line: string) {
    const { note, failed } = await sendInitiative(total)
    unsent.value = failed ? total : null
    if (note) report('turn:init', `${line}${note}`)
  }

  /**
   * Initiative (SRD 5.2.1 p. 13): a Dexterity check with the sheet's Initiative (Alert),
   * Advantage from Invisible or Feral Instinct, Disadvantage while Incapacitated; or the
   * total the player typed (`values[0]`).
   */
  async function initiative(values?: number[]) {
    if (!canEdit.value) return
    if (!sheet.value.inEncounter) beginEncounter(sheet.value)
    let total: number
    let line: string
    const typedTotal = values?.[0]
    if (typedTotal !== undefined) {
      total = typedTotal
      line = `Initiative: ${total} (rolled at the table).`
    } else {
      const r = rollTest(sheet.value, initiativeTest(sheet.value, level.value))
      total = r.total
      line = r.line
      showOutcome({ label: 'Initiative', total, detail: line })
    }
    setInitiative(sheet.value, total)
    const extras = onInitiative(sheet.value, level.value)
    if (extras.length) line = `${line} ${extras.join('. ')}.`
    report('turn:init', line)
    await send(total, line)
  }

  async function resendInitiative() {
    const total = unsent.value
    if (!canEdit.value || total === null) return
    await send(total, `Initiative ${total}.`)
  }

  const note = computed(() => {
    const x = turn.value
    const s = sheet.value
    const bits: string[] = []
    const per = attacksPerAction(s, level.value)
    if (x.active && x.attacks > 0)
      bits.push(`Attack action: ${x.attacks} more attack${x.attacks === 1 ? '' : 's'}`)
    else if (per > 1) bits.push(`The Attack action makes ${per} attacks`)
    if (s.concentration) bits.push(`Concentrating on ${s.concentration.name}`)
    if (isDying(s)) bits.push('Dying: roll a death save at the start of your turn')
    return bits.join(' · ') || (x.active ? 'Your action, Bonus Action and movement are ready' : '')
  })

  const model = computed<TurnModel>(() => {
    const x = turn.value
    const max = Math.max(1, x.actionsMax)
    return {
      help: DND5E_TURN_HELP,
      active: active.value,
      inEncounter: !!sheet.value.inEncounter,
      initiative: x.initiative ?? null,
      pips: Array.from({ length: max }, (_, i) => ({ n: i + 1, on: i < x.actions, extra: i >= 1 })),
      pipsLocked: !active.value,
      reaction: { ready: x.reaction },
      economy: [
        {
          key: 'bonus',
          glyph: 'B',
          label: 'Bonus Action',
          short: 'Bonus',
          ready: x.bonus,
          title: 'Your Bonus Action this turn',
        },
        {
          key: 'object',
          glyph: '✋',
          label: 'object interaction',
          short: 'Object',
          ready: x.object,
          title: 'One free object interaction this turn (draw a weapon, open a door)',
        },
      ],
      movement: { used: x.moved, max: movementMax.value },
      leftText: `${x.actions} of ${max} action${max === 1 ? '' : 's'} left${isDying(sheet.value) ? ' (Dying)' : ''}`,
      note: note.value,
      steps: steps.value,
      typed: typed.value,
      unsent: unsent.value,
      extraTitle: 'Action Surge, Haste or the GM’s call: one more action this turn',
      endEncounterTitle: 'The fight is over: Rage, Dodge and the encounter’s effects end',
      result: resultIn('turn:'),
      toggleAction,
      extraAction,
      toggleReaction,
      toggleEconomy,
      move,
      startEncounter,
      rollInitiative: initiative,
      resendInitiative,
      beginTurn,
      finishTurn,
      nextRound,
      finishEncounter,
    }
  })

  return { model, steps, initiative, beginTurn, finishTurn }
}
