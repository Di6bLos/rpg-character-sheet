// Class features that change how a PF2e hero's actions play out: the swashbuckler's panache,
// bravado and finishers (Player Core 2 pp. 158–166), the champion's reaction by cause (pp. 91–93,
// with Relentless and Exalted Reaction at 9th and 11th), and the sorcerer's blood magic after a
// bloodline or sorcerous gift spell (p. 144, each bloodline pp. 149–152). The Actions panel
// (components/pf2e/SheetActions.vue) and the Spells panel call these; utils/pf2eActions.ts checks
// finishers when it pays for a use.
import type { Pf2eSheet } from '~/types/sheets'
import { type Rng, parseDice, rollDice } from '~/utils/dice'
import type { Pf2eAbilityRules, Pf2eDegreeName } from '~/utils/pf2eAbilityRules'
import { ownEffects, pf2eEffectDef, toggleEffect } from '~/utils/pf2eEffects'

const atLevel = (steps: [number, number][], level: number) =>
  [...steps].reverse().find(([at]) => at <= level)?.[1] ?? 0
const hasTrait = (r: { traits: string[] }, trait: string) =>
  r.traits.some((t) => t.toLowerCase() === trait)
const hasFeat = (s: Pf2eSheet, name: string) => s.feats.some((f) => f.name === name)

// --- Panache, bravado and finishers --------------------------------------------------

/** Panache as the hero has it: for the encounter, or only until the end of their next turn. */
export const PANACHE = 'Panache'
export const BRIEF_PANACHE = 'Panache (until your next turn ends)'

export const hasPanache = (s: Pf2eSheet) =>
  (s.effects?.on ?? []).some((n) => n === PANACHE || n === BRIEF_PANACHE)

/**
 * Why a finisher or attack can't be used now (Player Core 2 p. 163): a finisher needs panache,
 * and after one the hero can't use actions with the attack trait (or Strikes) that turn.
 */
export function finisherBlock(s: Pf2eSheet, r: Pick<Pf2eAbilityRules, 'traits' | 'strike'>) {
  if (hasTrait(r, 'finisher') && !hasPanache(s)) return 'Needs panache'
  if (s.turn?.active && s.turn.finisher && (hasTrait(r, 'attack') || r.strike))
    return 'You used a finisher this turn: no more attacks'
  return ''
}

/** A finisher spends the hero's panache and ends their attacks for the turn (p. 163). */
export function spendFinisher(s: Pf2eSheet, r: Pick<Pf2eAbilityRules, 'traits'>): string {
  if (!hasTrait(r, 'finisher')) return ''
  if (s.turn?.active) s.turn.finisher = true
  const on = (s.effects?.on ?? []).filter((n) => n === PANACHE || n === BRIEF_PANACHE)
  for (const n of on) toggleEffect(s, n, s.level ?? 1)
  return on.length ? 'You lose your panache.' : ''
}

/**
 * Actions with the bravado trait for this hero (p. 158): Tumble Through, plus what their style
 * names ("When you Grapple, Reposition, Shove, or Trip, the action gains the bravado trait").
 */
export function bravadoActions(s: Pf2eSheet): string[] {
  if (!hasFeat(s, PANACHE)) return []
  const out = new Set(['Tumble Through'])
  for (const f of s.feats) {
    const m = /When you (?:use )?([^.]+?), the action gains the bravado trait/.exec(f.desc)
    if (!m) continue
    for (const name of m[1]!.split(/,\s*(?:or\s+)?|\s+or\s+/))
      out.add(name.replace(/^use /, '').trim())
  }
  return [...out]
}

/**
 * A bravado action's result (p. 163): a success gives panache, a failure (not a critical one)
 * panache until the end of the hero's next turn.
 */
export function bravado(s: Pf2eSheet, action: string, degree: Pf2eDegreeName): string {
  if (!bravadoActions(s).includes(action)) return ''
  if (degree === 'critical failure') return ''
  const brief = degree === 'failure'
  if (hasPanache(s) && (brief || s.effects?.on.includes(PANACHE))) return ''
  if (!brief && s.effects?.on.includes(BRIEF_PANACHE)) toggleEffect(s, BRIEF_PANACHE, 1)
  toggleEffect(s, brief ? BRIEF_PANACHE : PANACHE, s.level ?? 1)
  const t = s.turn
  if (brief && t?.active) t.carry = [...(t.carry ?? []), BRIEF_PANACHE]
  return brief
    ? 'Bravado: you gain panache until the end of your next turn.'
    : 'Bravado: you gain panache.'
}

/**
 * Precise strike's finisher damage (p. 158): 2d6 precision, 1d6 more at 5th, 9th, 13th and
 * 17th, as many dice as its Strike bonus. Empty without Precise Strike.
 */
export function finisherDice(s: Pf2eSheet, level: number): string {
  const def = pf2eEffectDef(s, 'Precise Strike')
  if (!def || !ownEffects(s).includes(def)) return ''
  const mod = def.effects.find((e) => e.kind === 'modifier')
  const n = mod?.kind === 'modifier' ? atLevel(mod.byLevel ?? [[1, mod.value]], level) : 0
  return n ? `${n}d6` : ''
}

/** "If you hit, …" sentences of a Strike ability, with precise strike's dice filled in. */
function hitRiders(text: string, finisher: string) {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=\.)\s+/)
    .filter((x) => /^If (?:you hit|this Strike hits|the Strike hits|your Strike hits)\b/i.test(x))
    .filter((x) => !/extra die/i.test(x))
    .map((x) =>
      finisher
        ? x.replace(
            /your precise strike finisher damage/i,
            `your precise strike finisher damage (${finisher})`,
          )
        : x,
    )
}

export interface Pf2eStrikeAfter {
  /** Lines to add after the Strike's attack. */
  lines: string[]
}

/**
 * What a Strike ability adds once its attack is rolled: a finisher's failure effect (Confident
 * Finisher: half the precise strike dice, all of them with Precise Finisher; not on a critical
 * failure, p. 163), "If you hit" riders on a hit (Unbalancing Finisher's off-guard, Bleeding
 * Finisher's persistent bleed), and a champion's Relentless Reaction on Retributive Strike.
 * `degree` is unknown without the target's AC: then each rider reads as conditional.
 */
export function strikeAfter(
  s: Pf2eSheet,
  r: Pf2eAbilityRules,
  text: string,
  level: number,
  degree: Pf2eDegreeName | undefined,
  rng: Rng = Math.random,
): Pf2eStrikeAfter {
  const lines: string[] = []
  const finisher = hasTrait(r, 'finisher') ? finisherDice(s, level) : ''
  const failure = r.outcomes.find((o) => o.degree === 'failure')
  if (failure && finisher && /half your precise strike damage/i.test(failure.text)) {
    const full = hasFeat(s, 'Precise Finisher')
    if (degree === 'failure') {
      const e = parseDice(finisher)
      const rolled = e ? rollDice(e, rng).total : 0
      const dealt = full ? rolled : Math.floor(rolled / 2)
      lines.push(
        `Failure: ${dealt} precision damage of the weapon’s type (${full ? '' : 'half of '}${finisher}${full ? ', Precise Finisher' : ''}).`,
      )
    } else if (!degree)
      lines.push(
        `On a failure: ${full ? '' : 'half of '}${finisher} damage of the weapon’s type${full ? ' (Precise Finisher)' : ''}.`,
      )
  }
  const hit = degree === 'success' || degree === 'critical success'
  const riders = hitRiders(text, finisher)
  if (hit) lines.push(...riders)
  else if (!degree) lines.push(...riders.map((x) => `(${x})`))
  if (r.name === 'Retributive Strike' && relentless(s, level) && (hit || !degree)) {
    const cha = Math.max(0, s.attrs.CHA)
    const line = `Relentless Reaction: the target takes ${cha} persistent spirit damage.`
    lines.push(hit ? line : `(If it hits: ${line.replace(/^Relentless Reaction: /, '')})`)
  }
  return { lines }
}

// --- Champion's reactions (Player Core 2 pp. 91–93) -------------------------------------

/** Relentless Reaction: the cause’s improvement from 9th level; Exalted Reaction from 11th. */
const relentless = (s: Pf2eSheet, level: number) =>
  level >= 9 && (hasFeat(s, 'Relentless Reaction') || s.class.toLowerCase() === 'champion')
const exalted = (s: Pf2eSheet, level: number) =>
  level >= 11 && (hasFeat(s, 'Exalted Reaction') || s.class.toLowerCase() === 'champion')

/** The reactions that protect an ally: resistance 2 + level against the triggering damage. */
const ALLY_REACTIONS = [
  'Retributive Strike',
  'Glimpse of Redemption',
  'Liberating Step',
  'Flash of Grandeur',
]
/** The reactions that answer damage to the champion, and their toggle on later Strikes. */
const SELF_REACTIONS: Record<string, string> = {
  'Selfish Shield': 'Selfish Shield (Strikes)',
  'Destructive Vengeance': 'Destructive Vengeance (Strikes)',
  'Iron Command': 'Iron Command (Strikes)',
}

export const isChampionReaction = (name: string) =>
  ALLY_REACTIONS.includes(name) || name in SELF_REACTIONS

/**
 * A champion's reaction once used: the ally's resistance against the triggering damage (2 + level),
 * each cause's own result, the hero's resistance (Selfish Shield: 2 + half level, Relentless:
 * CHA + half level when CHA is +3 or more), the extra spirit damage on the hero's Strikes
 * against the attacker until the end of their next turn (turned on here), and the 9th and
 * 11th level additions.
 */
export function championReaction(s: Pf2eSheet, name: string, level: number): string[] {
  const lines: string[] = []
  const cha = s.attrs.CHA
  if (ALLY_REACTIONS.includes(name))
    lines.push(
      `Your ally gains resistance ${2 + level} to all damage against the triggering damage.`,
    )
  if (name === 'Glimpse of Redemption')
    lines.push(
      'The enemy repents (your ally is unharmed by the triggering damage) or refuses (the resistance applies, then it is enfeebled 2 until the end of its next turn).',
    )
  if (name === 'Liberating Step')
    lines.push(
      'Your ally can attempt a new save against a grab, restraint, immobilization or paralysis, or Escape as a free action, then Step as a free action.',
    )
  if (name === 'Flash of Grandeur')
    lines.push('Until the end of your next turn, the attacker is affected by revealing light.')
  if (name === 'Destructive Vengeance')
    lines.push('You also take that many more damage from the triggering damage: add it to it.')
  if (name === 'Iron Command')
    lines.push(
      'The enemy kneels (drops prone as a free action) or refuses and takes the mental damage.',
    )
  if (name === 'Selfish Shield') {
    const better = relentless(s, level) && cha >= 3
    const value = (better ? cha : 2) + Math.floor(level / 2)
    if (!s.effects?.on.includes(name)) toggleEffect(s, name, level, value)
    lines.push(
      `You gain resistance ${value} against the triggering damage${better ? ' (Relentless Reaction: CHA + half your level)' : ''}; it’s taken off the next damage you enter.`,
    )
  }
  const strikes = SELF_REACTIONS[name]
  if (strikes && pf2eEffectDef(s, strikes)) {
    if (!s.effects?.on.includes(strikes)) toggleEffect(s, strikes, level)
    const t = s.turn
    if (t?.active) t.carry = [...(t.carry ?? []), strikes]
    lines.push(`${strikes} is on until the end of your next turn (only against that creature).`)
  }
  if (relentless(s, level)) {
    const spirit = `${Math.max(0, cha)} persistent spirit damage`
    if (name === 'Flash of Grandeur')
      lines.push(
        `Relentless Reaction: the enemy takes ${spirit} and can’t recover from it while affected by the revealing light.`,
      )
    if (name === 'Destructive Vengeance')
      lines.push(`Relentless Reaction: the enemy also takes ${spirit}.`)
    if (name === 'Iron Command')
      lines.push(`Relentless Reaction: if it refuses, it also takes ${spirit}.`)
  }
  if (exalted(s, level)) {
    const ex: Record<string, string> = {
      'Retributive Strike':
        'Exalted Reaction: each ally in your aura with the target in reach can spend a reaction to Strike it at −5.',
      'Selfish Shield':
        'Exalted Reaction: enemies in your aura take −1 status to attack rolls against you until the start of your next turn.',
      'Destructive Vengeance':
        'Exalted Reaction: each other enemy in your aura takes half the damage you deal the triggering enemy.',
      'Iron Command':
        'Exalted Reaction: each other enemy in your aura also kneels or takes the mental damage (only the minimum).',
      'Flash of Grandeur':
        'Exalted Reaction: each other enemy in your aura is affected by revealing light for 1 round.',
    }
    if (ex[name]) lines.push(ex[name]!)
  }
  return lines
}

// --- Blood magic (Player Core 2 p. 144) ------------------------------------------------

export interface Pf2eBloodMagic {
  /** The blood magic's name (Scaly Hide). */
  name: string
  /** Its rules sentence, from the bloodline's text. */
  text: string
  /** Its effects on the hero, to turn on (Imperious Defense has two to pick from). */
  toggles: string[]
  /** The target's damage when that's an option: "3 fire" at rank 3. */
  damage?: string
}

/** The sheet's bloodline feature (a sorcerer's subclass pick). */
const bloodlineOf = (s: Pf2eSheet) => s.feats.find((f) => f.type.toLowerCase() === 'bloodline')

/** The spells a bloodline grants: its sorcerous gifts (table ones included) and bloodline spells. */
export function bloodlineSpells(text: string): Set<string> {
  const out = new Set<string>()
  const t = text.replace(/\\n/g, '\n')
  for (const m of t.matchAll(/^\s*- \*\*[^*]+\*\* ([^\n(]+)/gm)) {
    const name = m[1]!.trim()
    if (!/^see /i.test(name)) out.add(name.toLowerCase())
  }
  for (const m of t.matchAll(/_([a-z][a-z' -]+)_/gi)) out.add(m[1]!.trim().toLowerCase())
  return out
}

/**
 * The blood magic a cast gives (p. 144): a sorcerer casting a sorcerous gift or bloodline spell
 * benefits from their bloodline's blood magic effect. Its effect on the hero is a toggle in
 * `data/pf2e/effects.ts`; a target's damage per spell rank is worked out here.
 */
export function bloodMagic(s: Pf2eSheet, spell: string, rank: number): Pf2eBloodMagic | null {
  const line = bloodlineOf(s)
  if (!line) return null
  const text = line.desc.replace(/\\n/g, '\n')
  if (!bloodlineSpells(text).has(spell.toLowerCase())) return null
  const m = /\*\*Blood Magic—([^*]+)\*\*\s*\n([^\n]+)/.exec(text)
  if (!m) return null
  const name = m[1]!.trim()
  const rule = m[2]!.trim()
  const toggles = ownEffects(s)
    .filter((e) => e.mode === 'toggle' && e.has?.name === line.name && e.name.startsWith(name))
    .map((e) => e.name)
  const per = /(\d+) (\w+ )?damage per spell rank/.exec(rule)
  const type = per?.[2]?.trim() ?? ''
  return {
    name,
    text: rule,
    toggles,
    ...(per ? { damage: `${Number(per[1]) * rank}${type ? ` ${type}` : ''}` } : {}),
  }
}
