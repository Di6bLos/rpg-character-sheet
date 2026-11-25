// Pathfinder 2e abilities in play: the turn (Player Core pp. 436–437: three actions and a
// reaction at the start of your turn, quickened, slowed and stunned, frightened dropping at
// the end of it), how often an ability can be used (once per round, per 10 minutes, per day,
// per target), the multiple attack penalty counted over the turn (p. 402), and what a Use
// does: pay its actions, roll its check against a DC with the hero's skill through `adjusted`
// (degrees of success p. 401), roll its damage or healing at the hero's level, give temporary
// Hit Points and turn on the bonus it gives the hero. Rules come from utils/pf2eAbilityRules.ts;
// the Actions panel (components/pf2e/SheetActions.vue) calls these and `say()`s the result.
import type { Pf2eActionDef, Pf2eFeatDef } from '~/data/pf2e/types'
import type { Pf2eAttr, Pf2eFeat, Pf2eRank, Pf2eSheet } from '~/types/sheets'
import { type Rng, parseDice, rollAttack, rollDice, sign } from '~/utils/dice'
import {
  type Pf2eAbilityRules,
  type Pf2eCost,
  type Pf2eDegreeName,
  type Pf2eFrequency,
  type Pf2ePeriod,
  amountAt,
  diceAt,
} from '~/utils/pf2eAbilityRules'
import { pf2eEffectDef, endPf2eEffects, mapPenalties, toggleEffect } from '~/utils/pf2eEffects'
import { adjusted, conditionValue, degreeOf, heal, isDead } from '~/utils/pf2ePlay'

type Turn = NonNullable<Pf2eSheet['turn']>

export const newTurn = (): Turn => ({
  active: false,
  actions: 0,
  reaction: true,
  attacks: 0,
  round: 0,
})

const turnOf = (s: Pf2eSheet) => (s.turn ??= newTurn())

function setCondition(s: Pf2eSheet, name: string, value: number) {
  if (value <= 0) {
    s.conditions = s.conditions.filter((c) => c !== name)
    if (s.conditionValues) delete s.conditionValues[name]
    return
  }
  if (!s.conditions.includes(name)) s.conditions = [...s.conditions, name]
  s.conditionValues = { ...s.conditionValues, [name]: value }
}

/** Uses that come back at the start of your turn: once per turn and once per round. */
const TURN_PERIODS: Pf2ePeriod[] = ['turn', 'round']

/**
 * Start your turn (p. 436): effects lasting "until the start of your next turn" end, a raised
 * shield lowers (p. 419), and you regain 3 actions and your reaction. Quickened adds one;
 * stunned takes actions away and drops by as many, and slowed takes the rest of its value
 * (stunned overrides slowed, p. 446). Paralyzed, unconscious or dead heroes can't act.
 */
export function startPf2eTurn(s: Pf2eSheet): string {
  const t = turnOf(s)
  const notes: string[] = []
  notes.push(...endPf2eEffects(s, ['startOfTurn', 'trigger']))
  if (s.shield.raised) {
    s.shield.raised = false
    notes.push('Your shield lowers.')
  }
  const cantAct =
    isDead(s) || s.conditions.includes('Paralyzed') || s.conditions.includes('Unconscious')
  let actions = 3 + (s.conditions.includes('Quickened') ? 1 : 0)
  const stunned = conditionValue(s, 'Stunned')
  const stunLoss = Math.min(stunned, actions)
  if (stunned) {
    setCondition(s, 'Stunned', stunned - stunLoss)
    notes.push(`Stunned: ${stunLoss} action${stunLoss === 1 ? '' : 's'} lost.`)
  }
  const slowLoss = Math.max(0, conditionValue(s, 'Slowed') - stunLoss)
  if (slowLoss) notes.push(`Slowed: ${slowLoss} fewer.`)
  actions = cantAct ? 0 : Math.max(0, actions - stunLoss - slowLoss)
  Object.assign(t, { active: true, actions, reaction: !cantAct, attacks: 0, flourish: false })
  t.round += 1
  refreshUses(s, TURN_PERIODS)
  if (s.dying > 0 && !isDead(s)) notes.push('Dying: roll your recovery check.')
  return [
    `Round ${t.round}: your turn, ${actions} action${actions === 1 ? '' : 's'} and your reaction.`,
    ...notes,
  ].join(' ')
}

/**
 * End your turn (p. 437): frightened drops by 1, effects lasting until the end of your turn
 * end (and those "until the end of your next turn" begun before this turn), and the reminder
 * for persistent damage.
 */
export function endPf2eTurn(s: Pf2eSheet): string {
  const t = turnOf(s)
  const notes: string[] = []
  const frightened = conditionValue(s, 'Frightened')
  if (frightened && s.conditions.includes('Frightened')) {
    setCondition(s, 'Frightened', frightened - 1)
    notes.push(frightened > 1 ? `Frightened ${frightened - 1}.` : 'No longer frightened.')
  }
  const carry = new Set(t.carry ?? [])
  const later = (s.effects?.on ?? []).filter((n) => carry.has(n))
  notes.push(...endPf2eEffects(s, ['endOfTurn', 'trigger']))
  if (s.effects)
    for (const name of s.effects.on) {
      if (pf2eEffectDef(s, name)?.ends === 'endOfNextTurn' && !later.includes(name))
        notes.push(toggleEffect(s, name, 0))
    }
  delete t.carry
  t.active = false
  t.actions = 0
  return ['Turn ended.', ...notes, 'Take any persistent damage now.'].join(' ')
}

/** End of the encounter: the turn tracker clears and effects that last a fight end. */
export function endPf2eEncounter(s: Pf2eSheet): string {
  const ended = endPf2eEffects(s, [
    'startOfTurn',
    'endOfTurn',
    'endOfNextTurn',
    'trigger',
    'encounter',
    'minute',
  ])
  s.turn = newTurn()
  refreshUses(s, ['turn', 'round', 'minute'])
  return ['Encounter over.', ...ended].join(' ')
}

/** Time passing out of combat: uses of that period and shorter ones come back. */
export function timePasses(s: Pf2eSheet, period: 'minute' | '10min' | 'hour'): string {
  const periods: Pf2ePeriod[] =
    period === 'minute'
      ? ['turn', 'round', 'minute']
      : period === '10min'
        ? ['turn', 'round', 'minute', '10min']
        : ['turn', 'round', 'minute', '10min', 'hour']
  refreshUses(s, periods)
  const ended = endPf2eEffects(s, [
    'startOfTurn',
    'endOfTurn',
    'endOfNextTurn',
    'trigger',
    'encounter',
    'minute',
  ])
  const label = { minute: '1 minute', '10min': '10 minutes', hour: '1 hour' }[period]
  return [
    `${label} passes: uses per ${label === '1 hour' ? 'hour' : 'minute'} and shorter come back.`,
    ...ended,
  ].join(' ')
}

/** The attack the next roll is (0, 1, 2) for the multiple attack penalty this turn. */
export const mapIndex = (s: Pf2eSheet) => (s.turn?.active ? Math.min(2, s.turn.attacks) : 0)

/** Attacks made, for the multiple attack penalty: Vicious Swing counts 2, Reactive Strike 0. */
export function attacked(s: Pf2eSheet, count = 1) {
  if (s.turn?.active) s.turn.attacks += count
}

export function actionCostLabel(cost: Pf2eCost | undefined): string {
  if (!cost) return ''
  if (cost.kind === 'reaction') return 'Reaction'
  if (cost.kind === 'free') return 'Free action'
  if (cost.kind === 'time') return cost.text
  const word = (n: number) =>
    ['', 'One action', 'Two actions', 'Three actions'][n] ?? `${n} actions`
  return cost.min === cost.max
    ? word(cost.min)
    : `${word(cost.min)} to ${word(cost.max).toLowerCase()}`
}

/** The glyphs for a cost: ◆, ◆◆, ◆◆◆, ↺, ◇, or ◆–◆◆◆. */
export function costGlyph(cost: Pf2eCost | undefined): string {
  if (!cost) return ''
  if (cost.kind === 'reaction') return '↺'
  if (cost.kind === 'free') return '◇'
  if (cost.kind === 'time') return ''
  const g = (n: number) => '◆'.repeat(n)
  return cost.min === cost.max ? g(cost.min) : `${g(cost.min)}–${g(cost.max)}`
}

export type Pf2eActionGroup = 'actions' | 'reactions' | 'free' | 'activities' | 'limited'

/**
 * The Actions panel's group for a cost: actions, reactions, free actions, activities (time),
 * and limited uses without an action of their own (innate spells once per day).
 */
export function groupOf(cost: Pf2eCost | undefined): Pf2eActionGroup {
  if (!cost) return 'limited'
  if (cost.kind === 'reaction') return 'reactions'
  if (cost.kind === 'free') return 'free'
  if (cost.kind === 'time') return 'activities'
  return 'actions'
}

/** One row of the Actions panel: an ability, or an action written inside one. */
export interface Pf2eActionEntry {
  key: string
  name: string
  /** The feat it's written in, for an action inside one. */
  from?: string
  rules: Pf2eAbilityRules
  /** The action whose check it makes ("you can Demoralize"), with that check. */
  via?: { name: string; rules: Pf2eAbilityRules }
  summary: string
  text: string
}

/** A row's choices: skill, Treat Wounds tier, weapon, actions spent, healing on yourself. */
export interface Pf2eRowState {
  skill?: string
  tier?: Pf2eRank
  weapon?: number
  actions?: number
  onSelf?: boolean
  /** The Strike the last use made, for its damage buttons. */
  struck?: { index: number; extraDie: number }
}

// --- Uses ------------------------------------------------------------------------

const PERIOD_WORD: Record<Pf2ePeriod, string> = {
  turn: 'turn',
  round: 'round',
  minute: 'minute',
  '10min': '10 minutes',
  hour: 'hour',
  day: 'day',
  week: 'week',
}

/** The key one use is stored under in `sheet.used`. */
export function useKey(name: string, f: Pf2eFrequency, target = '') {
  const base = f.period === 'day' || f.period === 'week' ? name : `${name}@${f.period}`
  return f.perTarget && target.trim() ? `${base}:${target.trim().toLowerCase()}` : base
}

/** Uses left of a limited ability (for a per-target one, against that target). */
export function usesLeft(s: Pf2eSheet, name: string, f: Pf2eFrequency, target = '') {
  if (f.perTarget && !target.trim()) return f.times
  const key = useKey(name, f, target)
  return Math.max(0, f.times - (s.used ?? []).filter((u) => u === key).length)
}

export function spendUse(s: Pf2eSheet, name: string, f: Pf2eFrequency, target = '') {
  if (f.perTarget && !target.trim()) return
  s.used = [...(s.used ?? []), useKey(name, f, target)]
}

/** Uses of these periods come back. Daily ones come back only with daily preparations. */
export function refreshUses(s: Pf2eSheet, periods: Pf2ePeriod[]) {
  if (!s.used?.length) return
  s.used = s.used.filter((u) => !periods.some((p) => new RegExp(`@${p}(?::|$)`).test(u)))
}

export const frequencyLabel = (f: Pf2eFrequency) =>
  `${f.times === 1 ? 'Once' : `${f.times}×`} per ${PERIOD_WORD[f.period]}${f.perTarget ? ' per target' : ''}`

// --- Using an ability -------------------------------------------------------------

/** Why the hero can't use it right now, or '' when they can. */
export function blockedReason(
  s: Pf2eSheet,
  r: Pf2eAbilityRules,
  opts: { name: string; target?: string; actions?: number } = { name: r.name },
): string {
  if (isDead(s)) return 'Your hero is dead.'
  if (r.frequency && usesLeft(s, opts.name, r.frequency, opts.target) <= 0)
    return `Used: ${frequencyLabel(r.frequency).toLowerCase()}`
  const t = s.turn
  if (!t?.active) {
    if (r.cost?.kind === 'reaction' && t && !t.reaction) return 'Reaction already used this round'
    return ''
  }
  if (r.cost?.kind === 'reaction' && !t.reaction) return 'Reaction already used this round'
  if (r.cost?.kind === 'actions') {
    const n = opts.actions ?? r.cost.min
    if (t.actions < n) return `Needs ${n} action${n === 1 ? '' : 's'}; ${t.actions} left`
  }
  if (r.traits.some((x) => x.toLowerCase() === 'flourish') && t.flourish)
    return 'You’ve used a flourish action this turn'
  return ''
}

/** Pays for a use: actions or the reaction while the turn tracker runs, flourish, frequency. */
export function payFor(
  s: Pf2eSheet,
  r: Pf2eAbilityRules,
  opts: { name: string; target?: string; actions?: number },
) {
  const t = s.turn
  if (t?.active && r.cost?.kind === 'actions') t.actions -= opts.actions ?? r.cost.min
  if (t && r.cost?.kind === 'reaction') t.reaction = false
  if (t?.active && r.traits.some((x) => x.toLowerCase() === 'flourish')) t.flourish = true
  if (r.frequency) spendUse(s, opts.name, r.frequency, opts.target)
}

export interface Pf2eCheckChoice {
  /** A skill name, "Perception", or a save. */
  skill: string
  bonus: number
  note: string
}

const SKILL_ATTR: Record<string, Pf2eAttr> = {
  Acrobatics: 'DEX',
  Arcana: 'INT',
  Athletics: 'STR',
  Crafting: 'INT',
  Deception: 'CHA',
  Diplomacy: 'CHA',
  Intimidation: 'CHA',
  Medicine: 'WIS',
  Nature: 'WIS',
  Occultism: 'INT',
  Performance: 'CHA',
  Religion: 'WIS',
  Society: 'INT',
  Stealth: 'DEX',
  Survival: 'WIS',
  Thievery: 'DEX',
}

/** The hero's rank in a skill (Perception from the saves row). */
export function skillRank(s: Pf2eSheet, skill: string): Pf2eRank {
  if (skill === 'Perception') return s.saves.find((x) => x.label === 'Perception')?.rank ?? 'U'
  return s.skills.find((x) => x.name.toLowerCase() === skill.toLowerCase())?.rank ?? 'U'
}

/** The skills a check can use, as the hero has them, best first. */
export function checkChoices(s: Pf2eSheet, r: Pf2eAbilityRules, action: string): Pf2eCheckChoice[] {
  const skills = r.check?.skills ?? []
  const names =
    skills[0] === 'any'
      ? s.skills.map((x) => x.name)
      : skills.flatMap((k) =>
          k === 'Lore' ? s.skills.filter((x) => x.name.endsWith('Lore')).map((x) => x.name) : [k],
        )
  return names
    .flatMap((name): Pf2eCheckChoice[] => {
      if (name === 'Perception') {
        const p = s.saves.find((x) => x.label === 'Perception')
        if (!p) return []
        const now = adjusted(s, p.value, { kind: 'perception', attr: 'WIS', action })
        return [{ skill: name, bonus: now.value, note: now.note }]
      }
      const row = s.skills.find((x) => x.name.toLowerCase() === name.toLowerCase())
      if (!row) return []
      const now = adjusted(s, row.value, {
        kind: 'skill',
        attr: row.attr ?? SKILL_ATTR[row.name],
        skill: row.name,
        action,
      })
      return [{ skill: row.name, bonus: now.value, note: now.note }]
    })
    .sort((a, b) => b.bonus - a.bonus)
}

const DEGREE_WORD: Record<Pf2eDegreeName, string> = {
  'critical success': 'Critical success',
  success: 'Success',
  failure: 'Failure',
  'critical failure': 'Critical failure',
}

/** Rolls dice text at a level ("1d6" → its total), or null when it isn't dice. */
function rollAt(dice: string, level: number, rng?: Rng) {
  const expr = parseDice(dice)
  if (!expr) return null
  return rng ? rollDice(expr, rng).total : rollDice(expr).total
}

export interface Pf2eUseOptions {
  name: string
  level: number
  /** The chosen skill for its check. */
  skill?: string
  /** The target's DC (or AC) for its check; a fixed or tier DC wins. */
  dc?: number | null
  /** Treat Wounds' tier, by rank. */
  tier?: Pf2eRank
  /** Who it's used on, for per-target limits and the log. */
  target?: string
  /** Healing goes to the hero (Treat Wounds on yourself). */
  onSelf?: boolean
  rng?: Rng
}

/**
 * Rolls what an ability rolls, after `payFor`: its check (with the multiple attack penalty if
 * it has the attack trait, counted as an attack) against the DC, the outcome line for the
 * degree, damage or healing for that degree or always, temporary Hit Points, and the bonus it
 * gives the hero turned on. Strikes are rolled by the Strikes composable. Returns the lines.
 */
export function resolveUse(s: Pf2eSheet, r: Pf2eAbilityRules, o: Pf2eUseOptions): string[] {
  const lines: string[] = []
  let degree: Pf2eDegreeName | undefined
  const check = r.check
  if (check && check.skills[0] !== 'flat') {
    const choice =
      checkChoices(s, r, o.name).find((c) => c.skill === o.skill) ?? checkChoices(s, r, o.name)[0]
    if (choice) {
      const attack = !!check.attack
      const penalty = attack ? mapPenalties(s, false)[mapIndex(s)] : 0
      const bonus = choice.bonus - penalty
      if (attack) attacked(s)
      const tier = check.tiers?.find((x) => x.rank === o.tier) ?? check.tiers?.[0]
      const dc = tier?.dc ?? check.dc ?? o.dc ?? null
      const roll = o.rng ? rollAttack(bonus, o.rng) : rollAttack(bonus)
      const nat = roll.natural ? `, natural ${roll.natural}` : ''
      const map = penalty ? `, −${penalty} multiple attack penalty` : ''
      let line = `${choice.skill} ${sign(bonus)}: ${roll.total} (${roll.d20}${nat}${map})`
      if (dc) {
        degree = degreeOf(roll.total, roll.d20, dc)
        const vs = check.against ? `${check.against} ${dc}` : `DC ${dc}`
        line += ` vs ${vs}: ${DEGREE_WORD[degree]}.`
        const out = r.outcomes.find((x) => x.degree === degree)
        if (out) line += ` ${out.text.replace(/\s+/g, ' ')}`
      } else if (check.against) line += ` vs the target's ${check.against}.`
      else line += '.'
      if (choice.note) line += ` (${choice.note})`
      lines.push(line)
      if (tier && degree) {
        const bonusHeal = tier.bonus
        if (degree === 'success' || degree === 'critical success') {
          const dice = degree === 'critical success' ? '4d8' : '2d8'
          const rolled = rollAt(dice, o.level, o.rng)
          if (rolled !== null)
            lines.push(
              healLine(s, rolled + bonusHeal, `${dice}${bonusHeal ? `+${bonusHeal}` : ''}`, o),
            )
        }
      }
    }
  } else if (check?.skills[0] === 'flat' && check.dc) {
    const roll = o.rng ? rollAttack(0, o.rng) : rollAttack(0)
    lines.push(
      `Flat check: ${roll.d20} vs DC ${check.dc}: ${roll.d20 >= check.dc ? 'success' : 'failure'}.`,
    )
  }
  const fits = (d: { degree?: Pf2eDegreeName }) => !d.degree || d.degree === degree
  for (const d of r.damage.filter(fits)) {
    const dice = diceAt(d, o.level)
    const rolled = rollAt(dice, o.level, o.rng)
    if (rolled === null) continue
    const type = [d.persistent ? 'persistent' : '', d.type ?? ''].filter(Boolean).join(' ')
    lines.push(`${rolled} ${type ? `${type} ` : ''}damage (${dice}).`)
  }
  if (!check?.tiers)
    for (const d of r.healing.filter(fits)) {
      const dice = diceAt(d, o.level)
      const rolled = rollAt(dice, o.level, o.rng)
      if (rolled !== null) lines.push(healLine(s, rolled, dice, o))
    }
  const own = pf2eEffectDef(s, r.name)
  const toggle = own?.mode === 'toggle' ? own : pf2eEffectDef(s, `${r.name} (when it applies)`)
  const toggleTemp = toggle?.effects.some((e) => e.kind === 'tempHp')
  if (r.tempHp && !toggleTemp) {
    const amount = amountAt(r.tempHp.amount, o.level, s.attrs.CON)
    if (amount > s.tempHp) s.tempHp = amount
    lines.push(
      `You have ${s.tempHp} temporary Hit Points (the higher of these ${amount} and any you had).`,
    )
  }
  if (toggle?.mode === 'toggle' && !s.effects?.on.includes(toggle.name)) {
    lines.push(toggleEffect(s, toggle.name, o.level))
    const t = s.turn
    if (toggle.ends === 'endOfNextTurn' && t?.active) t.carry = [...(t.carry ?? []), toggle.name]
  }
  const mine = r.conditions.filter((c) => c.self && !c.degree)
  if (mine.length)
    lines.push(
      `You: ${mine.map((c) => `${c.name.toLowerCase()}${c.value ? ` ${c.value}` : ''}`).join(', ')} (set it under Conditions).`,
    )
  return lines
}

function healLine(s: Pf2eSheet, amount: number, dice: string, o: Pf2eUseOptions) {
  if (o.onSelf) return `${heal(s, amount)} (${dice})`
  return `${o.target?.trim() || 'The target'} regains ${amount} Hit Points (${dice}).`
}

// --- Data the sheet's feats lack ----------------------------------------------------

/**
 * Fills in what a sheet's feat is missing from the data (by id, else by name): its action,
 * traits, requirements, trigger and frequency, so older and hand-made sheets get the Actions
 * panel's rules. A class feature named for the feat it grants (Shield Block) takes that feat's
 * action. Returns the patches by feat index.
 */
export function featPatches(
  feats: Pf2eFeat[],
  data: { feats: Pf2eFeatDef[]; actions: Pf2eActionDef[] },
): Map<number, Partial<Pf2eFeat>> {
  const byId = new Map<string, Pf2eFeatDef | Pf2eActionDef>()
  for (const f of data.feats) byId.set(f.id, f)
  for (const a of data.actions) byId.set(a.id, a)
  const byName = new Map<string, Pf2eFeatDef | Pf2eActionDef>()
  for (const f of [...data.feats, ...data.actions]) if (!byName.has(f.name)) byName.set(f.name, f)
  const out = new Map<number, Partial<Pf2eFeat>>()
  feats.forEach((f, i) => {
    if (f.traits) return
    const src = (f.id ? byId.get(f.id) : undefined) ?? byName.get(f.name)
    const patch: Partial<Pf2eFeat> = { traits: src?.traits ?? [] }
    if (src && !f.action && src.actions !== undefined) patch.action = glyph(src.actions)
    if (src && 'requirements' in src && src.requirements && !f.requirements)
      patch.requirements = src.requirements
    if (src && 'trigger' in src && src.trigger && !f.trigger) patch.trigger = src.trigger
    const frequency = (src as Partial<Pf2eFeatDef> | undefined)?.frequency
    if (frequency && !f.frequency) patch.frequency = frequency
    out.set(i, patch)
  })
  return out
}

/** A feat's Cost and Usage lines, which sheets don't store. */
export interface Pf2eStatLines {
  cost?: string
  usage?: string
}

/**
 * The Cost and Usage lines of the hero's feats, class features and options from the data, by
 * id (else by name), by feat index; only feats that have one. Read at runtime so sheets need
 * no new fields.
 */
export function featStatLines(
  feats: Pf2eFeat[],
  records: { id: string; name: string; cost?: string; usage?: string }[],
): Map<number, Pf2eStatLines> {
  const byId = new Map(records.map((r) => [r.id, r]))
  const byName = new Map<string, (typeof records)[number]>()
  for (const r of records) if (!byName.has(r.name)) byName.set(r.name, r)
  const out = new Map<number, Pf2eStatLines>()
  feats.forEach((f, i) => {
    const r = (f.id ? byId.get(f.id) : undefined) ?? byName.get(f.name)
    if (r?.cost || r?.usage)
      out.set(i, { ...(r.cost ? { cost: r.cost } : {}), ...(r.usage ? { usage: r.usage } : {}) })
  })
  return out
}

const GLYPH: Record<string, string> = { 1: '◆', 2: '◆◆', 3: '◆◆◆', reaction: '↺', free: '◇' }
const glyph = (a: string | number) => GLYPH[String(a)] ?? String(a)
