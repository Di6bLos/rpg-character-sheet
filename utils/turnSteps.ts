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
