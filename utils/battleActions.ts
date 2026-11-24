/**
 * Availability and grouping of the actions on the desktop battle board. Pure presentation:
 * rolls, costs and triggers stay in the Nimble composables; `unavailable` only explains why
 * something is greyed out, and the sheet and the board share the same rule.
 */
import { oddsLabel } from './nimbleConditions'

export type ActionGroup = 'attack' | 'support' | 'react'
export type ActionKind = 'weapon' | 'spell' | 'ability' | 'reaction' | 'summon'
export type ActionFilter = 'ready' | 'all' | 'attack' | 'spell' | 'react' | 'ability'

export interface BattleAction {
  key: string
  name: string
  kind: ActionKind
  group: ActionGroup
  tier: number | null
  actions: number
  mana: number
  dice: string
  detail: string
  desc: string
  school: string | null
  /** Usable while it isn't your turn (reactions, paid off-turn casts). */
  offTurn: boolean
  /** Why it can't be used right now; '' when it can. */
  unavailable: string
}

export interface ActionSection {
  id: string
  title: string
  actions: BattleAction[]
}

/**
 * Why a spell can't be cast now, in priority order: a condition, not your turn, already used,
 * mid-cast, no actions, not enough mana (or minions); '' when it can be cast.
 */
export function castReason(
  s: {
    used?: boolean
    busy?: boolean
    noActions?: boolean
    short?: boolean
    usesMinions?: boolean
    cost?: string
    /** What the spell needs that isn't there (you Charged, a Smoldering target). */
    needs?: string
  },
  ctx: { turnActive: boolean; incapacitated: string },
): string {
  if (ctx.incapacitated) return ctx.incapacitated
  if (!ctx.turnActive) return 'Not your turn'
  if (s.needs) return s.needs
  if (s.used) return 'Used this turn'
  if (s.busy) return 'Finish casting first'
  if (s.noActions) return 'No actions left'
  if (s.short) return s.usesMinions ? `Needs ${s.cost}` : 'Not enough mana'
  return ''
}

/**
 * 'Not your turn' for a spell while the hero waits for their turn in combat; '' otherwise.
 * Reaction spells and free (0-action) casts stay allowed, but a damaging spell is an
 * attack and waits whatever it costs (as castReason does).
 */
export function spellNotNow(
  s: { reaction: boolean; actions: number; damaging: boolean },
  ctx: { inEncounter: boolean; turnActive: boolean },
): string {
  const waiting = ctx.inEncounter && !ctx.turnActive
  if (!waiting || s.reaction) return ''
  return s.actions > 0 || s.damaging ? 'Not your turn' : ''
}

/** Runs an action's click only when it is available; a dimmed tile does nothing. */
export function guarded(a: BattleAction & { use: () => void }): void {
  if (a.unavailable === '') a.use()
}

/** Why a weapon can't be used now; '' when it can. */
export function weaponReason(w: { why: string; blocked: boolean }): string {
  if (w.why) return w.why
  return w.blocked ? 'Unavailable' : ''
}

/** Why a reaction can't be used now; '' when it can. */
export function reactionReason(r: { used: boolean; blocked: boolean }): string {
  if (r.used) return 'Used this round'
  return r.blocked ? 'No actions left' : ''
}

function slug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function section(title: string, actions: BattleAction[]): ActionSection {
  return { id: slug(title), title, actions }
}

function matches(filter: ActionFilter, a: BattleAction): boolean {
  switch (filter) {
    case 'attack':
      return a.group === 'attack'
    case 'spell':
      return a.kind === 'spell'
    case 'react':
      return a.group === 'react'
    case 'ability':
      return a.kind === 'ability' || a.kind === 'summon'
    default:
      return true
  }
}

/** Group the actions into the board's sections; empty sections are left out. */
export function sectionsFor(
  list: BattleAction[],
  filter: ActionFilter,
  query: string,
  onTurn: boolean,
): ActionSection[] {
  const q = query.trim().toLowerCase()
  const found = q
    ? list.filter((a) => a.name.toLowerCase().includes(q) || a.desc.toLowerCase().includes(q))
    : list

  let sections: ActionSection[]
  if (filter === 'ready') {
    const open = found.filter((a) => a.unavailable === '')
    sections = onTurn
      ? [
          section(
            'Attack',
            open.filter((a) => a.group === 'attack'),
          ),
          section(
            'Boost & support',
            open.filter((a) => a.group === 'support'),
          ),
          section(
            'Reactions',
            open.filter((a) => a.group === 'react'),
          ),
        ]
      : [
          section(
            'Attack',
            open.filter((a) => a.group === 'attack'),
          ),
          section(
            'Off-turn',
            open.filter((a) => a.group === 'support' && a.offTurn),
          ),
          section(
            'Reactions',
            open.filter((a) => a.group === 'react'),
          ),
        ]
  } else {
    const shown = found.filter((a) => matches(filter, a))
    const spells = shown.filter((a) => a.kind === 'spell')
    const tiers = [...new Set(spells.map((a) => a.tier ?? 0))].sort((x, y) => x - y)
    sections = [
      section(
        'Weapons',
        shown.filter((a) => a.kind === 'weapon'),
      ),
      section(
        'Class abilities',
        shown.filter((a) => a.kind === 'ability' || a.kind === 'summon'),
      ),
      section(
        'Reactions',
        shown.filter((a) => a.group === 'react'),
      ),
      ...tiers.map((t) =>
        section(
          t === 0 ? 'Cantrips' : `Tier ${t}`,
          spells.filter((a) => (a.tier ?? 0) === t),
        ),
      ),
    ]
  }
  return sections.filter((s) => s.actions.length > 0)
}

/** The one-line note under the Ready now list. */
export function readyNote(
  list: BattleAction[],
  ctx: { onTurn: boolean; actionsLeft: number; mana: number | null },
): string {
  if (!ctx.onTurn) return 'Not your turn · only reactions and off-turn options'
  const hidden = list.filter((a) => a.unavailable !== '').length
  const parts = [`${ctx.actionsLeft} ${ctx.actionsLeft === 1 ? 'action' : 'actions'} left`]
  if (ctx.mana !== null) parts.push(`${ctx.mana} mana`)
  if (hidden > 0) parts.push(`hiding ${hidden} you can't use now`)
  return parts.join(' · ')
}

const VERB: Record<ActionKind, string> = {
  spell: 'Cast',
  weapon: 'Attack with',
  reaction: 'React:',
  summon: 'Command',
  ability: 'Use',
}

/**
 * The big button in an action's details (touch): what it does, e.g. "Cast Arc Lightning · 3d8",
 * disabled with the reason while the action is unavailable.
 */
export function tileButton(tile: BattleAction): {
  label: string
  disabled: boolean
  reason: string
} {
  const label = `${VERB[tile.kind]} ${tile.name}${tile.dice ? ` · ${tile.dice}` : ''}`
  return { label, disabled: tile.unavailable !== '', reason: tile.unavailable }
}

const KIND: Record<ActionKind, string> = {
  weapon: 'Weapon',
  spell: 'Spell',
  ability: 'Ability',
  reaction: 'Reaction',
  summon: 'Summon',
}

/** A tile's second line: the kind (or a spell's tier), school and one detail. */
export function tileSub(a: BattleAction): string {
  const t = a.tier
  const spell = t === null ? '' : t === 0 ? 'Cantrip' : `Tier ${t}`
  return [a.kind === 'spell' ? spell : KIND[a.kind], a.school, a.detail].filter(Boolean).join(' · ')
}

/** An attack's odds as the sheet computes them (the attack card's Odds: rushed, advantage, why). */
export interface ActionOdds {
  rushed: number
  advantage: number
  why: string
}

/** The odds line under the details' Use button: "+1 disadvantage (Rushed)"; '' for even odds. */
export function oddsLine(odds: ActionOdds | undefined): string {
  const text = odds ? oddsLabel(odds.rushed, odds.advantage) : ''
  return text && odds?.why ? `${text} (${odds.why})` : text
}
