import { describe, expect, it, vi } from 'vitest'
import {
  castReason,
  oddsLine,
  guarded,
  reactionReason,
  readyNote,
  sectionsFor,
  spellNotNow,
  tileButton,
  tileSub,
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

/** A tile as the board builds it: an action plus its click. */
function tile(patch: Partial<BattleAction> = {}) {
  return { ...act(patch), use: () => {} }
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

  it('keeps the tile with open details in Ready now after it becomes unusable', () => {
    const upcast = [
      act({
        key: 'bolt',
        name: 'Bolt',
        kind: 'spell',
        group: 'attack',
        unavailable: 'Not enough mana',
      }),
      act({
        key: 'aid',
        name: 'Aid',
        kind: 'spell',
        group: 'support',
        unavailable: 'Not enough mana',
      }),
    ]
    expect(sectionsFor(upcast, 'ready', '', true)).toEqual([])
    const on = sectionsFor(upcast, 'ready', '', true, 'bolt').flatMap((x) => x.actions)
    expect(on.map((a) => a.name)).toEqual(['Bolt'])
    const off = sectionsFor(upcast, 'ready', '', false, 'aid').flatMap((x) => x.actions)
    expect(off.map((a) => a.name)).toEqual(['Aid'])
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

describe('spellNotNow', () => {
  const waiting = { inEncounter: true, turnActive: false }
  const spell = { reaction: false, actions: 1, damaging: false }

  it('refuses a spell that costs actions while waiting for your turn', () => {
    expect(spellNotNow(spell, waiting)).toBe('Not your turn')
  })

  it('refuses a damaging spell even when it is free: it is an attack', () => {
    expect(spellNotNow({ ...spell, actions: 0, damaging: true }, waiting)).toBe('Not your turn')
  })

  it('allows reaction spells and free casts off-turn', () => {
    expect(spellNotNow({ ...spell, reaction: true, damaging: true }, waiting)).toBe('')
    expect(spellNotNow({ ...spell, actions: 0 }, waiting)).toBe('')
  })

  it('allows anything on your turn or outside combat', () => {
    const big = { reaction: false, actions: 2, damaging: true }
    expect(spellNotNow(big, { inEncounter: true, turnActive: true })).toBe('')
    expect(spellNotNow(big, { inEncounter: false, turnActive: false })).toBe('')
  })
})

describe('tileButton', () => {
  it('names a spell cast with its dice', () =>
    expect(tileButton(tile({ kind: 'spell', name: 'Arc Lightning', dice: '3d8' })).label).toBe(
      'Cast Arc Lightning · 3d8',
    ))
  it('weapon', () =>
    expect(tileButton(tile({ kind: 'weapon', name: 'Staff', dice: '1d6' })).label).toBe(
      'Attack with Staff · 1d6',
    ))
  it('reaction and summon verbs', () => {
    expect(tileButton(tile({ kind: 'reaction', name: 'Defend' })).label).toBe('React: Defend')
    expect(tileButton(tile({ kind: 'summon', name: 'Minions' })).label).toBe('Command Minions')
  })
  it('no dice, no dot', () =>
    expect(tileButton(tile({ kind: 'ability', name: 'Dash', dice: '' })).label).toBe('Use Dash'))
  it('unavailable disables with the reason', () =>
    expect(
      tileButton(tile({ kind: 'spell', name: 'Fire', unavailable: 'Not your turn' })),
    ).toMatchObject({ disabled: true, reason: 'Not your turn' }))
  it('available is enabled with no reason', () =>
    expect(tileButton(tile())).toMatchObject({ disabled: false, reason: '' }))
})

describe('tileSub', () => {
  it('a spell shows its tier, school and detail', () =>
    expect(tileSub(act({ kind: 'spell', tier: 1, school: 'lightning', detail: 'Range 12' }))).toBe(
      'Tier 1 · lightning · Range 12',
    ))
  it('a cantrip and other kinds', () => {
    expect(tileSub(act({ kind: 'spell', tier: 0 }))).toBe('Cantrip')
    expect(tileSub(act({ kind: 'reaction', detail: '1 reaction' }))).toBe('Reaction · 1 reaction')
  })
})

describe('oddsLine', () => {
  it('disadvantage with its reasons', () =>
    expect(oddsLine({ rushed: 1, advantage: 0, why: 'Rushed' })).toBe('+1 disadvantage (Rushed)'))
  it('advantage', () =>
    expect(oddsLine({ rushed: 0, advantage: 2, why: 'Invisible, Helped' })).toBe(
      '+2 advantage (Invisible, Helped)',
    ))
  it('no reasons, no brackets', () =>
    expect(oddsLine({ rushed: 2, advantage: 0, why: '' })).toBe('+2 disadvantage'))
  it('even odds or none say nothing', () => {
    expect(oddsLine({ rushed: 0, advantage: 0, why: 'Rushed, Invisible' })).toBe('')
    expect(oddsLine(undefined)).toBe('')
  })
})
