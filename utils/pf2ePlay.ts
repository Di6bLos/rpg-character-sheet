// Pathfinder 2e table-side rules for the sheet: what conditions do to checks and DCs
// (Player Core pp. 442–447), how bonuses and penalties stack (p. 400), degrees of success
// (p. 401), and damage, Shield Block, knocked out, dying, wounded and doomed (pp. 269,
// 406, 410–412). Pure functions on the sheet; the sheet panels call them and `say()` the result.
import type { Pf2eAttr, Pf2eConditionEnd, Pf2eRank, Pf2eSheet } from '~/types/sheets'
import {
  type AttackRoll,
  type Rng,
  parseDice,
  rollCheck,
  rollCheckTwice,
  rollDice,
  showOutcome,
  sign,
  typedCheck,
} from '~/utils/dice'
import { PF2E_SKILLS } from '~/data/pf2e/skills'
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
  shiftedDegree,
  toggleEffect,
} from '~/utils/pf2eEffects'
import { runeMods } from '~/utils/pf2eInventory'

const RANK_BONUS: Record<Pf2eRank, number> = { U: 0, T: 2, E: 4, M: 6, L: 8 }

/** Proficiency bonus (Player Core p. 11): untrained +0, otherwise level + 2/4/6/8. */
export const proficiency = (rank: Pf2eRank, level = 1) =>
  rank === 'U' ? 0 : level + RANK_BONUS[rank]

export type Pf2eDegree = 'critical success' | 'success' | 'failure' | 'critical failure'
const DEGREES: Pf2eDegree[] = ['critical failure', 'failure', 'success', 'critical success']

/**
 * Degree of success (Player Core p. 401): beat the DC by 10 for a critical success, miss it
 * by 10 for a critical failure; a natural 20 is one degree better, a natural 1 one worse.
 * `keen`: a Strike with a keen rune is a critical hit on a natural 19 that hits (GM Core p. 237).
 */
export function degreeOf(total: number, natural: number, dc: number, keen = false): Pf2eDegree {
  let i = total >= dc + 10 ? 3 : total >= dc ? 2 : total <= dc - 10 ? 0 : 1
  if (keen && natural === 19 && i === 2) i = 3
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
  /** Strikes: the Strike's name, for its weapon's potency rune (GM Core p. 224). */
  weapon?: string
}

export interface Pf2eConditionDef {
  name: string
  /** Has a value, like frightened 2. */
  valued?: boolean
  /** One line on what it does, shown on its chip. */
  effect: string
  /** Other conditions it gives (prone → off-guard). */
  gives?: string[]
  /** How aware others are of you (observed, hidden, undetected, unnoticed; p. 444). */
  awareness?: boolean
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
    name: 'Controlled',
    effect: "Can't act on your own: the controller dictates your actions, reactions included",
  },
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
  { name: 'Hidden', effect: 'Attackers need a DC 11 flat check', awareness: true },
  { name: 'Immobilized', effect: "Can't use move actions" },
  { name: 'Invisible', effect: 'Undetected to everyone' },
  {
    name: 'Observed',
    effect: 'In plain view: the default, no flat check to target you',
    awareness: true,
  },
  { name: 'Off-guard', effect: '−2 circumstance to AC' },
  { name: 'Paralyzed', effect: "Off-guard; can't act", gives: ['Off-guard'] },
  {
    name: 'Petrified',
    effect: "Can't act or sense anything; an object with AC 9 and Hardness 8, saves as an object",
  },
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
  {
    name: 'Undetected',
    effect: "Can't be seen or targeted: attackers guess your square, DC 11 flat check",
    awareness: true,
  },
  {
    name: 'Unnoticed',
    effect: 'No one knows you are there; undetected too',
    gives: ['Undetected'],
    awareness: true,
  },
]
const DEF = new Map(PF2E_CONDITION_DEFS.map((d) => [d.name, d]))

/** The conditions with those they give (prone → off-guard). */
function withGiven(own: Iterable<string>) {
  const out = new Set(own)
  for (const c of out) for (const g of DEF.get(c)?.gives ?? []) out.add(g)
  return out
}

/** Active conditions, those another condition gives included (prone → off-guard). */
export function activeConditions(s: Pf2eSheet) {
  return withGiven([...s.conditions, ...effectConditions(s).keys()])
}

/** A condition's value: the hero's own, or what an effect gives (Enlarge: clumsy 1), whichever is higher. */
export const conditionValue = (s: Pf2eSheet, name: string) =>
  Math.max(
    s.conditions.includes(name) ? Math.max(1, s.conditionValues?.[name] ?? 1) : 0,
    effectConditions(s).get(name) ?? 0,
  )

/** The penalties conditions put on one number. */
export function conditionMods(s: Pf2eSheet, ctx: Pf2eStatContext): Pf2eMod[] {
  return modsOf(activeConditions(s), (name) => conditionValue(s, name), ctx)
}

function modsOf(on: Set<string>, valueOf: (name: string) => number, ctx: Pf2eStatContext) {
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
    status('Frightened', valueOf('Frightened'))
    status('Sickened', valueOf('Sickened'))
  }
  // Encumbered makes you clumsy 1 (p. 443); the higher value applies.
  if (ctx.attr === 'DEX' || ctx.kind === 'ac' || ctx.save === 'Reflex') {
    const clumsy = valueOf('Clumsy')
    if (clumsy) status('Clumsy', clumsy)
    else if (on.has('Encumbered')) status('Encumbered (clumsy 1)', 1)
  }
  if (ctx.attr === 'STR') status('Enfeebled', valueOf('Enfeebled'))
  if (ctx.attr === 'CON' || ctx.save === 'Fortitude') status('Drained', valueOf('Drained'))
  if (ctx.attr === 'INT' || ctx.attr === 'WIS' || ctx.attr === 'CHA' || ctx.save === 'Will')
    if (isCheckOrDc) status('Stupefied', valueOf('Stupefied'))
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

/**
 * A number after conditions, active effects and runes, with what changed it for its tooltip.
 * `extra` are the roll's own modifiers, stacked with the rest (a bomb's item bonus).
 */
export function adjusted(s: Pf2eSheet, base: number, ctx: Pf2eStatContext, extra: Pf2eMod[] = []) {
  const { total, applied } = stackMods([
    ...conditionMods(s, ctx),
    ...effectMods(s, ctx),
    ...runeMods(s, ctx.kind, ctx.weapon),
    ...extra,
  ])
  return {
    value: base + total,
    changed: total !== 0,
    note: applied
      .map((m) => `${m.value > 0 ? '+' : '−'}${Math.abs(m.value)} ${m.source}`)
      .join(', '),
    applied,
  }
}

/** A petrified hero is an object with AC 9 (Player Core p. 445). */
const PETRIFIED_AC = 9

/** The raised shield's modifier's source in `effectMods`. */
const RAISED_SHIELD = 'Raised shield'

/**
 * AC now (p. 274, pp. 442–447): the sheet's AC after conditions, active effects, runes and a
 * raised, unbroken shield's own bonus; a petrified hero's is the object's 9.
 */
export function acNow(s: Pf2eSheet): { value: number; changed: boolean; note: string } {
  if (activeConditions(s).has('Petrified'))
    return { value: PETRIFIED_AC, changed: s.ac !== PETRIFIED_AC, note: 'Petrified: an object' }
  return adjusted(s, s.ac, { kind: 'ac' })
}

/**
 * What the battle board needs to work out `acNow` from the roster when only conditions and
 * the shield change there (the GM's condition picker, a closed sheet): the AC modifiers that
 * aren't from conditions or the raised shield, and the conditions effects give (Enlarge's
 * clumsy 1). The sheet editor keeps it on the sheet as `acParts`.
 */
export type Pf2eAcParts = NonNullable<Pf2eSheet['acParts']>

export function acParts(s: Pf2eSheet): Pf2eAcParts {
  return {
    mods: [
      ...effectMods(s, { kind: 'ac' }).filter((m) => m.source !== RAISED_SHIELD),
      ...runeMods(s, 'ac'),
    ],
    given: Object.fromEntries(effectConditions(s)),
  }
}

/** The fields of a roster summary or hero card that `acFromParts` reads. */
export interface Pf2eAcSource {
  ac?: number
  acParts?: Pf2eAcParts
  conditions?: string[]
  conditionValues?: Record<string, number>
  shield?: Partial<Pf2eSheet['shield']> | null
}

/**
 * `acNow` from a roster summary or hero card: the saved `acParts` with the conditions and the
 * shield as they are now, stacked as the sheet stacks them. Without `acParts` (a sheet not
 * opened since) the effects' part is missing; conditions and the shield still count.
 */
export function acFromParts(src: Pf2eAcSource): number | undefined {
  if (typeof src.ac !== 'number') return undefined
  const given = src.acParts?.given ?? {}
  const own = src.conditions ?? []
  const on = withGiven([...own, ...Object.keys(given)])
  if (on.has('Petrified')) return PETRIFIED_AC
  const value = (name: string) =>
    Math.max(
      own.includes(name) ? Math.max(1, src.conditionValues?.[name] ?? 1) : 0,
      given[name] ?? 0,
    )
  const shield = { name: '', hardness: 0, hp: 0, hpMax: 0, bt: 0, raised: false, ...src.shield }
  const raised = raisedShieldBonus({ shield } as Pf2eSheet)
  const { total } = stackMods([
    ...modsOf(on, value, { kind: 'ac' }),
    ...(src.acParts?.mods ?? []),
    ...(raised ? [{ value: raised, type: 'circumstance' as const, source: RAISED_SHIELD }] : []),
  ])
  return src.ac + total
}

/**
 * The Initiative modifier (p. 436): Perception after conditions and initiative bonuses
 * (Incredible Initiative), as the sheet's turn tracker and the battle board roll it.
 */
export function initiativeCheck(s: Pf2eSheet) {
  const p = s.saves.find((x) => x.label === 'Perception')
  return adjusted(s, p?.value ?? 0, { kind: 'perception', attr: 'WIS', initiative: true })
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
  if (s.conditionEnds?.[name]) setPf2eConditionEnd(s, name, 'manual')
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

/** The damage Shield Block can be used against (Player Core p. 262). */
const BLOCKABLE = ['bludgeoning', 'piercing', 'slashing']

/** Whether the hero has Shield Block: the feat (or the class feature), or a shield granting it. */
export const hasShieldBlock = (s: Pf2eSheet) =>
  s.feats.some((f) => f.name.trim().toLowerCase() === 'shield block') ||
  s.inventory.some((i) => i.pf2e?.shieldBlock && i.pf2e.carry === 'held')

/**
 * Why the hero can't Shield Block this damage, or '' (Player Core p. 262): the feat or a shield
 * that grants it, a raised shield that isn't broken, physical damage from an attack
 * (bludgeoning, piercing or slashing; untyped damage is taken to be), and the reaction unspent.
 */
export function shieldBlockProblem(s: Pf2eSheet, types: (string | undefined)[] = []) {
  if (!s.shield.name) return 'No shield.'
  if (!s.shield.raised) return 'Raise your shield first.'
  if (shieldBroken(s)) return 'Your shield is broken.'
  if (!hasShieldBlock(s)) return 'You need the Shield Block feat.'
  const typed = types.filter(Boolean).map((t) => t!.toLowerCase())
  if (typed.length && !typed.some((t) => BLOCKABLE.includes(t)))
    return 'Shield Block works against physical damage (bludgeoning, piercing or slashing).'
  if (s.turn && !s.turn.reaction) return 'Your reaction is spent.'
  return ''
}

/**
 * Take damage (p. 410): Shield Block first (it spends the reaction), then temp HP, then HP.
 * At 0 HP you're knocked out with dying 1 (2 on a crit) plus your wounded value; damage while
 * dying takes temp HP first and raises dying by 1 (2 on a crit) only if some gets through.
 * One blow of at least double your max HP kills outright (massive damage, p. 412); it's
 * counted after Shield Block, as that's the damage the hero takes.
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
    : [
        {
          amount,
          ...(o.type ? { type: o.type } : {}),
          spell: o.spell,
          ...(o.tradition ? { tradition: o.tradition } : {}),
          persistent: o.persistent,
        },
      ]
  const defended = typed ? afterDefenses(s, parts) : undefined
  let left = defended?.total ?? Math.max(0, Math.floor(parts[0]?.amount ?? 0))
  const kind = defended?.type ?? ''
  const notes: string[] = [...(defended?.notes ?? [])]
  const blockProblem = o.shieldBlock
    ? shieldBlockProblem(
        s,
        parts.map((p) => p.type),
      )
    : ''
  if (blockProblem) notes.push(`No Shield Block: ${blockProblem}`)
  else if (o.shieldBlock) {
    if (s.turn) s.turn.reaction = false
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
    const absorbed = Math.min(s.tempHp, left)
    s.tempHp -= absorbed
    left -= absorbed
    if (absorbed) notes.push(`Temporary HP took ${absorbed}.`)
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

// --- When conditions end ------------------------------------------------------------

/**
 * When a condition the player set goes away. Most PF2e conditions last as long as the effect
 * that gave them says (pp. 442–447), so the player picks it; none is the default.
 */
export const PF2E_END_LABELS: Record<Pf2eConditionEnd | 'manual', string> = {
  turnStart: 'at the start of your next turn',
  turnEnd: 'at the end of your next turn',
  encounter: 'when the encounter ends',
  manual: 'when you remove it',
}

/** Conditions the rules count down by themselves, with how (no end to pick). */
export const PF2E_AUTO_ENDS: Record<string, string> = {
  Frightened: 'Drops by 1 at the end of each of your turns (p. 444).',
}

export function setPf2eConditionEnd(s: Pf2eSheet, name: string, end: Pf2eConditionEnd | 'manual') {
  const ends = { ...s.conditionEnds }
  if (end === 'manual') delete ends[name]
  else ends[name] = end
  s.conditionEnds = ends
  // Set during the hero's own turn, "the end of your next turn" skips this turn's end.
  const held = (s.conditionHold ?? []).filter((n) => n !== name)
  if (end === 'turnEnd' && s.turn?.active) held.push(name)
  s.conditionHold = held
}

/** Takes off the conditions set to end now; the line says which. */
export function clearPf2eConditionsAt(s: Pf2eSheet, when: Pf2eConditionEnd): string {
  const held = when === 'turnEnd' ? new Set(s.conditionHold ?? []) : new Set<string>()
  if (held.size) s.conditionHold = []
  const ending = Object.entries(s.conditionEnds ?? {})
    .filter(([name, end]) => end === when && s.conditions.includes(name) && !held.has(name))
    .map(([name]) => name)
  for (const name of ending) {
    removeCondition(s, name)
    if (s.conditionValues) delete s.conditionValues[name]
  }
  return ending.length ? `No longer ${ending.join(' or ').toLowerCase()}.` : ''
}

/**
 * What the active conditions do to the hero's numbers, a line each (AC, saves, Perception,
 * attacks), with saves that change alike on one line; then Speed and actions.
 */
export function pf2eConditionSummary(
  s: Pf2eSheet,
  speed?: { changed: boolean; text: string; note: string },
) {
  const line = (label: string, ctx: Pf2eStatContext) => {
    const { total, applied } = stackMods(conditionMods(s, ctx))
    if (!total) return null
    const why = applied
      .map((m) => `${m.value > 0 ? '+' : '−'}${Math.abs(m.value)} ${m.source}`)
      .join(', ')
    return { label, text: `${total > 0 ? '+' : '−'}${Math.abs(total)} (${why})` }
  }
  const saves = [
    line('Fortitude', { kind: 'save', attr: 'CON', save: 'Fortitude' }),
    line('Reflex', { kind: 'save', attr: 'DEX', save: 'Reflex' }),
    line('Will', { kind: 'save', attr: 'WIS', save: 'Will' }),
  ]
  const sameSaves = saves.every((x) => x && x.text === saves[0]?.text)
  const rows = [
    line('AC', { kind: 'ac' }),
    ...(sameSaves ? [saves[0] && { label: 'Saves', text: saves[0].text }] : saves),
    line('Perception', { kind: 'perception', attr: 'WIS' }),
    line('Melee attacks', { kind: 'attack', attr: 'STR', melee: true }),
    line('Ranged attacks', { kind: 'attack', attr: 'DEX' }),
  ]
  const out = rows.flatMap((r) => (r ? [`${r.label} ${r.text}`] : []))
  if (speed?.changed) out.push(`Speed ${speed.text} (${speed.note})`)
  const on = activeConditions(s)
  const slowed = conditionValue(s, 'Slowed')
  if (on.has('Quickened')) out.push('Quickened: 1 extra action at the start of your turn')
  if (slowed)
    out.push(
      `Slowed ${slowed}: ${slowed} fewer action${slowed === 1 ? '' : 's'} at the start of your turn`,
    )
  const stopped = ['Paralyzed', 'Petrified', 'Unconscious', 'Stunned'].find((c) => on.has(c))
  if (stopped) out.push(`${stopped}: you can’t act`)
  return out
}

// --- Resting and coming back -----------------------------------------------------------

/**
 * A full night's rest (8 hours, Player Core p. 439): HP back equal to the Constitution
 * modifier (at least 1) times the level; doomed and drained drop by 1 and fatigue ends
 * (pp. 443–444); wounded ends once at full HP after resting (p. 447). Daily preparations
 * (utils/pf2eSpells.ts) follow it.
 */
export function nightsRest(s: Pf2eSheet, level: number): string {
  if (isDead(s)) return DEAD
  const notes: string[] = []
  const amount = Math.max(1, s.attrs.CON) * Math.max(1, level)
  const was = s.hp
  const healed = heal(s, amount)
  notes.push(
    `A night's rest: ${s.hp - was ? `regained ${s.hp - was} HP` : 'HP already full'}, ${s.hp}/${s.hpMax}.`,
  )
  if (/No longer dying/.test(healed)) notes.push(`Wounded ${s.wounded}.`)
  if ((s.doomed ?? 0) > 0) {
    s.doomed = (s.doomed ?? 0) - 1
    notes.push(s.doomed ? `Doomed ${s.doomed}.` : 'No longer doomed.')
  }
  const locked = s.conditionsLocked ?? []
  const drained =
    s.conditions.includes('Drained') && !locked.includes('Drained')
      ? conditionValue(s, 'Drained')
      : 0
  if (drained) {
    if (drained > 1) s.conditionValues = { ...s.conditionValues, Drained: drained - 1 }
    else {
      removeCondition(s, 'Drained')
      if (s.conditionValues) delete s.conditionValues.Drained
    }
    notes.push(drained > 1 ? `Drained ${drained - 1}.` : 'No longer drained.')
  }
  if (s.conditions.includes('Fatigued')) {
    removeCondition(s, 'Fatigued')
    notes.push('No longer fatigued.')
  }
  if (s.wounded > 0 && s.hp === s.hpMax) {
    s.wounded = 0
    notes.push('Wounded ends.')
  }
  return notes.join(' ')
}

/** Resurrect's lasting conditions on a success (Player Core p. 394), for a week. */
const RESURRECTED = ['Clumsy', 'Drained', 'Enfeebled']

/**
 * Back from the dead by the Resurrect ritual's success (Player Core p. 394): 1 HP, no spells
 * prepared and no points in any pool, and clumsy 1, drained 1 and enfeebled 1 for a week. Dying,
 * wounded and the death-related conditions clear; doomed stays, kept short of death.
 */
export function resurrect(s: Pf2eSheet): string {
  if (!isDead(s)) return 'Your hero is alive.'
  s.dying = 0
  s.wounded = 0
  s.doomed = Math.min(s.doomed ?? 0, Math.max(0, baseDeathAt(s) - 1))
  s.hp = Math.min(1, s.hpMax)
  s.tempHp = 0
  s.persistent = []
  removeCondition(s, 'Unconscious')
  s.conditionsLocked = [...new Set([...(s.conditionsLocked ?? []), ...RESURRECTED])]
  for (const name of RESURRECTED) {
    if (!s.conditions.includes(name)) s.conditions = [...s.conditions, name]
    s.conditionValues = {
      ...s.conditionValues,
      [name]: Math.max(1, s.conditionValues?.[name] ?? 1),
    }
  }
  s.focus.current = 0
  for (const c of [...(s.spellcasting ? [s.spellcasting] : []), ...(s.archetypeCasting ?? [])]) {
    for (const r of c.slots) {
      r.used = r.max
      for (const p of r.prepared ?? []) p.id = null
    }
    if (c.font) c.font.used = c.font.max
  }
  return 'Resurrected (Player Core p. 394): back at 1 HP with clumsy 1, drained 1 and enfeebled 1 for a week, which nothing removes or lowers before then. No spells prepared and no Focus Points until your next daily preparations.'
}

// --- Checks: breakdown, what a skill is for, fortune and misfortune ----------------------

const ATTR_FULL: Record<Pf2eAttr, string> = {
  STR: 'Strength',
  DEX: 'Dexterity',
  CON: 'Constitution',
  INT: 'Intelligence',
  WIS: 'Wisdom',
  CHA: 'Charisma',
}
const RANK_WORD: Record<Pf2eRank, string> = {
  U: 'Untrained',
  T: 'Trained',
  E: 'Expert',
  M: 'Master',
  L: 'Legendary',
}

/**
 * Where a check's modifier comes from, a line each, for its tooltip (Player Core pp. 11, 400):
 * the attribute, the proficiency (level + 2/4/6/8, untrained +0), item and other bonuses the
 * sheet's number holds beyond those two, then each bonus and penalty applied now with its type.
 */
export function checkBreakdown(
  s: Pf2eSheet,
  row: { value: number; rank: Pf2eRank; attr?: Pf2eAttr },
  ctx: Pf2eStatContext,
  level: number,
): { value: number; lines: string[] } {
  const pm = (n: number) => (n < 0 ? `−${-n}` : `+${n}`)
  const now = adjusted(s, row.value, ctx)
  const attr = row.attr ?? ctx.attr
  const attrMod = attr ? s.attrs[attr] : 0
  const prof = proficiency(row.rank, level)
  const other = row.value - attrMod - prof
  const lines = [
    ...(attr ? [`${ATTR_FULL[attr]} ${pm(attrMod)}`] : []),
    row.rank === 'U'
      ? 'Untrained +0'
      : `${RANK_WORD[row.rank]} ${pm(prof)} (level ${level} + ${prof - level})`,
    ...(other ? [`Item and other ${pm(other)}`] : []),
    ...now.applied.map((m) => `${m.source} ${pm(m.value)} ${m.type}`),
  ]
  return { value: now.value, lines }
}

/**
 * What a skill, save or Perception is for, from Player Core (`data/pf2e/skills.ts`): the
 * book's opening line and its skill actions, untrained and trained. Lore skills share Lore's.
 */
export function skillUses(name: string): string {
  const info = PF2E_SKILLS[name] ?? (/lore$/i.test(name) ? PF2E_SKILLS.Lore : undefined)
  if (!info) return ''
  const acts = [
    info.untrained?.length ? `Untrained: ${info.untrained.join(', ')}.` : '',
    info.trained?.length ? `Trained: ${info.trained.join(', ')}.` : '',
  ].filter(Boolean)
  const extra = name === 'Perception' ? ' It also rolls your initiative (p. 436).' : ''
  return [`${info.what}${extra}`, ...acts, `(Player Core p. ${info.page})`].join(' ')
}

/** Normal, or one of fortune and misfortune (Player Core p. 400). */
export type Pf2eFortune = 'normal' | 'fortune' | 'misfortune'

export interface Pf2eCheckRoll {
  /** Against this DC, for the degree of success (p. 401). */
  dc?: number | null
  fortune?: Pf2eFortune
  /** The d20 the player rolled (Manual dice), instead of rolling it. */
  d20?: number
  /** A Hero Point reroll (p. 413), named in the line. */
  reroll?: boolean
  rng?: Rng
}

/**
 * A check, save or Perception roll (pp. 400–401): fortune rolls twice and keeps the higher,
 * misfortune the lower; both cancel out, and a typed d20 is taken as it is. With a DC it
 * says the degree, a save's after the hero's upgrades (Juggernaut) and with the notes that
 * hold only against some effects (Bravery). The tray shows the dice and the outcome.
 */
export function rollPf2eCheck(
  s: Pf2eSheet,
  name: string,
  bonus: number,
  o: Pf2eCheckRoll = {},
): { line: string; total: number; d20: number; degree?: Pf2eDegree } {
  const fortune = o.fortune ?? 'normal'
  let r: AttackRoll
  if (o.d20 !== undefined) r = typedCheck(o.d20, bonus)
  else if (fortune === 'normal') r = rollCheck(bonus, o.rng)
  else r = rollCheckTwice(bonus, fortune === 'fortune' ? 'higher' : 'lower', o.rng)
  const twice = 'rolls' in r ? ` (${fortune}: ${(r.rolls as number[]).join(' and ')})` : ''
  const nat = r.natural ? `, natural ${r.natural}` : ''
  const how = o.reroll ? ' (Hero Point reroll)' : ''
  const head = `${name}${how}: ${r.total} (${r.d20} ${sign(bonus)}${nat})${twice}`
  if (!o.dc) {
    showOutcome({ label: name, total: r.total, detail: head })
    return { line: head, total: r.total, d20: r.d20 }
  }
  const rolled = degreeOf(r.total, r.d20, o.dc)
  const save = name === 'Fortitude' || name === 'Reflex' || name === 'Will' ? name : null
  const shift = save ? shiftedDegree(s, save, rolled) : { degree: rolled, notes: [] as string[] }
  const by = 'by' in shift && shift.by ? ` → ${shift.degree} (${shift.by})` : ''
  const notes = shift.notes.length ? ` ${shift.notes.join('; ')}.` : ''
  const line = `${head} vs DC ${o.dc}: ${rolled}${by}.${notes}`
  showOutcome({
    label: save ? `${name} save` : name,
    total: r.total,
    detail: line,
    degree: shift.degree.replace(/^\w/, (c) => c.toUpperCase()),
  })
  return { line, total: r.total, d20: r.d20, degree: shift.degree }
}

/**
 * Spends a Hero Point to reroll a check (Player Core p. 413): a fortune effect, so not on a
 * roll that already had one; the second result stands. Why not, or ''.
 */
export function heroRerollProblem(s: Pf2eSheet, fortune: Pf2eFortune): string {
  if (s.heroPoints < 1) return 'No Hero Points left.'
  if (fortune === 'fortune') return 'That roll already had a fortune effect.'
  return ''
}
