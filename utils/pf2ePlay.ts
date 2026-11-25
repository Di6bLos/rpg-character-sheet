// Pathfinder 2e table-side rules for the sheet: what conditions do to checks and DCs
// (Player Core pp. 442–447), how bonuses and penalties stack (p. 400), degrees of success
// (p. 401), and damage, Shield Block, knocked out, dying, wounded and doomed (pp. 269,
// 406, 410–412). Pure functions on the sheet; the sheet panels call them and `say()` the result.
import type { Pf2eAttr, Pf2eRank, Pf2eSheet } from '~/types/sheets'
import { baseDeathAt, effectMods, endOnUnconscious, recoveryDcChange } from '~/utils/pf2eEffects'

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
  /** Strikes: their traits, lowercased (an agile trait halves Rage's damage too). */
  traits?: string[]
  /** A Reflex save, for unconscious. */
  save?: 'Fortitude' | 'Reflex' | 'Will'
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
  const out = new Set(s.conditions)
  for (const c of s.conditions) for (const g of DEF.get(c)?.gives ?? []) out.add(g)
  return out
}

export const conditionValue = (s: Pf2eSheet, name: string) =>
  s.conditions.includes(name) ? Math.max(1, s.conditionValues?.[name] ?? 1) : 0

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

/**
 * A shield is broken at or below its Broken Threshold (p. 269): it can't Shield Block and
 * gives no AC while raised until it's Repaired above it. A shield without max HP isn't tracked.
 */
export const shieldBroken = (s: Pf2eSheet) => s.shield.hpMax > 0 && s.shield.hp <= s.shield.bt

/**
 * The shield's own circumstance bonus to AC (Buckler +1, most +2, p. 274); +2 when the sheet
 * doesn't say (older sheets, or the editor's field left empty).
 */
export const shieldAc = (s: Pf2eSheet) =>
  typeof s.shield.ac === 'number' && Number.isFinite(s.shield.ac) ? s.shield.ac : 2

/** What a raised, unbroken shield adds to AC, as a circumstance bonus (p. 274). */
export const raisedShieldBonus = (s: Pf2eSheet) =>
  s.shield.name.trim() !== '' && s.shield.raised && !shieldBroken(s) ? shieldAc(s) : 0

/**
 * A damage roll's total (p. 406): penalties never take it below 1, and a critical hit then
 * doubles it.
 */
export const strikeDamage = (rolled: number, crit = false) => Math.max(1, rolled) * (crit ? 2 : 1)

export interface Pf2eDamageOptions {
  /** From an attacker's critical hit or your own critical failure. */
  crit?: boolean
  /** Shield Block: the raised shield takes up to its Hardness, then you both take the rest. */
  shieldBlock?: boolean
}

/**
 * Take damage (p. 410): Shield Block first, then temp HP, then HP. At 0 HP you're knocked
 * out with dying 1 (2 on a crit) plus your wounded value; damage while dying raises it by 1
 * (2 on a crit). One blow of at least double your max HP kills outright (massive damage,
 * p. 412); it's counted after Shield Block, as that's the damage the hero takes.
 */
export function takeDamage(s: Pf2eSheet, amount: number, o: Pf2eDamageOptions = {}): string {
  let left = Math.max(0, Math.floor(amount))
  const notes: string[] = []
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
    const took = `Took ${left} damage${o.crit ? ' (crit)' : ''}, double your max HP or more:`
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
  const took = `Took ${fromTemp + left} damage${o.crit ? ' (crit)' : ''}: ${s.hp}/${s.hpMax} HP.`
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
  return `Healed ${s.hp - was}: ${s.hp}/${s.hpMax} HP.${note}`
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
