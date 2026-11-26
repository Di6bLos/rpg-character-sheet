/**
 * Which turn-step buttons the Nimble turn tracker shows, and the board's "whose turn" line.
 * Shared by the sheet's Turn panel (SheetTurn) and the battle board's turn bar, so both
 * offer the same step at the same moment. The steps themselves live in utils/nimblePlay.ts.
 */
import { turnAfter } from './initiative'

export type TurnStep = 'encounter' | 'initiative' | 'endEncounter' | 'start' | 'round' | 'end'

interface TurnState {
  inEncounter: boolean
  turnActive: boolean
  turnDone: boolean
  ownDice: boolean
  awaitingInitiative?: boolean
  /**
   * Seated in the GM's encounter: the tracker runs the encounter and the rounds, so the
   * player only rolls Initiative and starts or ends their turn.
   */
  gmEncounter?: boolean
  /** In the GM's encounter: the tracker is on this hero (false while it is on someone else). */
  myTurn?: boolean
}

/**
 * The step buttons to show, in order: New encounter → Roll Initiative → Start turn →
 * End turn → New round → …, with End encounter beside them between turns. In the GM's
 * encounter: Roll Initiative, then Start turn (on the hero's turn) → End turn.
 */
export function turnSteps(s: TurnState): TurnStep[] {
  if (s.gmEncounter) {
    if (s.turnActive) return ['end']
    if (s.awaitingInitiative) return s.ownDice ? [] : ['initiative']
    // Only on the hero's own turn, and once: after End turn, Start waits for the next round.
    return s.myTurn === false || s.turnDone ? [] : ['start']
  }
  const steps: TurnStep[] = []
  if (!s.inEncounter) steps.push('encounter')
  if (s.awaitingInitiative && !s.ownDice && !s.turnActive) steps.push('initiative')
  if (s.inEncounter && !s.turnActive) steps.push('endEncounter')
  if (!s.turnActive && s.inEncounter && !s.turnDone && !s.awaitingInitiative) steps.push('start')
  else if (s.inEncounter && s.turnDone && !s.turnActive) steps.push('round')
  if (s.turnActive) steps.push('end')
  return steps
}

/**
 * Where the hero sits on the GM's tracker: its combatant id while seated, false when not
 * seated, null while unknown.
 */
export type Seat = string | false | null

/**
 * What the hero's sheet does when the GM seats it in, or takes it out of, their encounter.
 * `gmCombatant` is the seat the sheet last joined (saved with it), so a load can tell the
 * same fight from a new one, and the GM's fight from one the player runs alone:
 * - seated: a new seat (seen live, or a different one than saved) starts a new encounter,
 *   unless it is already waiting for Initiative; found on load in no saved seat, it joins
 *   only when not in an encounter yet;
 * - not seated: ends the encounter when it was the GM's (seen leaving live, or a saved
 *   seat that is gone); a fight with no saved seat is the player's own and stays.
 */
export function seatChange(
  before: Seat | undefined,
  seat: Seat,
  s: Pick<TurnState, 'inEncounter' | 'awaitingInitiative'> & { gmCombatant?: string },
): 'begin' | 'end' | null {
  if (seat === null) return null
  if (seat) {
    // A different seat than the one joined: the GM ended that fight and started another.
    if (s.gmCombatant && s.gmCombatant !== seat) return 'begin'
    if (before === false) return s.awaitingInitiative ? null : 'begin'
    if (before) return null
    return s.gmCombatant === seat || s.inEncounter ? null : 'begin'
  }
  if (!s.inEncounter) return null
  return before || s.gmCombatant ? 'end' : null
}

/**
 * PF2e's step buttons (Player Core pp. 434–437): rolling initiative starts the encounter, so
 * there's no New encounter; actions and the reaction come back at the start of your own turn,
 * so there's no New round. Out of an encounter: Roll initiative; in one, End encounter and
 * Start turn between turns, End turn on it. In the GM's encounter: Roll initiative until it's
 * rolled, then Start turn on the hero's turn (once a round) and End turn. With Manual dice the
 * typed total (`pf2eTypesInitiative`) takes Roll initiative's place.
 */
export function pf2eTurnSteps(s: {
  inEncounter: boolean
  active: boolean
  rolled: boolean
  ownDice: boolean
  gmEncounter?: boolean
  myTurn?: boolean
  turnDone?: boolean
}): TurnStep[] {
  if (s.active) return ['end']
  if (s.gmEncounter) {
    if (!s.rolled) return s.ownDice ? [] : ['initiative']
    return s.myTurn === false || s.turnDone ? [] : ['start']
  }
  if (!s.inEncounter) return s.ownDice ? [] : ['initiative']
  return ['endEncounter', 'start']
}

/** PF2e with Manual dice: the Initiative total is typed while it would be rolled. */
export function pf2eTypesInitiative(s: Parameters<typeof pf2eTurnSteps>[0]): boolean {
  return s.ownDice && !s.active && !s.rolled && (!!s.gmEncounter || !s.inEncounter)
}

/** One action circle of the Turn panel: lost ones (stunned, slowed) show struck out. */
export interface TurnPip {
  n: number
  on: boolean
  extra: boolean
  /** What took it this turn ("Slowed 1"). */
  lost?: string
}

/**
 * What the shared Turn panel (components/sheet/TurnPanel.vue) shows and does, filled per
 * system: Nimble from useTurnSteps, PF2e from usePf2eTurnSteps.
 */
export interface TurnModel {
  help: string
  active: boolean
  inEncounter: boolean
  initiative: number | null
  pips: TurnPip[]
  /** The pips and +1 can't be used now (PF2e off your turn: actions wait for it). */
  pipsLocked?: boolean
  /** PF2e's one reaction a round (p. 436); Nimble tracks reactions by name instead. */
  reaction?: { ready: boolean }
  leftText: string
  note: string
  /** Nimble's multi-turn casting. */
  casting?: { spell: string; actions: number }
  steps: TurnStep[]
  typed: boolean
  unsent: number | null
  extraTitle: string
  endEncounterTitle: string
  /** The panel's own result line (PF2e shows its turn results here). */
  result?: string
  toggleAction(n: number): void
  extraAction(): void
  toggleReaction?(): void
  cancelCasting?(): void
  startEncounter(): void
  rollInitiative(values?: number[]): void
  resendInitiative(): void
  beginTurn(): void
  finishTurn(): void
  nextRound(): void
  finishEncounter(): void
}

/** Players who roll their own dice type their Initiative total instead of rolling. */
export function typesInitiative(s: TurnState): boolean {
  return s.ownDice && !!s.awaitingInitiative && !s.turnActive
}

/**
 * "Your turn", "Marx is acting · you are next", "Marx is acting · round 3", or (no one
 * else acting) "Waiting for your turn" / "Not in combat".
 */
export function turnHeadline(ctx: {
  order: { id: string; name: string; character_id: string | null }[]
  turnId: string | null
  round: number
  mine: string
  turnActive: boolean
  inEncounter: boolean
}): string {
  if (ctx.turnActive) return 'Your turn'
  const acting = ctx.order.find((c) => c.id === ctx.turnId)
  if (acting && acting.character_id !== ctx.mine) {
    const next = turnAfter(ctx.order, acting.id, ctx.round)
    const nextHero = ctx.order.find((c) => c.id === next?.active)?.character_id
    return `${acting.name} is acting · ${nextHero === ctx.mine ? 'you are next' : `round ${ctx.round}`}`
  }
  return ctx.inEncounter ? 'Waiting for your turn' : 'Not in combat'
}

/**
 * What the GM's tracker moving does to a seated hero's own turn tracker (the rule
 * useTrackerTurnSteps applies to Nimble, here for PF2e): End turn when the turn passes from
 * the hero, or comes back to them in a new round with no one else to act; Start turn when it
 * reaches them; with `synced` false (a sheet just loaded onto a tracker already running) it
 * lines up once, starting the hero's turn only if the tracker hasn't already started it this
 * round (`startedRound`).
 */
export function trackerTurnStep(p: {
  mine: string
  now: string | null
  before: string | null
  round: number | null
  prevRound: number | null
  active: boolean
  startedRound?: number
  synced: boolean
}): { end: boolean; start: boolean } {
  if (!p.synced) {
    if (p.now === null) return { end: false, start: false }
    if (p.now !== p.mine) return { end: p.active, start: false }
    return { end: false, start: !p.active && p.startedRound !== (p.round ?? undefined) }
  }
  const wrapped = p.round !== null && p.prevRound !== null && p.round > p.prevRound
  const again = wrapped && p.now === p.before && p.now === p.mine
  const end = p.active && ((p.before === p.mine && p.now !== p.mine) || again)
  const start = p.now === p.mine && (p.now !== p.before || again) && (!p.active || end)
  return { end, start }
}
