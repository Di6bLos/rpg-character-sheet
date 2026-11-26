import { describe, expect, it } from 'vitest'
import type { Pf2eSheet } from '../types/sheets'
import { readAbility } from '../utils/pf2eAbilityRules'
import {
  NOT_YOUR_TURN,
  blockedReason,
  endPf2eEncounter,
  endPf2eTurn,
  gainPf2eAction,
  newTurn,
  pf2eTurnView,
  startPf2eTurn,
  timePasses,
  togglePf2eAction,
  usableOffTurn,
} from '../utils/pf2eActions'
import {
  clearPf2eConditionsAt,
  isDead,
  nightsRest,
  pf2eConditionSummary,
  resurrect,
  setPf2eConditionEnd,
} from '../utils/pf2ePlay'
import { castBlocked } from '../utils/pf2eSpells'
import { defaultSheet } from '../utils/sheetDefaults'
import { pf2eTurnSteps, pf2eTypesInitiative } from '../utils/turnSteps'

function hero(over: Partial<Pf2eSheet> = {}): Pf2eSheet {
  return { ...defaultSheet('pf2e'), hp: 30, hpMax: 30, ...over }
}
const inFight = (s: Pf2eSheet) => {
  s.turn = { ...newTurn(), initiative: 15 }
  return s
}

describe('pf2eTurnSteps (Player Core pp. 434–437)', () => {
  const idle = { inEncounter: false, active: false, rolled: false, ownDice: false }

  it('starts an encounter by rolling initiative, with no New encounter', () => {
    expect(pf2eTurnSteps(idle)).toEqual(['initiative'])
  })

  it('offers End encounter and Start turn between turns, and no New round', () => {
    expect(pf2eTurnSteps({ ...idle, inEncounter: true, rolled: true })).toEqual([
      'endEncounter',
      'start',
    ])
    expect(pf2eTurnSteps({ ...idle, inEncounter: true, rolled: true, active: true })).toEqual([
      'end',
    ])
  })

  it('in the GM encounter: initiative, then Start only on the hero’s turn and once a round', () => {
    const gm = { ...idle, inEncounter: true, gmEncounter: true }
    expect(pf2eTurnSteps(gm)).toEqual(['initiative'])
    expect(pf2eTurnSteps({ ...gm, rolled: true, myTurn: false })).toEqual([])
    expect(pf2eTurnSteps({ ...gm, rolled: true, myTurn: true })).toEqual(['start'])
    expect(pf2eTurnSteps({ ...gm, rolled: true, myTurn: true, turnDone: true })).toEqual([])
  })

  it('takes a typed total with Manual dice instead of the Roll button', () => {
    expect(pf2eTurnSteps({ ...idle, ownDice: true })).toEqual([])
    expect(pf2eTypesInitiative({ ...idle, ownDice: true })).toBe(true)
    expect(pf2eTypesInitiative({ ...idle, ownDice: true, inEncounter: true, rolled: true })).toBe(
      false,
    )
    expect(
      pf2eTypesInitiative({ ...idle, ownDice: true, inEncounter: true, gmEncounter: true }),
    ).toBe(true)
  })
})

describe('pf2eTurnView', () => {
  it('waits for your turn with 3 circles off', () => {
    const v = pf2eTurnView(inFight(hero()))
    expect(v.pips).toHaveLength(3)
    expect(v.pips.every((p) => !p.on)).toBe(true)
    expect(v.leftText).toBe('3 actions at the start of your turn · reaction ready')
  })

  it('strikes out what slowed and stunned took (p. 446)', () => {
    const s = inFight(
      hero({ conditions: ['Slowed', 'Stunned'], conditionValues: { Slowed: 2, Stunned: 1 } }),
    )
    startPf2eTurn(s)
    const v = pf2eTurnView(s)
    expect(v.pips.map((p) => [p.on, p.lost ?? ''])).toEqual([
      [true, ''],
      [false, 'Stunned'],
      [false, 'Slowed'],
    ])
    expect(v.leftText).toBe('1 of 1 left · reaction ready')
  })

  it('adds quickened and extra actions, and spends or restores a tapped circle', () => {
    const s = inFight(hero({ conditions: ['Quickened'] }))
    startPf2eTurn(s)
    expect(pf2eTurnView(s).pips).toHaveLength(4)
    gainPf2eAction(s)
    const v = pf2eTurnView(s)
    expect(v.pips[4]).toEqual({ n: 5, on: true, extra: true })
    expect(v.leftText).toBe('5 left (1 extra) · reaction ready')
    togglePf2eAction(s, 2)
    expect(s.turn?.actions).toBe(1)
    togglePf2eAction(s, 5)
    expect(s.turn?.actions).toBe(5)
    endPf2eTurn(s)
    expect(s.turn?.extra).toBeUndefined()
  })

  it('notes the multiple attack penalty for the next Strike (p. 402)', () => {
    const s = inFight(hero())
    startPf2eTurn(s)
    s.turn!.attacks = 1
    expect(pf2eTurnView(s).note).toBe('Next Strike: 2nd attack (−5, agile −4)')
  })

  it('loses every action while unconscious', () => {
    const s = inFight(hero({ conditions: ['Unconscious'] }))
    startPf2eTurn(s)
    const v = pf2eTurnView(s)
    expect(v.pips.every((p) => p.lost === 'Unconscious')).toBe(true)
    expect(v.leftText).toContain('(Unconscious)')
  })
})

describe('off your turn (p. 436)', () => {
  const ability = (actions: string, trigger = '') =>
    readAbility({
      name: 'Thing',
      actions,
      traits: [],
      text: trigger ? `**Trigger** ${trigger}; **Effect** x` : 'x',
    } as never)

  it('blocks actions in an encounter, not reactions or triggered free actions', () => {
    const s = inFight(hero())
    expect(blockedReason(s, ability('1'))).toBe(NOT_YOUR_TURN)
    expect(usableOffTurn({ cost: { kind: 'reaction' } })).toBe(true)
    expect(usableOffTurn({ cost: { kind: 'free' }, trigger: 'An ally falls' })).toBe(true)
    expect(usableOffTurn({ cost: { kind: 'free' } })).toBe(false)
  })

  it('allows everything out of an encounter', () => {
    expect(blockedReason(hero(), ability('1'))).toBe('')
  })

  it('blocks casting an action spell off your turn', () => {
    const s = inFight(hero())
    expect(castBlocked(s, { actions: '2' } as never)).toBe(NOT_YOUR_TURN)
    expect(castBlocked(s, { actions: 'reaction' } as never)).toBe('')
  })
})

describe('condition ends', () => {
  it('clears a condition at the end of your next turn, skipping the current one', () => {
    const s = inFight(hero({ conditions: ['Off-guard'] }))
    startPf2eTurn(s)
    setPf2eConditionEnd(s, 'Off-guard', 'turnEnd')
    endPf2eTurn(s)
    expect(s.conditions).toContain('Off-guard')
    startPf2eTurn(s)
    expect(endPf2eTurn(s)).toContain('No longer off-guard.')
    expect(s.conditions).not.toContain('Off-guard')
    expect(s.conditionEnds?.['Off-guard']).toBeUndefined()
  })

  it('clears valued conditions with their value at the start of your turn or the encounter', () => {
    const s = inFight(
      hero({ conditions: ['Clumsy', 'Sickened'], conditionValues: { Clumsy: 2, Sickened: 1 } }),
    )
    setPf2eConditionEnd(s, 'Clumsy', 'turnStart')
    setPf2eConditionEnd(s, 'Sickened', 'encounter')
    startPf2eTurn(s)
    expect(s.conditions).toEqual(['Sickened'])
    expect(s.conditionValues?.Clumsy).toBeUndefined()
    endPf2eTurn(s)
    endPf2eEncounter(s)
    expect(s.conditions).toEqual([])
  })

  it('says nothing when no condition ends', () => {
    expect(clearPf2eConditionsAt(hero(), 'turnStart')).toBe('')
  })

  it('sums what conditions do to the numbers', () => {
    const s = hero({ conditions: ['Frightened', 'Prone'], conditionValues: { Frightened: 2 } })
    const lines = pf2eConditionSummary(s)
    expect(lines).toContain('AC −4 (−2 Frightened 2, −2 Off-guard)')
    expect(lines).toContain('Saves −2 (−2 Frightened 2)')
    expect(lines).toContain('Melee attacks −4 (−2 Frightened 2, −2 Prone)')
  })
})

describe('rest and resurrection', () => {
  it('a night’s rest heals CON × level and eases doomed, drained and fatigued (pp. 439, 443–444)', () => {
    const s = hero({
      hp: 10,
      doomed: 2,
      conditions: ['Drained', 'Fatigued'],
      conditionValues: { Drained: 1 },
    })
    s.attrs.CON = 2
    const line = nightsRest(s, 3)
    expect(s.hp).toBe(16)
    expect(s.doomed).toBe(1)
    expect(s.conditions).toEqual([])
    expect(line).toContain('regained 6 HP')
  })

  it('heals at least the level with a low Constitution, and ends wounded at full HP (p. 447)', () => {
    const s = hero({ hp: 27, wounded: 1 })
    s.attrs.CON = -1
    nightsRest(s, 4)
    expect(s.hp).toBe(30)
    expect(s.wounded).toBe(0)
  })

  it('10 minutes of rest at full HP ends wounded', () => {
    const s = hero({ wounded: 2 })
    expect(timePasses(s, '10min')).toContain('Wounded ends')
    expect(s.wounded).toBe(0)
  })

  it('Resurrect brings the dead back at 1 HP, clumsy, drained and enfeebled 1 (p. 394)', () => {
    const s = hero({ hp: 0, dying: 4, wounded: 2, conditions: ['Unconscious'] })
    s.focus = { max: 2, current: 2, note: '' }
    expect(isDead(s)).toBe(true)
    resurrect(s)
    expect(isDead(s)).toBe(false)
    expect(s).toMatchObject({ hp: 1, dying: 0, wounded: 0 })
    expect(s.conditions.sort()).toEqual(['Clumsy', 'Drained', 'Enfeebled'])
    expect(s.focus.current).toBe(0)
    nightsRest(s, 1)
    expect(s.conditions).toContain('Drained')
  })

  it('keeps doomed short of death', () => {
    const s = hero({ hp: 0, dying: 0, doomed: 4 })
    expect(isDead(s)).toBe(true)
    resurrect(s)
    expect(s.doomed).toBe(3)
    expect(isDead(s)).toBe(false)
  })
})
