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
}

/**
 * The step buttons to show, in order: New encounter → Roll Initiative → Start turn →
 * End turn → New round → …, with End encounter beside them between turns.
 */
export function turnSteps(s: TurnState): TurnStep[] {
  const steps: TurnStep[] = []
  if (!s.inEncounter) steps.push('encounter')
  if (s.awaitingInitiative && !s.ownDice && !s.turnActive) steps.push('initiative')
  if (s.inEncounter && !s.turnActive) steps.push('endEncounter')
  if (!s.turnActive && s.inEncounter && !s.turnDone && !s.awaitingInitiative) steps.push('start')
  else if (s.inEncounter && s.turnDone && !s.turnActive) steps.push('round')
  if (s.turnActive) steps.push('end')
  return steps
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
