import { describe, expect, it } from 'vitest'
import {
  seatChange,
  trackerTurnStep,
  turnHeadline,
  turnSteps,
  typesInitiative,
} from '../utils/turnSteps'

const idle = {
  inEncounter: false,
  turnActive: false,
  turnDone: false,
  ownDice: false,
  awaitingInitiative: false,
}

describe('turnSteps', () => {
  it('offers New encounter outside combat', () => {
    expect(turnSteps(idle)).toEqual(['encounter'])
  })

  it('asks for Initiative before the first turn', () => {
    const s = { ...idle, inEncounter: true, awaitingInitiative: true }
    expect(turnSteps(s)).toEqual(['initiative', 'endEncounter'])
    expect(typesInitiative(s)).toBe(false)
  })

  it('has own-dice players type their total instead of rolling', () => {
    const s = { ...idle, inEncounter: true, awaitingInitiative: true, ownDice: true }
    expect(turnSteps(s)).toEqual(['endEncounter'])
    expect(typesInitiative(s)).toBe(true)
  })

  it('walks Start turn → End turn → New round', () => {
    const waiting = { ...idle, inEncounter: true }
    expect(turnSteps(waiting)).toEqual(['endEncounter', 'start'])
    expect(turnSteps({ ...waiting, turnActive: true })).toEqual(['end'])
    expect(turnSteps({ ...waiting, turnDone: true })).toEqual(['endEncounter', 'round'])
  })
})

describe('turnHeadline', () => {
  const order = [
    { id: 'a', name: 'Marx', character_id: 'marx' },
    { id: 'b', name: 'Goblin A', character_id: null },
    { id: 'c', name: 'Iriel', character_id: 'iriel' },
  ]
  const base = { order, round: 3, mine: 'iriel', turnActive: false, inEncounter: true }

  it('says your turn while it is active', () => {
    expect(turnHeadline({ ...base, turnId: 'c', turnActive: true })).toBe('Your turn')
  })

  it('says you are next when the hero follows the acting creature', () => {
    expect(turnHeadline({ ...base, turnId: 'b' })).toBe('Goblin A is acting · you are next')
  })

  it('gives the round otherwise, wrapping at the end of the order', () => {
    expect(turnHeadline({ ...base, turnId: 'a' })).toBe('Marx is acting · round 3')
    expect(turnHeadline({ ...base, mine: 'marx', turnId: 'c' })).toBe(
      'Iriel is acting · you are next',
    )
  })

  it('falls back when no one else is acting', () => {
    expect(turnHeadline({ ...base, turnId: null })).toBe('Waiting for your turn')
    expect(turnHeadline({ ...base, turnId: null, inEncounter: false })).toBe('Not in combat')
    expect(turnHeadline({ ...base, turnId: 'c' })).toBe('Waiting for your turn')
  })
})

describe('turnSteps in the GM encounter', () => {
  const seated = {
    inEncounter: true,
    turnActive: false,
    turnDone: false,
    ownDice: false,
    awaitingInitiative: true,
    gmEncounter: true,
  }

  it('asks for Initiative first (typed in when rolling your own dice)', () => {
    expect(turnSteps(seated)).toEqual(['initiative'])
    expect(turnSteps({ ...seated, ownDice: true })).toEqual([])
    expect(typesInitiative({ ...seated, ownDice: true })).toBe(true)
  })

  it('only starts and ends turns: no New encounter, New round or End encounter', () => {
    const rolled = { ...seated, awaitingInitiative: false }
    expect(turnSteps(rolled)).toEqual(['start'])
    expect(turnSteps({ ...rolled, turnActive: true })).toEqual(['end'])
  })

  it("starts only on the hero's own turn, and not again once it is over", () => {
    const rolled = { ...seated, awaitingInitiative: false }
    expect(turnSteps({ ...rolled, myTurn: true })).toEqual(['start'])
    expect(turnSteps({ ...rolled, myTurn: false })).toEqual([])
    // Ended while the tracker still points here: the next round resets turnDone.
    expect(turnSteps({ ...rolled, myTurn: true, turnDone: true })).toEqual([])
  })
})

describe('seatChange', () => {
  const idle = { inEncounter: false, awaitingInitiative: false }
  const fighting = { inEncounter: true, awaitingInitiative: false }
  /** In the GM's fight from seat `a`. */
  const inA = { ...fighting, gmCombatant: 'a' }

  it('starts an encounter when the GM seats the hero', () => {
    expect(seatChange(false, 'a', idle)).toBe('begin')
    // A stale fight the player never ended: a fresh seat is a new encounter.
    expect(seatChange(false, 'a', fighting)).toBe('begin')
    expect(seatChange(false, 'a', { inEncounter: true, awaitingInitiative: true })).toBeNull()
  })

  it('on load, joins only when not in an encounter yet', () => {
    expect(seatChange(null, 'a', idle)).toBe('begin')
    expect(seatChange(undefined, 'a', idle)).toBe('begin')
    expect(seatChange(null, 'a', fighting)).toBeNull()
  })

  it('on load, keeps the same fight but starts over in a new one', () => {
    expect(seatChange(undefined, 'a', inA)).toBeNull()
    // The GM ended fight A and seated the party in fight B while the player was away.
    expect(seatChange(undefined, 'b', inA)).toBe('begin')
    // Removed and re-added while the sheet was open.
    expect(seatChange('a', 'b', inA)).toBe('begin')
  })

  it('ends the encounter when the hero leaves the tracker', () => {
    expect(seatChange('a', false, fighting)).toBe('end')
    expect(seatChange('a', false, idle)).toBeNull()
  })

  it('on load, ends a GM fight that ended while away, not a solo one', () => {
    expect(seatChange(undefined, false, inA)).toBe('end')
    expect(seatChange(null, false, inA)).toBe('end')
    // A solo fight in a campaign (no saved seat) is left alone.
    expect(seatChange(null, false, fighting)).toBeNull()
  })

  it('does nothing while unknown or unchanged', () => {
    expect(seatChange('a', null, fighting)).toBeNull()
    expect(seatChange('a', 'a', idle)).toBeNull()
    expect(seatChange('a', 'a', inA)).toBeNull()
  })
})

describe('trackerTurnStep: the GM tracker drives a PF2e hero’s turn', () => {
  const at = (p: Partial<Parameters<typeof trackerTurnStep>[0]>) =>
    trackerTurnStep({
      mine: 'mira',
      now: null,
      before: null,
      round: 1,
      prevRound: 1,
      active: false,
      synced: true,
      ...p,
    })

  it('starts the hero’s turn when the tracker reaches them', () => {
    expect(at({ before: 'goblin', now: 'mira' })).toEqual({ end: false, start: true })
  })

  it('ends it when the tracker moves past them', () => {
    expect(at({ before: 'mira', now: 'bram', active: true })).toEqual({ end: true, start: false })
    // Already ended on the sheet: nothing to do.
    expect(at({ before: 'mira', now: 'bram' })).toEqual({ end: false, start: false })
  })

  it('ends and starts again on a new round with only the hero to act', () => {
    const wrap = { before: 'mira', now: 'mira', prevRound: 1, round: 2, active: true }
    expect(at(wrap)).toEqual({ end: true, start: true })
  })

  it('a new round that starts on someone else ends the hero’s turn', () => {
    expect(at({ before: 'mira', now: 'goblin', prevRound: 1, round: 2, active: true })).toEqual({
      end: true,
      start: false,
    })
  })

  it('the tracker cleared (End encounter) ends a running turn', () => {
    expect(at({ before: 'mira', now: null, round: null, active: true })).toEqual({
      end: true,
      start: false,
    })
  })

  it('lines up once on load, without restarting a turn the tracker already started', () => {
    const load = { synced: false, now: 'mira', round: 3 }
    expect(at(load)).toEqual({ end: false, start: true })
    expect(at({ ...load, startedRound: 3 })).toEqual({ end: false, start: false })
    expect(at({ synced: false, now: 'bram', active: true })).toEqual({ end: true, start: false })
    expect(at({ synced: false, now: null, active: true })).toEqual({ end: false, start: false })
  })
})
