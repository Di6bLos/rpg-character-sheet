// Pathfinder 2e table-side rules for the sheet: what conditions do to checks and DCs
// (Player Core pp. 442–447), how bonuses and penalties stack (p. 400), degrees of success
// (p. 401), and damage, Shield Block, knocked out, dying, wounded and doomed (pp. 269,
// 406, 410–412). Pure functions on the sheet; the sheet panels call them and `say()` the result.
import type { Pf2eAttr, Pf2eRank, Pf2eSheet } from '~/types/sheets'
import { type Rng, parseDice, rollCheck, rollDice } from '~/utils/dice'
import {
  ASSISTED_DC,
  PERSISTENT_DC,
  type Pf2eHit,
  applyDefenses,
  removePersistent,
} from '~/utils/pf2eDamage'
import {
  baseDeathAt,
  effectConditions,
  effectMods,
  endOnUnconscious,
  pf2eEffectDef,
  raisedShieldBonus,
  recoveryDcChange,
  shieldAc,
  shieldBroken,
  toggleEffect,
} from '~/utils/pf2eEffects'

const RANK_BONUS: Record<Pf2eRank, number> = { U: 0, T: 2, E: 4, M: 6, L: 8 }

/** Proficiency bonus (Player Core p. 11): untrained +0, otherwise level + 2/4/6/8. */
export const proficiency = (rank: Pf2eRank, level = 1) =>
  rank === 'U' ? 0 : level + RANK_BONUS[rank]

export type Pf2eDegree = 'critical success' | 'success' | 'failure' | 'critical failure'
const DEGREES: Pf2eDegree[] = ['critical failure', 'failure', 'success', 'critical success']

/**
 * Degree of success (Player Core p. 401): beat the DC by 10 for a critical success, miss it
 * by 10 for a critical failure; a natural 20 is one degree better, a natural 1 one worse.
 */
export function degreeOf(total: number, natural: number, dc: number): Pf2eDegree {
  let i = total >= dc + 10 ? 3 : total >= dc ? 2 : total <= dc - 10 ? 0 : 1
  if (natural === 20) i = Math.min(3, i + 1)
  if (natural === 1) i = Math.max(0, i - 1)
  return DEGREES[i]!
}

/** How a Strike's degree reads: a critical success is a critical hit (p. 401). */
export const strikeResult = (d: Pf2eDegree) =>
  d === 'critical success'
    ? 'Critical hit'
    : d === 'success'
      ? 'Hit'
      : d === 'failure'
        ? 'Miss'
        : 'Critical miss'

export type Pf2eModType = 'status' | 'circumstance' | 'item' | 'untyped'
export interface Pf2eMod {
  value: number
  type: Pf2eModType
  source: string
}

/**
 * Bonuses and penalties (p. 400): of each type only the highest bonus and the worst penalty
 * apply; untyped penalties all apply.
 */
export function stackMods(mods: Pf2eMod[]) {
  const applied: Pf2eMod[] = []
  for (const type of ['status', 'circumstance', 'item'] as const) {
    const of = mods.filter((m) => m.type === type)
    const bonus = of.filter((m) => m.value > 0).sort((a, b) => b.value - a.value)[0]
    const penalty = of.filter((m) => m.value < 0).sort((a, b) => a.value - b.value)[0]
    if (bonus) applied.push(bonus)
    if (penalty) applied.push(penalty)
  }
  applied.push(...mods.filter((m) => m.type === 'untyped' && m.value !== 0))
  return { total: applied.reduce((n, m) => n + m.value, 0), applied }
}

/** What a number is: a roll or a DC, and the attribute it's based on. */
export interface Pf2eStatContext {
  kind: 'ac' | 'save' | 'perception' | 'classDc' | 'attack' | 'skill' | 'damage'
  attr?: Pf2eAttr
  /** Strikes: melee, and agile (Rage's damage is halved for agile attacks). */
  melee?: boolean
  agile?: boolean
  /** Strikes: their traits, lowercased (finesse for Precise Strike and Thief; agile halves Rage). */
  traits?: string[]
  /** Strikes: the hero's proficiency rank with the weapon (weapon specialization). */
  rank?: Pf2eRank
  /** Skill checks: which skill (Outwit's bonus is to Deception, Intimidation and Stealth). */
  skill?: string
  /** The hero's level, for effects that grow with it. */
  level?: number
  /** A Reflex save, for unconscious. */
  save?: 'Fortitude' | 'Reflex' | 'Will'
  /** A Perception check for initiative (Incredible Initiative's +2). */
  initiative?: boolean
  /** The action whose check this is, for bonuses limited to it (+1 to Make an Impression). */
  action?: string
  /** A spell attack or DC: weapon and class DC proficiency increases don't apply. */
  spell?: boolean
}

export interface Pf2eConditionDef {
  name: string
  /** Has a value, like frightened 2. */
  valued?: boolean
  /** One line on what it does, shown on its chip. */
  effect: string
  /** Other conditions it gives (prone → off-guard). */
  gives?: string[]
}

/** The conditions the sheet tracks, with their effect in a line (Player Core pp. 442–447). */
export const PF2E_CONDITION_DEFS: Pf2eConditionDef[] = [
  { name: 'Blinded', effect: "Can't see; Perception that needs sight critically fails" },
  {
    name: 'Clumsy',
    valued: true,
    effect: '−X status to DEX-based rolls and DCs, including AC and Reflex',
  },
  { name: 'Concealed', effect: 'Attackers need a DC 5 flat check' },
  {
    name: 'Confused',
    effect: 'Off-guard; no allies, no reactions; must attack',
    gives: ['Off-guard'],
  },
  { name: 'Dazzled', effect: 'Everything is concealed to you if sight is your only precise sense' },
  { name: 'Deafened', effect: 'Checks that need hearing critically fail; −2 status to initiative' },
  {
    name: 'Drained',
    valued: true,
    effect: '−X status to CON-based rolls (Fortitude); lose level × X max HP',
  },
  { name: 'Encumbered', effect: 'Clumsy 1 and −10 feet to every Speed' },
  {
    name: 'Enfeebled',
    valued: true,
    effect: '−X status to STR-based rolls and DCs, including melee attacks and damage',
  },
  { name: 'Fascinated', effect: '−2 status to Perception and skill checks' },
  { name: 'Fatigued', effect: '−1 status to AC and saving throws' },
  { name: 'Fleeing', effect: 'Must spend actions moving away' },
  {
    name: 'Frightened',
    valued: true,
    effect: '−X status to all checks and DCs; drops by 1 at the end of your turn',
  },
  { name: 'Grabbed', effect: 'Off-guard and immobilized', gives: ['Off-guard', 'Immobilized'] },
  { name: 'Hidden', effect: 'Attackers need a DC 11 flat check' },
  { name: 'Immobilized', effect: "Can't use move actions" },
  { name: 'Invisible', effect: 'Undetected to everyone' },
  { name: 'Off-guard', effect: '−2 circumstance to AC' },
  { name: 'Paralyzed', effect: "Off-guard; can't act", gives: ['Off-guard'] },
  { name: 'Prone', effect: 'Off-guard; −2 circumstance to attack rolls', gives: ['Off-guard'] },
  { name: 'Quickened', effect: '1 extra action at the start of your turn' },
  {
    name: 'Restrained',
    effect: 'Off-guard and immobilized; only attack to Escape',
    gives: ['Off-guard', 'Immobilized'],
  },
  {
    name: 'Sickened',
    valued: true,
    effect: "−X status to all checks and DCs; can't ingest anything",
  },
  { name: 'Slowed', valued: true, effect: 'Regain X fewer actions each turn' },
  { name: 'Stunned', valued: true, effect: "Can't act; lose X actions in total" },
  {
    name: 'Stupefied',
    valued: true,
    effect: '−X status to INT, WIS and CHA rolls and DCs; spells need a flat check',
  },
  {
    name: 'Unconscious',
    effect: '−4 status to AC, Perception and Reflex; blinded and off-guard',
    gives: ['Blinded', 'Off-guard'],
  },
]
const DEF = new Map(PF2E_CONDITION_DEFS.map((d) => [d.name, d]))

/** Active conditions, those another condition gives included (prone → off-guard). */
export function activeConditions(s: Pf2eSheet) {
  const own = [...s.conditions, ...effectConditions(s).keys()]
  const out = new Set(own)
  for (const c of own) for (const g of DEF.get(c)?.gives ?? []) out.add(g)
  return out
}

/** A condition's value: the hero's own, or what an effect gives (Enlarge: clumsy 1), whichever is higher. */
export const conditionValue = (s: Pf2eSheet, name: string) =>
  Math.max(
    s.conditions.includes(name) ? Math.max(1, s.conditionValues?.[name] ?? 1) : 0,
    effectConditions(s).get(name) ?? 0,
  )

/** The penalties conditions put on one number. */
export function conditionMods(s: Pf2eSheet, ctx: Pf2eStatContext): Pf2eMod[] {
  const on = activeConditions(s)
  const mods: Pf2eMod[] = []
  const status = (name: string, value: number) =>
    value &&
    mods.push({
      value: -value,
      type: 'status',
      source: DEF.get(name)?.valued ? `${name} ${value}` : name,
    })
  const isCheckOrDc = ctx.kind !== 'damage'
  if (isCheckOrDc) {
    status('Frightened', conditionValue(s, 'Frightened'))
    status('Sickened', conditionValue(s, 'Sickened'))
  }
  // Encumbered makes you clumsy 1 (p. 443); the higher value applies.
  if (ctx.attr === 'DEX' || ctx.kind === 'ac' || ctx.save === 'Reflex') {
    const clumsy = conditionValue(s, 'Clumsy')
    if (clumsy) status('Clumsy', clumsy)
    else if (on.has('Encumbered')) status('Encumbered (clumsy 1)', 1)
  }
  if (ctx.attr === 'STR') status('Enfeebled', conditionValue(s, 'Enfeebled'))
  if (ctx.attr === 'CON' || ctx.save === 'Fortitude')
    status('Drained', conditionValue(s, 'Drained'))
  if (ctx.attr === 'INT' || ctx.attr === 'WIS' || ctx.attr === 'CHA' || ctx.save === 'Will')
    if (isCheckOrDc) status('Stupefied', conditionValue(s, 'Stupefied'))
  if (on.has('Fatigued') && (ctx.kind === 'ac' || ctx.kind === 'save')) status('Fatigued', 1)
  if (on.has('Fascinated') && (ctx.kind === 'perception' || ctx.kind === 'skill'))
    status('Fascinated', 2)
  if (
    on.has('Unconscious') &&
    (ctx.kind === 'ac' || ctx.kind === 'perception' || ctx.save === 'Reflex')
  )
    status('Unconscious', 4)
  if (on.has('Off-guard') && ctx.kind === 'ac')
    mods.push({ value: -2, type: 'circumstance', source: 'Off-guard' })
  if (on.has('Prone') && ctx.kind === 'attack')
    mods.push({ value: -2, type: 'circumstance', source: 'Prone' })
  return mods
}

/** A number after conditions and active effects, with what changed it for its tooltip. */
export function adjusted(s: Pf2eSheet, base: number, ctx: Pf2eStatContext) {
  const { total, applied } = stackMods([...conditionMods(s, ctx), ...effectMods(s, ctx)])
  return {
    value: base + total,
    changed: total !== 0,
    note: applied
      .map((m) => `${m.value > 0 ? '+' : '−'}${Math.abs(m.value)} ${m.source}`)
      .join(', '),
  }
}

/** The attribute behind a skill, save or the class DC. */
export const SAVE_ATTR: Record<string, Pf2eAttr> = {
  Fortitude: 'CON',
  Reflex: 'DEX',
  Will: 'WIS',
  Perception: 'WIS',
}

// --- Damage, dying, wounded, doomed ----------------------------------------------

/** The dying value at which the hero dies: 4 (5 with Diehard), less doomed (p. 443). */
export const deathAt = (s: Pf2eSheet) => Math.max(0, baseDeathAt(s) - (s.doomed ?? 0))
export const isDead = (s: Pf2eSheet) => s.dying >= deathAt(s) && (s.dying > 0 || deathAt(s) === 0)

function addCondition(s: Pf2eSheet, name: string) {
  if (!s.conditions.includes(name)) s.conditions.push(name)
}
function removeCondition(s: Pf2eSheet, name: string) {
  s.conditions = s.conditions.filter((c) => c !== name)
}

/** Raise dying (p. 411); returns the death line if that kills the hero. */
function worsen(s: Pf2eSheet, by: number) {
  s.dying = Math.min(baseDeathAt(s), s.dying + by)
  return isDead(s) ? ` Dying ${s.dying}: your hero dies.` : ` Dying ${s.dying}.`
}

/** Losing dying another way than death leaves you wounded 1, or 1 more (p. 447). */
function loseDying(s: Pf2eSheet) {
  if (s.dying <= 0) return ''
  s.dying = 0
  s.wounded += 1
  return ` No longer dying; wounded ${s.wounded}.`
}

// The shield helpers live in utils/pf2eEffects.ts, which stacks the raised shield's bonus.
export { raisedShieldBonus, shieldAc, shieldBroken }

/**
 * A damage roll's total (p. 406): penalties never take it below 1, and a critical hit then
 * doubles it.
 */
export const strikeDamage = (rolled: number, crit = false) => Math.max(1, rolled) * (crit ? 2 : 1)

export interface Pf2eDamageOptions extends Pf2eHit {
  /** From an attacker's critical hit or your own critical failure. */
  crit?: boolean
  /** Shield Block: the raised shield takes up to its Hardness, then you both take the rest. */
  shieldBlock?: boolean
}

/** One type of damage in a single blow or tick (a Strike's fire and slashing, persistent damage). */
export interface Pf2eDamagePart extends Pf2eHit {
  amount: number
}

/**
 * Immunities, weaknesses and resistances on each part (p. 407; persistent damage apart from the
 * rest, p. 445); an effect's resistance "against the triggering damage" ends once it's used
 * (Selfish Shield). Returns the total and the notes.
 */
function afterDefenses(s: Pf2eSheet, parts: Pf2eDamagePart[]) {
  const notes: string[] = []
  let total = 0
  const used = new Set<string>()
  for (const p of parts) {
    const raw = Math.max(0, Math.floor(p.amount))
    const d = applyDefenses(s, raw, p)
    total += d.amount
    if (d.resisted && pf2eEffectDef(s, d.resisted.source)?.ends === 'trigger')
      used.add(d.resisted.source)
    if (d.notes.length) {
      const what = [p.persistent ? 'persistent' : '', p.type ?? ''].filter(Boolean).join(' ')
      notes.push(`${what ? `${what} ` : ''}${raw} → ${d.amount} (${d.notes.join(', ')}).`)
    }
  }
  for (const name of used)
    if (s.effects?.on.includes(name)) notes.push(toggleEffect(s, name, s.level ?? 1))
  const types = [...new Set(parts.map((p) => p.type).filter(Boolean))]
  return { total, notes, type: types.length === 1 ? `${types[0]} ` : '' }
}

/**
 * Take damage (p. 410): Shield Block first, then temp HP, then HP. At 0 HP you're knocked
 * out with dying 1 (2 on a crit) plus your wounded value; damage while dying raises it by 1
 * (2 on a crit). One blow of at least double your max HP kills outright (massive damage,
 * p. 412); it's counted after Shield Block, as that's the damage the hero takes.
 */
export function takeDamage(
  s: Pf2eSheet,
  amount: number | Pf2eDamagePart[],
  o: Pf2eDamageOptions = {},
): string {
  // A typed amount or parts go through the hero's defenses first (p. 407); the HP steppers don't.
  const typed = Array.isArray(amount) || o.type !== undefined || !!o.spell
  const parts: Pf2eDamagePart[] = Array.isArray(amount)
    ? amount
    : [{ amount, ...(o.type ? { type: o.type } : {}), spell: o.spell, persistent: o.persistent }]
  const defended = typed ? afterDefenses(s, parts) : undefined
  let left = defended?.total ?? Math.max(0, Math.floor(parts[0]?.amount ?? 0))
  const kind = defended?.type ?? ''
  const notes: string[] = [...(defended?.notes ?? [])]
  if (o.shieldBlock && s.shield.name && !shieldBroken(s)) {
    const prevented = Math.min(left, s.shield.hardness)
    left -= prevented
    s.shield.hp = Math.max(0, s.shield.hp - left)
    const state =
      s.shield.hp === 0 ? ' and is destroyed' : s.shield.hp <= s.shield.bt ? ' and is broken' : ''
    notes.push(`${s.shield.name} blocks ${prevented}, takes ${left}${state}.`)
    if (shieldBroken(s)) s.shield.raised = false
  }
  if (s.hpMax > 0 && left >= 2 * s.hpMax) {
    s.tempHp = 0
    s.hp = 0
    s.dying = Math.max(1, deathAt(s))
    addCondition(s, 'Unconscious')
    const took = `Took ${left} ${kind}damage${o.crit ? ' (crit)' : ''}, double your max HP or more:`
    return [...notes, `${took} massive damage, your hero dies instantly.`].join(' ')
  }
  if (s.hp === 0 && s.dying > 0) {
    if (left === 0) return notes.join(' ')
    return `${notes.join(' ')}${worsen(s, o.crit ? 2 : 1)}`.trim()
  }
  const fromTemp = Math.min(s.tempHp, left)
  s.tempHp -= fromTemp
  left -= fromTemp
  s.hp = Math.max(0, s.hp - left)
  const took = `Took ${fromTemp + left} ${kind}damage${o.crit ? ' (crit)' : ''}: ${s.hp}/${s.hpMax} HP.`
  if (s.hp > 0 || fromTemp + left === 0) return [...notes, took].join(' ')
  addCondition(s, 'Unconscious')
  const ended = endOnUnconscious(s)
  const out = `${[...notes, took].join(' ')} Knocked out:${worsen(s, (o.crit ? 2 : 1) + s.wounded)}`
  return ended ? `${out} ${ended}` : out
}

/** Healing, recovery checks and Heroic Recovery can't bring back the dead (p. 411). */
const DEAD = 'Your hero has died: only magic that returns the dead can bring them back.'

/** Heal (p. 411): back above 0 HP you lose dying (gaining wounded) and wake up. */
export function heal(s: Pf2eSheet, amount: number): string {
  if (isDead(s)) return DEAD
  const was = s.hp
  s.hp = Math.min(s.hpMax, s.hp + Math.max(0, Math.floor(amount)))
  let note = ''
  if (was === 0 && s.hp > 0) {
    note = loseDying(s)
    removeCondition(s, 'Unconscious')
  }
  // Wounded ends when you're restored to full HP and rested (p. 447); the player clears it.
  // Bleed ends when you're healed to full HP (p. 407).
  const bled = s.hp === s.hpMax ? removePersistent(s, 'bleed') : ''
  return `Healed ${s.hp - was}: ${s.hp}/${s.hpMax} HP.${note}${bled ? ` ${bled}` : ''}`
}

/** The recovery check DC (p. 411): 10 + dying, 1 lower with Toughness (p. 263). */
export const recoveryDc = (s: Pf2eSheet) => 10 + s.dying + recoveryDcChange(s)

/**
 * Recovery check (p. 411): a flat check against DC 10 + dying at the start of your turn.
 * Critical success −2, success −1, failure +1, critical failure +2.
 */
export function recoveryCheck(s: Pf2eSheet, natural: number): string {
  if (isDead(s)) return DEAD
  if (s.dying <= 0) return 'Not dying: no recovery check.'
  const dc = recoveryDc(s)
  const d = degreeOf(natural, natural, dc)
  const head = `Recovery check: ${natural} vs DC ${dc}, ${d}.`
  if (d === 'critical failure' || d === 'failure')
    return `${head}${worsen(s, d === 'failure' ? 1 : 2)}`
  const dying = s.dying - (d === 'success' ? 1 : 2)
  if (dying > 0) {
    s.dying = dying
    return `${head} Dying ${dying}.`
  }
  return `${head} Stable at 0 HP, still unconscious.${loseDying(s)}`
}

/**
 * Heroic Recovery (p. 411): spend all your Hero Points (at least 1) to lose dying and
 * stabilize at 0 HP, without gaining or raising wounded.
 */
export function heroicRecovery(s: Pf2eSheet): string {
  if (isDead(s)) return DEAD
  if (s.heroPoints < 1) return 'No Hero Points left.'
  if (s.dying <= 0) return 'Not dying.'
  const spent = s.heroPoints
  s.heroPoints = 0
  s.dying = 0
  return `Spent ${spent} Hero Point${spent === 1 ? '' : 's'}: stable at 0 HP, wounded stays ${s.wounded}.`
}

// --- Persistent damage (p. 445) ---------------------------------------------------

/** A persistent amount rolled anew: dice through the dice tray, or a flat number. */
function rollAmount(dice: string, rng: Rng) {
  const e = parseDice(dice)
  return e ? rollDice(e, rng).total : Math.max(0, Number(dice) || 0)
}

/**
 * The end of your turn with persistent damage (p. 445): each condition's dice are rolled anew
 * and all of it is taken at once (so dying rises only once), its own type through weaknesses
 * and resistances; then a DC 15 flat check for each, a success ending it.
 */
export function takePersistent(s: Pf2eSheet, rng: Rng = Math.random): string {
  const list = s.persistent ?? []
  if (!list.length || isDead(s)) return ''
  const rolled = list.map((p) => ({ p, amount: rollAmount(p.dice, rng) }))
  const each = rolled.map(({ p, amount }) => `${amount} ${p.type} (${p.dice})`).join(', ')
  const took = takeDamage(
    s,
    rolled.map(({ p, amount }) => ({ amount, type: p.type, persistent: true })),
  )
  const checks = rolled.map(({ p }) => flatCheck(s, p.type, PERSISTENT_DC, rng))
  return `Persistent damage ${each}. ${took} ${checks.join(' ')}`
}

function flatCheck(s: Pf2eSheet, type: string, dc: number, rng: Rng) {
  const r = rollCheck(0, rng)
  const ends = r.d20 >= dc
  if (ends) removePersistent(s, type)
  return `Flat check ${r.d20} vs DC ${dc}: persistent ${type} ${ends ? 'ends' : 'goes on'}.`
}

/**
 * Assisted recovery (p. 445): help (usually 2 actions) gives another flat check right away, once
 * a round; particularly apt help, like dousing the flames, lowers the DC to 10.
 */
export function assistedRecovery(
  s: Pf2eSheet,
  type: string,
  apt = false,
  rng: Rng = Math.random,
): string {
  const p = s.persistent?.find((x) => x.type === type)
  if (!p) return `No persistent ${type} damage.`
  const round = s.turn?.round ?? 0
  if (round > 0 && p.assisted === round) return 'Already helped this round.'
  p.assisted = round
  return `Assisted recovery: ${flatCheck(s, type, apt ? ASSISTED_DC : PERSISTENT_DC, rng)}`
}
