import { describe, expect, it, vi } from 'vitest'
import {
  castReason,
  guarded,
  reactionReason,
  readyNote,
  sectionsFor,
  weaponReason,
  type BattleAction,
} from '../utils/battleActions'
import { counterCost, usableOffTurn } from '../utils/nimblePlay'

function act(patch: Partial<BattleAction> = {}): BattleAction {
  return {
    key: 'k',
    name: 'Thing',
    kind: 'weapon',
    group: 'attack',
    tier: null,
    actions: 1,
    mana: 0,
    dice: '',
    detail: '',
    desc: '',
    school: null,
    offTurn: false,
    unavailable: '',
    ...patch,
  }
}

const ok = { turnActive: true, incapacitated: '' }

describe('castReason', () => {
  it('follows the sheet chain in priority order', () => {
    const all = { used: true, busy: true, noActions: true, short: true }
    expect(castReason(all, { turnActive: false, incapacitated: 'Stunned' })).toBe('Stunned')
    expect(castReason(all, { turnActive: false, incapacitated: '' })).toBe('Not your turn')
    expect(castReason(all, ok)).toBe('Used this turn')
    expect(castReason({ ...all, used: false }, ok)).toBe('Finish casting first')
    expect(castReason({ ...all, used: false, busy: false }, ok)).toBe('No actions left')
    expect(castReason({ short: true }, ok)).toBe('Not enough mana')
    expect(castReason({ short: true, usesMinions: true, cost: '2 minions' }, ok)).toBe(
      'Needs 2 minions',
    )
    expect(castReason({}, ok)).toBe('')
  })
})

describe('weaponReason and reactionReason', () => {
  it('gives a reason', () => {
    expect(weaponReason({ why: '', blocked: true })).toBe('Unavailable')
    expect(weaponReason({ why: 'Not your turn', blocked: true })).toBe('Not your turn')
    expect(weaponReason({ why: '', blocked: false })).toBe('')
    expect(reactionReason({ used: true, blocked: false })).toBe('Used this round')
    expect(reactionReason({ used: false, blocked: true })).toBe('No actions left')
    expect(reactionReason({ used: false, blocked: false })).toBe('')
  })
})

describe('sectionsFor', () => {
  const list = [
    act({ name: 'Sword', kind: 'weapon', group: 'attack' }),
    act({ name: 'Bolt', kind: 'spell', group: 'attack', tier: 1, desc: 'A ZAP of light' }),
    act({ name: 'Rest', kind: 'ability', group: 'support', offTurn: true }),
    act({ name: 'Rally', kind: 'ability', group: 'support' }),
    act({ name: 'Defend', kind: 'reaction', group: 'react' }),
    act({ name: 'Spark', kind: 'spell', group: 'attack', tier: 0, unavailable: 'No actions left' }),
    act({ name: 'Wall', kind: 'spell', group: 'support', tier: 2 }),
    act({ name: 'Summon', kind: 'summon', group: 'support' }),
  ]

  it('ready on turn lists only available actions in order', () => {
    const s = sectionsFor(list, 'ready', '', true)
    expect(s.map((x) => x.title)).toEqual(['Attack', 'Boost & support', 'Reactions'])
    expect(s.flatMap((x) => x.actions).every((a) => a.unavailable === '')).toBe(true)
  })

  it('ready off turn shows only off-turn support', () => {
    const s = sectionsFor(list, 'ready', '', false)
    const support = s.find((x) => x.title === 'Off-turn')
    expect(support?.actions.map((a) => a.name)).toEqual(['Rest'])
  })

  it('off turn, a support tile the sheet refuses (Not your turn) stays out of Off-turn', () => {
    const offTurn = [
      act({ name: 'Haste', kind: 'spell', group: 'support', unavailable: 'Not your turn' }),
      act({ name: 'Free trick', kind: 'ability', group: 'support', offTurn: true }),
    ]
    const s = sectionsFor(offTurn, 'ready', '', false)
    expect(s.flatMap((x) => x.actions).map((a) => a.name)).toEqual(['Free trick'])
  })

  it('all keeps unavailable and groups by kind and tier', () => {
    const s = sectionsFor(list, 'all', '', true)
    expect(s.map((x) => x.title)).toEqual([
      'Weapons',
      'Class abilities',
      'Reactions',
      'Cantrips',
      'Tier 1',
      'Tier 2',
    ])
    expect(s.flatMap((x) => x.actions).some((a) => a.unavailable)).toBe(true)
  })

  it('category filters narrow the list', () => {
    expect(sectionsFor(list, 'spell', '', true).map((x) => x.title)).toEqual([
      'Cantrips',
      'Tier 1',
      'Tier 2',
    ])
    expect(sectionsFor(list, 'react', '', true).map((x) => x.title)).toEqual(['Reactions'])
  })

  it('the attack filter keeps the attack group', () => {
    const s = sectionsFor(list, 'attack', '', true)
    expect(s.flatMap((x) => x.actions).map((a) => a.name)).toEqual(['Sword', 'Spark', 'Bolt'])
  })

  it('the ability filter matches the Class abilities section, summons included', () => {
    const s = sectionsFor(list, 'ability', '', true)
    expect(s.map((x) => x.title)).toEqual(['Class abilities'])
    expect(s[0]?.actions.map((a) => a.name)).toEqual(['Rest', 'Rally', 'Summon'])
  })

  it('query matches name or desc, case-insensitively', () => {
    const s = sectionsFor(list, 'all', 'zap', true)
    expect(s.flatMap((x) => x.actions).map((a) => a.name)).toEqual(['Bolt'])
    expect(sectionsFor(list, 'all', 'SWOR', true).flatMap((x) => x.actions)).toHaveLength(1)
  })
})

describe('guarded', () => {
  it('calls use only when nothing makes the action unavailable', () => {
    const blocked = { ...act({ unavailable: 'Not your turn' }), use: vi.fn() }
    guarded(blocked)
    expect(blocked.use).not.toHaveBeenCalled()
    const open = { ...act(), use: vi.fn() }
    guarded(open)
    expect(open.use).toHaveBeenCalledTimes(1)
  })
})

describe('readyNote', () => {
  it('summarises on turn', () => {
    expect(
      readyNote(
        [
          act({ unavailable: 'x' }),
          act({ unavailable: 'x' }),
          act({ unavailable: 'x' }),
          act({ unavailable: 'x' }),
        ],
        { onTurn: true, actionsLeft: 1, mana: 13 },
      ),
    ).toBe("1 action left · 13 mana · hiding 4 you can't use now")
  })
  it('leaves out mana when null and pluralises', () => {
    expect(readyNote([act()], { onTurn: true, actionsLeft: 2, mana: null })).toBe('2 actions left')
  })
  it('is fixed off turn', () => {
    expect(readyNote([], { onTurn: false, actionsLeft: 0, mana: 3 })).toBe(
      'Not your turn · only reactions and off-turn options',
    )
  })
})

describe('usableOffTurn (sheet rule: off-turn in combat only free uses and reactions)', () => {
  const allowed = (text: string) => usableOffTurn(counterCost(text), text)

  it('refuses uses that cost actions', () => {
    expect(allowed('(1/encounter) Action: Grant all friendly Dying creatures 1 HP.')).toBe(false)
    expect(allowed('(1/encounter) 2 actions: Expend your Judgment Dice.')).toBe(false)
    expect(usableOffTurn({ actions: 1 }, 'Spend 1 action to gain 2 temp HP.')).toBe(false)
  })

  it('allows reactions, uses riding on Defend or Interpose, and free uses', () => {
    expect(allowed('(1/round) Reaction: when an ally is hit, reduce the damage by 5.')).toBe(true)
    expect(allowed('Whenever you Defend, gain 2 armor until your next turn.')).toBe(true)
    expect(allowed('Action/Reaction: Shove a creature 2 spaces.')).toBe(true)
    expect(allowed('You can Interpose for free.')).toBe(true)
    expect(usableOffTurn(undefined, 'Gain advantage on your next save.')).toBe(true)
    expect(usableOffTurn({ actions: 0 }, '')).toBe(true)
  })
})
