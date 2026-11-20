import { describe, expect, it } from 'vitest'
import { seatChange, turnHeadline, turnSteps, typesInitiative } from '../utils/turnSteps'

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
    expect(turnSteps({ ...rolled, turnDone: true })).toEqual(['start'])
  })
})

describe('seatChange', () => {
  const idle = { inEncounter: false, awaitingInitiative: false }
  const fighting = { inEncounter: true, awaitingInitiative: false }

  it('starts an encounter when the GM seats the hero', () => {
    expect(seatChange(false, true, idle)).toBe('begin')
    // A stale fight the player never ended: a fresh seat is a new encounter.
    expect(seatChange(false, true, fighting)).toBe('begin')
    expect(seatChange(false, true, { inEncounter: true, awaitingInitiative: true })).toBeNull()
  })

  it('on load, joins only when not in an encounter yet', () => {
    expect(seatChange(null, true, idle)).toBe('begin')
    expect(seatChange(undefined, true, idle)).toBe('begin')
    expect(seatChange(null, true, fighting)).toBeNull()
  })

  it('ends the encounter when the hero leaves the tracker', () => {
    expect(seatChange(true, false, fighting)).toBe('end')
    expect(seatChange(true, false, idle)).toBeNull()
    // Found unseated on load (a solo fight in a campaign) is left alone.
    expect(seatChange(null, false, fighting)).toBeNull()
  })

  it('does nothing while unknown or unchanged', () => {
    expect(seatChange(true, null, fighting)).toBeNull()
    expect(seatChange(true, true, idle)).toBeNull()
  })
})
