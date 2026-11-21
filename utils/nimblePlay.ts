// Table-side rules for a Nimble sheet: damage and dying, rests, mana, the turn
// tracker and inventory slots. Pure functions that change the sheet in place and
// return the line to show in the roll log.
import { weaponByName } from '~/data/nimble/core'
import { spellByName } from '~/data/nimble/spells'
import type { InventoryItem, NimbleAbility, NimbleSheet, NimbleStat } from '~/types/sheets'
import { quietly, rollDie, showDice, showOutcome, sign, type NimbleRoll, type Rng } from '~/utils/dice'
import { classBySlug, subclassBySlug } from '~/data/nimble/classes'
import {
  abilityBaseName,
  keyStatValue,
  sheetResource,
  type SheetResource,
} from '~/utils/nimbleBuild'
import { INVENTIONS } from '~/data/nimble/effects'
import { clearConditionsAt, dazedAtTurnStart } from '~/utils/nimbleConditions'
import { armorHit, armorRule, type ArmorContext } from '~/utils/nimbleTargetArmor'
import {
  applyCastEffect,
  applyMishapEffect,
  endEffects,
  setMalfunction,
} from '~/utils/nimbleEffects'
import {
  addSummon,
  endCustomSummons,
  endSummons,
  initiativeSummons,
  summonFromSpell,
} from '~/utils/nimbleSummons'

/** Fury dice a Rage can hold before the player has to pick which to keep. */
export const MAX_RAGE_DICE = 6
const BASE_SLOTS = 10
const COINS_PER_SLOT = 500
const POTIONS_PER_SLOT = 2

function hasAbility(sheet: NimbleSheet, name: string): boolean {
  return sheet.abilities.some((a) => abilityBaseName(a.name) === name)
}

/**
 * Actions a hero gets each turn: 3, or 1 while Dying. Windborne (Zephyr) adds one,
 * and it and Enduring Rage (Berserker) allow 2 while Dying.
 */
export function turnActionsFor(abilityNames: string[], dying: boolean): number {
  const has = (name: string) => abilityNames.some((n) => abilityBaseName(n) === name)
  const windborne = has('Windborne')
  if (dying) return windborne || has('Enduring Rage') ? 2 : 1
  return windborne ? 4 : 3
}

export function turnActions(sheet: NimbleSheet): number {
  return turnActionsFor(
    sheet.abilities.map((a) => a.name),
    !!sheet.dying,
  )
}

/** Attacking while Dying calls for a DC 10 STR save, unless Enduring Rage waives it. */
export function dyingAttackSave(sheet: NimbleSheet): boolean {
  return sheet.dying && !hasAbility(sheet, 'Enduring Rage')
}

export function actionsLeft(sheet: NimbleSheet): number {
  return Math.max(0, turnActions(sheet) - sheet.actionsSpent)
}

/** Spends actions; reactions may be paid for with next turn's, so it never refuses. */
export function spendActions(sheet: NimbleSheet, n = 1): void {
  sheet.actionsSpent = Math.min(turnActions(sheet), sheet.actionsSpent + n)
}

/** The battle is over: Rage, combat-only charges and minions that abandon you end. */
export function endEncounter(sheet: NimbleSheet, level: number): string {
  sheet.inEncounter = false
  sheet.turnActive = false
  sheet.turnDone = false
  sheet.awaitingInitiative = false
  sheet.initiative = null
  sheet.actionsSpent = 0
  sheet.rushed = 0
  sheet.reactionsUsed = []
  refill(sheet, ['turn', 'encounter'])
  for (const key of Object.keys(sheet.uses))
    if (/@(?:stolen|cooldown)$|~ready$/.test(key)) sheet.uses[key] = { used: 0 }
  expireSoulDice(sheet)
  const expired = expireGrants(sheet) + clearConditionsAt(sheet, 'encounter')
  const r = sheetResource(sheet, level)
  const lost = !!r && (r.kind === 'counter' || r.kind === 'dice') && sheet.resource.count > 0
  if (lost) sheet.resource.count = 0
  const rage = endRage(sheet)
  const gone = summonsGone([
    ...endSummons(sheet, 'encounter'),
    ...endCustomSummons(sheet, 'combat'),
  ])
  return `Encounter over.${lost ? ` Unused ${r.name} lost.` : ''}${rage ? ` ${rage}` : ''}${expired}${gone}`
}

/** A new round: per-round uses come back, and your next turn can start. */
export function newRound(sheet: NimbleSheet, level: number): string {
  sheet.turnDone = false
  for (const id of roundCounters(sheet, level)) if (sheet.uses[id]) sheet.uses[id]!.used = 0
  return `New round: per-round uses are back; start your turn when it comes.${clearConditionsAt(sheet, 'round')}`
}

/** Extra actions an ally or ability can grant beyond the turn's (Stim Pack, Chorus of Champions…). */
export const MAX_EXTRA_ACTIONS = 6

export function gainAction(sheet: NimbleSheet, n = 1): string {
  sheet.actionsSpent = Math.max(-MAX_EXTRA_ACTIONS, sheet.actionsSpent - n)
  const left = actionsLeft(sheet)
  return `Gained ${n} action${n === 1 ? '' : 's'}: ${left} left.`
}

/** Gives back actions an undone use took; never turns them into extra actions. */
export function refundActions(sheet: NimbleSheet, n: number): void {
  sheet.actionsSpent = Math.max(Math.min(0, sheet.actionsSpent), sheet.actionsSpent - n)
}

/** Circles to draw: the turn's actions, or more while extra ones are held. */
export function actionPips(sheet: NimbleSheet): number {
  return Math.max(turnActions(sheet), actionsLeft(sheet))
}

/** Circles fill from the left: tapping a filled one spends it, an empty one restores it. */
export function toggleActionPip(sheet: NimbleSheet, n: number): void {
  const left = actionsLeft(sheet)
  sheet.actionsSpent =
    n <= left
      ? Math.min(turnActions(sheet), sheet.actionsSpent + 1)
      : Math.max(Math.min(0, sheet.actionsSpent), sheet.actionsSpent - 1)
}

export function isBloodied(sheet: NimbleSheet): boolean {
  return sheet.hp > 0 && sheet.hp <= sheet.hpMax / 2
}

export function isDead(sheet: NimbleSheet): boolean {
  return sheet.wounds >= Math.max(1, sheet.woundsMax)
}

export function resurrect(sheet: NimbleSheet): string {
  if (!isDead(sheet)) return ''
  sheet.wounds = Math.max(0, Math.max(1, sheet.woundsMax) - 1)
  sheet.hp = Math.max(1, sheet.hp)
  sheet.dying = false
  return `Resurrected: back at ${sheet.hp} HP with ${sheet.wounds} Wounds.`
}

function hasText(sheet: NimbleSheet, pattern: RegExp): boolean {
  return sheet.abilities.some((a) => pattern.test(a.desc))
}

function ignoreWounds(sheet: NimbleSheet, n: number, level: number): number {
  if (!level || !sheet.inEncounter || n <= 0) return 0
  const counter = abilityCounters(sheet, level).find((e) =>
    /\bIgnore the first Wound you would suffer each encounter\b/.test(e.ability.desc),
  )?.counters[0]
  if (!counter) return 0
  const k = Math.max(0, Math.min(n, counter.max - counter.used))
  if (k) sheet.uses[counter.id] = { ...sheet.uses[counter.id], used: counter.used + k }
  return k
}

function addWounds(sheet: NimbleSheet, n: number, level = 0): string {
  const ignored = ignoreWounds(sheet, n, level)
  sheet.wounds = Math.min(Math.max(1, sheet.woundsMax), sheet.wounds + n - ignored)
  const kept = ignored
    ? ` Unyielding Resolve: ${ignored} Wound${ignored === 1 ? '' : 's'} ignored.`
    : ''
  return `${kept}${woundCharges(sheet, n, level)}`
}

export function gainWounds(sheet: NimbleSheet, n: number, level: number): string {
  return addWounds(sheet, n, level)
}

export function sufferWound(sheet: NimbleSheet, level: number): string {
  return `Took 1 Wound.${addWounds(sheet, 1, level)}`
}

const WOUND_CHARGE = [
  /\bWhenever you gain a Wound, gain a Burst of Speed\b/,
  /\bcharge whenever you are first Bloodied in an encounter and for every Wound you gain\b/,
]
const BLOODIED_CHARGE = /\bcharge whenever you are first Bloodied in an encounter\b/

function chargeFrom(sheet: NimbleSheet, patterns: RegExp[]): string {
  if (!sheet.inEncounter) return ''
  const ability = sheet.abilities.find((a) => patterns.some((p) => p.test(a.desc)))
  return ability ? abilityBaseName(ability.name) : ''
}

export function woundCharges(sheet: NimbleSheet, n: number, level = 0): string {
  if (n <= 0) return ''
  const notes: string[] = []
  const source = chargeFrom(sheet, WOUND_CHARGE)
  if (source) {
    sheet.resource.count += n
    const word = classBySlug(sheet.classSlug)?.resource?.diceName ?? 'charge'
    notes.push(`${source}: +${n} ${word}${n === 1 ? '' : 's'} (${sheet.resource.count}).`)
  }
  const avenger = sheet.abilities.find((a) =>
    /\bgain any Wounds, change up to that many Judgment Dice to their max\b/.test(a.desc),
  )
  const die = level ? sheetResource(sheet, level)?.die : undefined
  const rolls = sheet.resource.rolls
  if (avenger && die && rolls.length) {
    const order = rolls.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0])
    for (const [, i] of order.slice(0, n)) rolls[i] = die
    sheet.resource.rolls = [...rolls]
    notes.push(
      `${abilityBaseName(avenger.name)}: Judgment Dice ${rolls.join(', ')}; move up to half your speed for free.`,
    )
  }
  const exploding = sheet.abilities.find((a) =>
    /\bWhenever you gain a Wound, deal STR\+Wounds damage\b/.test(a.desc),
  )
  if (exploding)
    notes.push(
      `${abilityBaseName(exploding.name)}: deal ${sheet.stats.STR + sheet.wounds} damage${n > 1 ? ` ×${n}` : ''} to creatures you choose within 2 spaces (ignoring armor); they gain Smoldering.`,
    )
  return notes.length ? ` ${notes.join(' ')}` : ''
}

function bloodiedCharge(sheet: NimbleSheet, wasBloodied: boolean): string {
  const source = !wasBloodied && isBloodied(sheet) ? chargeFrom(sheet, [BLOODIED_CHARGE]) : ''
  const key = `${source}@encounter`
  if (!source || sheet.uses[key]?.used) return ''
  sheet.uses[key] = { ...sheet.uses[key], used: 1 }
  sheet.resource.count += 1
  return ` ${source}: first Bloodied, +1 charge (${sheet.resource.count}).`
}

// --- Reaver (Shadowmancer story subclass) ---------------------------------------

/** Use counter of Shadow Exploit; New encounter and Safe Rest clear it. */
const SHADOW_EXPLOIT = 'Shadow Exploit@encounter'

/** Hollow One: cut off from the patron, so tiered spells can't use Pilfered Power. */
export function isHollowOne(sheet: NimbleSheet): boolean {
  return hasAbility(sheet, 'Hollow One')
}

/** Minions the next Shadow Exploit cast costs: 1, plus 1 per spell cast that way this encounter. */
export function shadowExploitCost(sheet: NimbleSheet): number {
  return 1 + (sheet.uses[SHADOW_EXPLOIT]?.used ?? 0)
}

/** Casts with Shadow Exploit; returns the minions to sacrifice. */
export function payShadowExploit(sheet: NimbleSheet): number {
  const cost = shadowExploitCost(sheet)
  sheet.uses[SHADOW_EXPLOIT] = { ...sheet.uses[SHADOW_EXPLOIT], used: cost }
  return cost
}

/** Casts with My Blood, My Power: 1 Wound. */
export function payBloodCast(sheet: NimbleSheet, level = 0): string {
  return addWounds(sheet, 1, level)
}

/**
 * Temp HP absorbs damage first. Dropping to 0 HP means Dying, 1 Wound and lost
 * concentration; damage taken while already at 0 HP causes 2 Wounds.
 */
export function takeDamage(sheet: NimbleSheet, amount: number, level = 0, crit = false): string {
  let left = Math.max(0, Math.floor(amount))
  const critNotes = crit ? critTaken(sheet, level) : ''
  const absorbed = Math.min(sheet.tempHp, left)
  const hpBefore = sheet.hp
  sheet.tempHp -= absorbed
  left -= absorbed
  const ended =
    (left + absorbed > 0 ? endEffects(sheet, 'damage') : '') +
    (absorbed > 0 && sheet.tempHp === 0 ? endEffects(sheet, 'tempHpGone') : '')
  // A form that drops you to 0 HP when it ends (Dragonform) takes the rest of this hit.
  if (hpBefore > 0 && sheet.hp <= 0) return `${ended.trim()}${downed(sheet)}${critNotes}`.trim()
  if (left <= 0) return `${ended}${critNotes}`.trim()
  if (sheet.hp <= 0) {
    sheet.dying = true
    const force =
      sheet.resource.active &&
      hasText(sheet, /\bWhile Dying and Raging, taking damage causes 1 Wound\b/)
    const n = (force ? 1 : 2) + (crit ? 1 : 0)
    const charges = addWounds(sheet, n, level)
    return `Damage while Dying${crit ? ' (crit)' : ''}: +${n} Wounds${force ? ' (Unstoppable Force)' : ''}.${charges}${ended}${critNotes}`
  }
  const wasBloodied = isBloodied(sheet)
  sheet.hp = Math.max(0, sheet.hp - left)
  const bloodied = bloodiedCharge(sheet, wasBloodied)
  if (sheet.hp > 0) return `${ended}${bloodied}${critNotes}`.trim()
  if (
    hasText(sheet, /\bcannot drop below 1 HP\. Whenever this triggers, they gain 1 Wound instead\b/)
  ) {
    sheet.hp = 1
    const charges = addWounds(sheet, 1, level)
    return `Glorious Reprieve: you stay at 1 HP and gain 1 Wound instead.${charges}${ended}${bloodied}${critNotes}`
  }
  sheet.dying = true
  const charges = addWounds(sheet, 1, level)
  return `Down to 0 HP: +1 Wound, Dying.${charges}${ended}${downed(sheet)}${critNotes}`
}

function critTaken(sheet: NimbleSheet, level: number): string {
  const notes: string[] = []
  const more = sheet.abilities.find((a) =>
    /\bWhenever an enemy crits you, gain 1 Fury Die\b/.test(a.desc),
  )
  const titan = sheet.abilities.find((a) => /\bare crit by an enemy, Rage for free\b/.test(a.desc))
  if (titan && level) notes.push(`${abilityBaseName(titan.name)}: ${rage(sheet, level, true)}`)
  if (more && level && sheet.resource.active)
    notes.push(`${abilityBaseName(more.name)}: ${addFury(sheet, level, 1)}`)
  for (const a of sheet.abilities) {
    if (/\bWhenever you are crit, reduce the damage by half\b/.test(a.desc))
      notes.push(
        `${abilityBaseName(a.name)}: halve the crit's damage; the attacker takes the same amount.`,
      )
    if (/^\(1\/encounter\) When crit, gain 1 action\b/.test(a.desc))
      notes.push(`${abilityBaseName(a.name)}: you may gain 1 action (Use it in Actions).`)
  }
  return notes.length ? ` ${notes.join(' ')}` : ''
}

/** What dropping to 0 HP ends: concentration, Rage and 0-HP effects. */
function downed(sheet: NimbleSheet): string {
  const hadFocus = sheet.concentration.trim() !== ''
  sheet.concentration = ''
  const rageEnds = sheet.resource.active && !hasAbility(sheet, 'Deep Rage')
  if (rageEnds) endRage(sheet)
  const lost = endEffects(sheet, 'zeroHp') + (hadFocus ? endEffects(sheet, 'concentration') : '')
  return `${hadFocus ? ' Concentration broken.' : ''}${rageEnds ? ' Your Rage ends.' : ''}${lost}`
}

export function heal(sheet: NimbleSheet, amount: number): void {
  sheet.hp = Math.max(0, Math.min(sheet.hpMax, sheet.hp + Math.max(0, Math.floor(amount))))
  if (sheet.hp > 0) sheet.dying = false
}

/** Mana a hero can spend right now, temporary mana included. */
export function manaPool(sheet: NimbleSheet): number {
  return sheet.mana.current + sheet.mana.temp
}

/** Spends temporary mana first. Returns false, changing nothing, when there isn't enough. */
export function spendMana(sheet: NimbleSheet, cost: number): boolean {
  if (cost > manaPool(sheet)) return false
  const fromTemp = Math.min(sheet.mana.temp, cost)
  sheet.mana.temp -= fromTemp
  sheet.mana.current -= cost - fromTemp
  return true
}

const STATS = /^(STR|DEX|INT|WIL)$/
const KINETIC = 'Kinetic Barrage@encounter'

export function attackBonus(
  sheet: NimbleSheet,
  level: number,
  attack: { melee: boolean },
  judgmentHeld: number,
): { flat: number; notes: string[] } {
  let flat = 0
  const notes: string[] = []
  const stat = (s: string) => (STATS.test(s) ? sheet.stats[s as NimbleStat] : Number(s) || 0)
  for (const a of sheet.abilities) {
    const name = abilityBaseName(a.name)
    const ranged = /\bAdd (STR|DEX|INT|WIL) to your ranged weapon damage\b/.exec(a.desc)?.[1]
    if (ranged && !attack.melee) {
      flat += stat(ranged)
      notes.push(`${name} +${stat(ranged)}`)
    }
    const unending =
      /\bWhile you have no Judgment Dice, gain \+(\d+) damage to melee attacks\b/.exec(a.desc)?.[1]
    if (unending && attack.melee && judgmentHeld === 0) {
      flat += Number(unending)
      notes.push(`${name} +${unending}`)
    }
    const kinetic = /\bcumulative \+(STR|DEX|INT|WIL) bonus to all damage\b/.exec(a.desc)?.[1]
    const misses = sheet.uses[KINETIC]?.used ?? 0
    if (kinetic && misses > 0) {
      flat += stat(kinetic) * misses
      notes.push(`${name} +${stat(kinetic) * misses}`)
    }
  }
  return { flat, notes }
}

export interface AttackOutcome {
  melee: boolean
  miss: boolean
  crit: boolean
  quarry: boolean
}

function counterLeft(sheet: NimbleSheet, level: number, pattern: RegExp) {
  const entry = abilityCounters(sheet, level).find((e) => pattern.test(e.ability.desc))
  const counter = entry?.counters[0]
  return counter && counter.used < counter.max ? { entry, counter } : null
}

function bump(sheet: NimbleSheet, id: string): number {
  const used = (sheet.uses[id]?.used ?? 0) + 1
  sheet.uses[id] = { ...sheet.uses[id], used }
  return used
}

const FURY_ON_CRIT = /\bwhenever you crit or kill an enemy, change 1 Fury Die to the maximum\b/
const SECOND_CRIT = /\bWhen you land a critical hit for the second time on a turn\b/
const CRIT_FIRE = /^\(1\/turn\) When you crit, deal fire damage equal to your STR\+Wounds\b/
const THRILL =
  /\bwhenever: your quarry dies, or you hit your quarry in melee or crit your quarry at range\b/

/**
 * Abilities a crit with this attack sets off, by name: what the Crit button
 * applies for a player who rolls their own dice (the app's own rolls do it in
 * `afterAttack`).
 */
export function critTriggerNames(
  sheet: NimbleSheet,
  out: { melee: boolean; quarry: boolean },
): string[] {
  const named = (pattern: RegExp) =>
    sheet.abilities.filter((a) => pattern.test(a.desc)).map((a) => abilityBaseName(a.name))
  return [
    ...(sheet.resource.active ? named(FURY_ON_CRIT) : []),
    ...named(SECOND_CRIT),
    ...named(CRIT_FIRE),
    ...(out.quarry && !out.melee && sheet.inEncounter ? named(THRILL) : []),
  ]
}

export function afterAttack(sheet: NimbleSheet, level: number, out: AttackOutcome): string {
  const notes: string[] = []
  const named = (pattern: RegExp) => sheet.abilities.find((a) => pattern.test(a.desc))
  if (out.miss) {
    const titan = named(/\bAfter you miss an attack or are crit by an enemy, Rage for free\b/)
    if (titan) notes.push(`${abilityBaseName(titan.name)}: ${rage(sheet, level, true)}`)
    const feint = named(/\bIf you miss for the 2nd time in a single round\b/)
    if (feint && bump(sheet, 'Feinting Attack@turn') === 2)
      notes.push(`${abilityBaseName(feint.name)}: change the primary die to any result instead.`)
    const unleash = counterLeft(
      sheet,
      level,
      /^\(1\/encounter\) When you miss, you can crit instead\b/,
    )
    if (unleash)
      notes.push(
        `${abilityBaseName(unleash.entry!.ability.name)}: you can crit instead (use it in Actions).`,
      )
  }
  if (out.crit) {
    const frenzy = sheet.resource.active ? counterLeft(sheet, level, FURY_ON_CRIT) : null
    const die = sheetResource(sheet, level)?.die
    const rolls = sheet.resource.rolls
    if (frenzy && die && rolls.length && Math.min(...rolls) < die) {
      const low = rolls.indexOf(Math.min(...rolls))
      sheet.resource.rolls = rolls.map((v, i) => (i === low ? die : v))
      sheet.uses[frenzy.counter.id] = {
        ...sheet.uses[frenzy.counter.id],
        used: frenzy.counter.used + 1,
      }
      notes.push(
        `${abilityBaseName(frenzy.entry!.ability.name)}: a Fury Die set to ${die} (Fury ${total(sheet.resource.rolls)}).`,
      )
    }
    const tempo = named(SECOND_CRIT)
    if (tempo && bump(sheet, 'Steal Tempo@turn') === 2)
      notes.push(`${abilityBaseName(tempo.name)}: the target loses 1 action. ${gainAction(sheet)}`)
    const chain = counterLeft(sheet, level, CRIT_FIRE)
    if (chain) {
      const burning = hasText(sheet, /\bDouble any fire damage you deal\b/) ? 2 : 1
      notes.push(
        `${abilityBaseName(chain.entry!.ability.name)}: you may deal ${(sheet.stats.STR + sheet.wounds) * burning} fire damage to creatures within 2 spaces (use it in Actions).`,
      )
    }
  }
  const thrill = named(THRILL)
  if (thrill && out.quarry && !out.miss && (out.melee || out.crit) && sheet.inEncounter) {
    sheet.resource.count += 1
    const ground = named(
      /\bgain one or more Thrill of the Hunt charges, move up to half your speed\b/,
    )
    notes.push(
      `${abilityBaseName(thrill.name)}: +1 charge (${sheet.resource.count}).${ground ? ` ${abilityBaseName(ground.name)}: move up to half your speed for free.` : ''}`,
    )
  }
  return notes.length ? ` ${notes.join(' ')}` : ''
}

export function noteMiss(sheet: NimbleSheet): void {
  if (
    !sheet.abilities.some((a) =>
      /\bcumulative \+(?:STR|DEX|INT|WIL) bonus to all damage\b/.test(a.desc),
    )
  )
    return
  sheet.uses[KINETIC] = { ...sheet.uses[KINETIC], used: (sheet.uses[KINETIC]?.used ?? 0) + 1 }
}

export function zealotMax(sheet: NimbleSheet): number {
  const zealot = sheet.abilities.some((a) =>
    /\bspend mana \(up to your highest unlocked spell tier\)/.test(a.desc),
  )
  return zealot ? Math.min(sheet.spells.tier, manaPool(sheet)) : 0
}

const STEAL = /\bSteal up to (STR|DEX|INT|WIL) actions from your next turn\b/

export function stealState(
  sheet: NimbleSheet,
): { key: string; max: number; pending: number; cooldown: boolean } | null {
  const ability = sheet.abilities.find((a) => STEAL.test(a.desc))
  const stat = ability && (STEAL.exec(ability.desc)?.[1] as NimbleStat | undefined)
  if (!ability || !stat) return null
  const key = abilityBaseName(ability.name)
  return {
    key,
    max: Math.max(0, sheet.stats[stat]),
    pending: sheet.uses[`${key}@stolen`]?.used ?? 0,
    cooldown: !!sheet.uses[`${key}@cooldown`]?.used,
  }
}

export function stealActions(sheet: NimbleSheet): string {
  const steal = stealState(sheet)
  if (!steal || steal.max < 1) return ''
  if (steal.pending) return `${steal.key}: already stole from your next turn.`
  if (steal.cooldown) return `${steal.key}: you cannot use this 2 turns in a row.`
  sheet.uses[`${steal.key}@stolen`] = { used: steal.max }
  return `${steal.key}: ${gainAction(sheet, steal.max)} Your next turn starts ${steal.max} short.`
}

function settleStolen(sheet: NimbleSheet): string {
  const steal = stealState(sheet)
  if (!steal) return ''
  sheet.uses[`${steal.key}@cooldown`] = { used: 0 }
  if (!steal.pending) return ''
  sheet.uses[`${steal.key}@stolen`] = { used: 0 }
  sheet.uses[`${steal.key}@cooldown`] = { used: 1 }
  sheet.actionsSpent = Math.min(turnActions(sheet), steal.pending)
  return ` ${steal.pending} action${steal.pending === 1 ? '' : 's'} stolen last turn.`
}

const TRIGGERS: {
  pattern: RegExp
  label: (m: RegExpExecArray, sheet: NimbleSheet, level: number) => string
  fire: (m: RegExpExecArray, sheet: NimbleSheet, level: number) => string
}[] = [
  {
    pattern:
      /(?:^|[,.;:]\s*|\band )you gain ((?:STR|DEX|INT|WIL|LVL|\d+)(?:\+(?:STR|DEX|INT|WIL|LVL|\d+))*) temp HP\b/,
    label: (m, sheet, level) => `Gain ${limitValue(m[1]!, sheet, level)} temp HP`,
    fire: (m, sheet, level) => {
      const amount = limitValue(m[1]!, sheet, level)
      sheet.tempHp = Math.max(sheet.tempHp, amount)
      return `${amount} temp HP (${sheet.tempHp} now).`
    },
  },
  {
    pattern: /(?:^|[,.;:]\s*|\band |\byou )gain (\d+) actions?\b/,
    label: (m) => `Gain ${m[1]} action${m[1] === '1' ? '' : 's'}`,
    fire: (m, sheet) => gainAction(sheet, Number(m[1])),
  },
  {
    pattern: /\bgain (\d+) Fury Dice?\b/,
    label: (m) => `Gain ${m[1]} Fury Die`,
    fire: (m, sheet, level) =>
      sheet.resource.active ? addFury(sheet, level, Number(m[1])) : 'Not raging: no Fury Die.',
  },
  {
    pattern: /\b[Gg]ain (?:a|1) (Thrill of the Hunt charge|Burst of Speed)\b/,
    label: (m) => `Gain a ${m[1]}`,
    fire: (m, sheet, level) => {
      const max = sheetResource(sheet, level)?.max || Infinity
      if (sheet.resource.count >= max) return `${m[1]}: already at the max (${max}).`
      sheet.resource.count += 1
      return `+1 ${m[1]} (${sheet.resource.count}).`
    },
  },
  {
    pattern: /\bsummon (?:a|another) shadow minion\b/,
    label: () => 'Summon a shadow minion',
    fire: (_m, sheet, level) => addSummon(sheet, level, 'shadow-minion'),
  },
]

export function abilityTrigger(
  sheet: NimbleSheet,
  level: number,
  text: string,
): { label: string; fire: () => string } | null {
  for (const t of TRIGGERS) {
    const m = t.pattern.exec(text)
    if (m) return { label: t.label(m, sheet, level), fire: () => t.fire(m, sheet, level) }
  }
  return null
}

/** Abilities "Your <spell> … whenever they would crit" names, for the Crit button. */
export function critTriggerSources(sheet: NimbleSheet, source: string): string[] {
  const about = new RegExp(`\\bYour ${source}\\b[^.]*\\bwhenever they would crit\\b`)
  return sheet.abilities.filter((a) => about.test(a.desc)).map((a) => abilityBaseName(a.name))
}

export function critTriggers(sheet: NimbleSheet, level: number, source: string): string {
  const notes: string[] = []
  for (const a of sheet.abilities) {
    const about = new RegExp(`\\bYour ${source}\\b[^.]*\\bwhenever they would crit\\b`)
    if (!about.test(a.desc)) continue
    const crit = a.desc.slice(a.desc.indexOf('whenever they would crit'))
    const trigger = abilityTrigger(sheet, level, crit)
    if (trigger) notes.push(`${abilityBaseName(a.name)}: ${trigger.fire()}`)
  }
  return notes.join(' ')
}

export function manaCost(text: string): number {
  return Number(/\b[Ss]pend (\d+) mana\b/.exec(text)?.[1] ?? 0)
}

export function selfGains(sheet: NimbleSheet, level: number, text: string): string {
  const notes: string[] = []
  const first = text.replace(/^\s*\([^)]*\)\s*/, '').split(/(?<=[.!])\s+/)[0] ?? ''
  if (/\byou may (?:suffer|gain) (?:1|a) Wound\b/.test(first)) notes.push(sufferWound(sheet, level))
  const actions =
    /\bsuffer (?:1|a) Wound to gain (\d+) actions?\b/.exec(first)?.[1] ??
    /(?:^|[,:)]\s*|\byou )gain (\d+) actions?\b/i.exec(first)?.[1] ??
    /\bGive all party members (\d+) actions?\b/.exec(text)?.[1]
  if (actions) notes.push(gainAction(sheet, Number(actions)))
  const temp = /\byou gain (LVL|\d+) temp HP\b/.exec(text)?.[1]
  if (temp) {
    const amount = temp === 'LVL' ? level : Number(temp)
    sheet.tempHp = Math.max(sheet.tempHp, amount)
    notes.push(`Gained ${amount} temp HP.`)
  }
  return notes.length ? ` ${notes.join(' ')}` : ''
}

export interface SpellshapeCost {
  min: number
  more: boolean
  refund: number
  actions: number
  faster: boolean
}

export function spellshapeCost(desc: string): SpellshapeCost | null {
  const m = /^\((–|-)?(\d+)(\+| or more)?(?:×mana, min\. (\d+))? mana\)/.exec(desc)
  if (!m) return null
  const refund = m[1] ? Number(m[2]) : 0
  return {
    min: refund ? 0 : Number(m[4] ?? m[2]),
    more: !!m[3] || !!m[4],
    refund,
    actions: /\bSpend 1 additional action\b/.test(desc) ? 1 : 0,
    faster: /\bReduce the action cost of a spell by 1\b/.test(desc),
  }
}

export function spellshape(sheet: NimbleSheet, level: number, name: string, amount = 0): string {
  const cost = spellshapeCost(sheet.abilities.find((a) => a.name === name)?.desc ?? '')
  if (!cost) return ''
  const counter = abilityCounters(sheet, level).find(
    (e) => abilityBaseName(e.ability.name) === 'Spellshaper',
  )?.counters[0]
  if (counter && counter.used >= counter.max)
    return `${name}: you already used Spellshaper this turn.`
  const mana = cost.refund ? 0 : Math.max(cost.min, amount)
  if (mana > manaPool(sheet)) return `${name} needs ${mana} mana; you have ${manaPool(sheet)}.`
  if (actionsLeft(sheet) < cost.actions)
    return `${name} takes ${cost.actions} more action; you have ${actionsLeft(sheet)}.`
  const notes: string[] = []
  if (mana) {
    spendMana(sheet, mana)
    notes.push(`spent ${mana} mana`)
  }
  if (cost.actions) {
    spendActions(sheet, cost.actions)
    notes.push(`spent ${cost.actions} action`)
  }
  if (cost.refund) {
    sheet.mana.current = Math.min(sheet.mana.max, sheet.mana.current + cost.refund)
    notes.push(`the spell costs ${cost.refund} less mana (min 1)`)
  }
  if (cost.faster) {
    refundActions(sheet, 1)
    notes.push('the spell takes 1 action less')
  }
  if (counter) sheet.uses[counter.id] = { ...sheet.uses[counter.id], used: counter.used + 1 }
  return `${name}: ${notes.join(', ')}.`
}

const ENDURING_SOUL = /\bgain Hit Dice equal to the actions you get on your first turn\b/
const SOUL_DICE = 'Enduring Soul@hitDice'

function expireSoulDice(sheet: NimbleSheet): void {
  const record = sheet.uses[SOUL_DICE]
  if (!record?.used) return
  const spent = sheet.hitDiceUsed - (record.max ?? sheet.hitDiceUsed)
  sheet.hitDiceUsed += Math.max(0, record.used - Math.max(0, spent))
  sheet.uses[SOUL_DICE] = { used: 0 }
}

function grantSoulDice(sheet: NimbleSheet, n: number): string {
  expireSoulDice(sheet)
  if (n < 1 || !sheet.abilities.some((a) => ENDURING_SOUL.test(a.desc))) return ''
  sheet.hitDiceUsed -= n
  sheet.uses[SOUL_DICE] = { used: n, max: sheet.hitDiceUsed }
  return ` Enduring Soul: +${n} Hit Dice until combat ends.`
}

export function hitDiceLeft(sheet: NimbleSheet): number {
  return Math.max(0, sheet.hitDice - sheet.hitDiceUsed)
}

export interface FieldRestOptions {
  /** Hit Dice to spend; clamped to the dice left. */
  dice: number
  /** Made camp (8 hours with food and sleep): each die gives its maximum instead of a roll. */
  camp: boolean
  /**
   * The player's own Hit Die rolls (Catch Breath with Manual dice), one per die, kept to
   * the die's faces: how many there are is how many dice are spent (up to the dice left).
   */
  rolls?: number[]
}

/**
 * Hit Dice that should bring the hero to full HP: exact when making camp, by the
 * average roll otherwise. At least 1 while HP is missing, never more than the dice left.
 */
export function fieldRestDice(sheet: NimbleSheet, camp: boolean): number {
  const missing = sheet.hpMax - sheet.hp
  const left = hitDiceLeft(sheet)
  if (missing <= 0 || left === 0) return 0
  const perDie = (camp ? sheet.hitDie : (sheet.hitDie + 1) / 2) + sheet.stats.STR
  if (perDie <= 0) return left
  return Math.min(left, Math.max(1, Math.ceil(missing / perDie)))
}

/**
 * Field Rest: catch your breath (10 minutes, roll each Hit Die) or make camp
 * (8 hours with food and sleep, take each die's maximum). Each die adds STR,
 * which lowers it when negative, never below 0. Spends nothing at full HP.
 */
export function fieldRest(
  sheet: NimbleSheet,
  { dice, camp, rolls }: FieldRestOptions,
  rng: Rng = Math.random,
): string {
  const own =
    !camp && rolls?.length
      ? rolls.map((v) => Math.min(sheet.hitDie, Math.max(1, Math.round(v))))
      : null
  const count = Math.min(hitDiceLeft(sheet), own ? own.length : Math.max(0, Math.floor(dice)))
  if (count === 0 || sheet.hp >= sheet.hpMax) return ''
  const values = own
    ? own.slice(0, count)
    : Array.from({ length: count }, () => (camp ? sheet.hitDie : rollDie(sheet.hitDie, rng)))
  const total = values.reduce((sum, v) => sum + Math.max(0, v + sheet.stats.STR), 0)
  const before = sheet.hp
  sheet.hitDiceUsed += count
  heal(sheet, total)
  const gained = sheet.hp - before
  const label = camp ? 'Make Camp' : 'Catch Breath'
  const detail = `${camp ? 'took' : 'rolled'} ${values.join(', ')}, ${sign(sheet.stats.STR)} STR each`
  const capped = gained < total ? ` (${total - gained} lost over max)` : ''
  return `${label}: ${count} Hit ${count === 1 ? 'Die' : 'Dice'} (${detail}), +${gained} HP${capped}.`
}

/** A Safe Rest restores HP, Hit Dice, mana and limited uses, and heals 1 Wound. */
export function safeRest(sheet: NimbleSheet, level: number): string {
  const ended = endEffects(sheet, 'rest')
  sheet.turnActive = false
  sheet.inEncounter = false
  sheet.turnDone = false
  sheet.hp = sheet.hpMax
  sheet.tempHp = 0
  sheet.dying = false
  sheet.hitDiceUsed = 0
  sheet.wounds = Math.max(0, sheet.wounds - 1)
  sheet.mana.current = sheet.mana.max
  sheet.mana.temp = 0
  for (const tracker of Object.values(sheet.uses)) tracker.used = 0
  sheet.resource.count = 0
  endRage(sheet)
  sheet.actionsSpent = 0
  sheet.rushed = 0
  sheet.reactionsUsed = []
  sheet.casting = { ...NOT_CASTING }
  const refilled = refillResource(sheet, level, 'rest')
  const gone = summonsGone([...endSummons(sheet, 'rest'), ...endCustomSummons(sheet, 'rest')])
  const before = ended ? ` First:${ended}` : ''
  return `Safe Rest: HP, Hit Dice, mana and limited uses restored; 1 Wound healed; temp HP expired.${before}${refilled}${gone}`
}

function summonsGone(names: string[]): string {
  return names.length ? ` ${names.join(', ')} ${names.length === 1 ? 'is' : 'are'} gone.` : ''
}

const NOT_CASTING = { spell: '', actions: 0 }

/** Concentration starts once the spell is fully cast. */
function finishCasting(sheet: NimbleSheet, spell: string, level: number, at?: number): string {
  if (sheet.casting.spell === spell) sheet.casting = { ...NOT_CASTING }
  const def = spellByName(spell)
  const concentrates = /\bConcentration\b/.test(def?.desc ?? '')
  const dropped = concentrates && sheet.concentration ? endEffects(sheet, 'concentration') : ''
  const summoned = summonFromSpell(sheet, level, spell, at)
  const status = applyCastEffect(sheet, level, spell, Math.max(0, (at ?? 0) - (def?.tier ?? 0)))
  const summon = `${summoned ? ` ${summoned}` : ''}${status}`
  if (!concentrates) return summon
  sheet.concentration = spell
  return `${dropped} Concentrating.${summon}`
}

/**
 * True while a spell is still being cast: another spell that takes actions has to
 * wait for it, or the player stops casting. Check before charging the new spell.
 */
export function castingBlocks(sheet: NimbleSheet, actions: number): boolean {
  return actions > 0 && sheet.casting.actions > 0
}

/** Gives up on the spell being cast; what it cost is not refunded. */
export function stopCasting(sheet: NimbleSheet): string {
  const { spell } = sheet.casting
  sheet.casting = { ...NOT_CASTING }
  return spell ? `Stopped casting ${spell}.` : ''
}

/**
 * Starts casting a spell that takes `actions` (its cost is paid by the caller,
 * after checking `castingBlocks`). Actions left this turn go to it; whatever is
 * still owed is paid at the start of the next turns, and the spell takes effect
 * when the last one is. Returns the line for the roll log.
 */
export function castSpell(
  sheet: NimbleSheet,
  spell: string,
  actions: number,
  level: number,
  at?: number,
): string {
  // Never overwrite a cast in progress, which was already paid for.
  if (castingBlocks(sheet, actions)) return ` Still casting ${sheet.casting.spell}.`
  const paid = Math.min(actions, actionsLeft(sheet))
  sheet.actionsSpent += paid
  const owed = actions - paid
  if (owed <= 0) return finishCasting(sheet, spell, level, at)
  sheet.casting = at === undefined ? { spell, actions: owed } : { spell, actions: owed, at }
  return ` ${owed} more action${owed === 1 ? '' : 's'} needed: it takes effect on a later turn.`
}

/** Pays actions owed on a spell from a new turn's actions. */
function continueCasting(sheet: NimbleSheet, level: number): string {
  const { spell, actions, at } = sheet.casting
  if (!spell || actions <= 0) return ''
  const paid = Math.min(actions, actionsLeft(sheet))
  sheet.actionsSpent += paid
  const owed = actions - paid
  if (owed > 0) {
    sheet.casting = { ...sheet.casting, actions: owed }
    return ` Still casting ${spell}: ${paid} action${paid === 1 ? '' : 's'} spent, ${owed} to go.`
  }
  const done = finishCasting(sheet, spell, level, at)
  return ` ${spell} takes effect (${paid} action${paid === 1 ? '' : 's'} spent).${done}`
}

export function startTurn(sheet: NimbleSheet, level: number): string {
  sheet.turnActive = true
  sheet.inEncounter = true
  sheet.turnDone = false
  refillTurn(sheet, level, false)
  const intensify = sheet.resource.active && hasAbility(sheet, 'Intensifying Fury')
  const enduring = sheet.dying && !sheet.resource.active && hasAbility(sheet, 'Enduring Rage')
  let fury = ''
  if (intensify)
    fury = sheet.ownDice
      ? ' Intensifying Fury: roll a free Fury Die and add it.'
      : ` Intensifying Fury: ${addFury(sheet, level, 1)}`
  else if (enduring && sheet.ownDice) {
    sheet.resource.active = true
    fury = ' Enduring Rage: you Rage for free; roll your Fury Dice and add them.'
  } else if (enduring) fury = ` Enduring Rage: ${rage(sheet, level, true)}`
  const dazed = dazedAtTurnStart(sheet)
  const casting = continueCasting(sheet, level)
  const charge = refillResource(sheet, level, 'turn')
  const ended =
    endEffects(sheet, 'turn') +
    summonsGone(endSummons(sheet, 'turn')) +
    clearConditionsAt(sheet, 'turnStart')
  const n = actionsLeft(sheet)
  return `Your turn: ${n} action${n === 1 ? '' : 's'}.${dazed}${fury}${casting}${charge}${ended}`
}

export function endTurn(sheet: NimbleSheet, level: number): string {
  sheet.turnActive = false
  sheet.turnDone = true
  // 1/turn abilities (not 1/round) can be used again on another creature's turn (Core p. 15).
  refillTurn(sheet, level, false)
  sheet.actionsSpent = 0
  sheet.rushed = 0
  sheet.reactionsUsed = []
  const stolen = settleStolen(sheet)
  const n = turnActions(sheet)
  const recharged = refillResource(sheet, level, 'turnEnd')
  const ended = endEffects(sheet, 'turnEnd') + clearConditionsAt(sheet, 'turnEnd')
  return `End of turn: ${stolen ? `${n - sheet.actionsSpent} of ${n}` : `all ${n}`} actions back, reactions ready.${stolen}${recharged}${ended}`
}

export function furyMax(sheet: NimbleSheet): number {
  return Math.max(1, keyStatValue(sheet)?.value ?? MAX_RAGE_DICE)
}

function addFury(
  sheet: NimbleSheet,
  level: number,
  count: number,
  rng: Rng = Math.random,
  values?: number[],
): string {
  const r = sheetResource(sheet, level)
  const die = r?.die ?? sheet.resource.die
  const boundless = hasAbility(sheet, 'Boundless Rage')
  const raw = values?.length
    ? values.map((v) => Math.max(1, Math.min(die, Math.floor(v))))
    : Array.from({ length: count }, () => rollDie(die, rng))
  const rolled = raw.map((v) => (boundless && v < 6 ? 6 : v))
  const max = furyMax(sheet)
  const all = [...sheet.resource.rolls, ...rolled]
  const kept = all.length > max ? [...all].sort((a, b) => b - a).slice(0, max) : all
  sheet.resource.rolls = kept
  sheet.resource.dice = kept.length
  const dropped = all.length - kept.length
  return `rolled ${rolled.join(', ')} (d${die})${dropped ? `, kept the best ${max}` : ''}; Fury ${total(kept)} on every STR attack.`
}

export function rage(
  sheet: NimbleSheet,
  level: number,
  free = false,
  rng: Rng = Math.random,
  values?: number[],
): string {
  const r = sheetResource(sheet, level)
  if (r?.kind !== 'rage') return ''
  if (!free && sheet.uses['Rage@turn']?.used) return `${r.name}: already used this turn.`
  const count = sheet.abilities.some((a) => /Whenever you Rage, gain 2 Fury Dice/.test(a.desc))
    ? 2
    : 1
  if (sheet.ownDice && !values?.length)
    return `${r.name}: roll ${count}d${r.die} and enter what you rolled.`
  const was = sheet.resource.active
  sheet.resource.active = true
  if (!free) sheet.uses['Rage@turn'] = { ...sheet.uses['Rage@turn'], used: 1 }
  return `${was ? 'Rage again' : r.name}: ${addFury(sheet, level, count, rng, values)}`
}

export function endRage(sheet: NimbleSheet): string {
  if (!sheet.resource.active) return ''
  sheet.resource.active = false
  sheet.resource.rolls = []
  sheet.resource.dice = 0
  return 'Your Rage ends; its Fury Dice are lost.'
}

export function spendFury(sheet: NimbleSheet, index: number): string {
  const value = sheet.resource.rolls[index]
  if (value === undefined) return ''
  sheet.resource.rolls = sheet.resource.rolls.filter((_, i) => i !== index)
  sheet.resource.dice = sheet.resource.rolls.length
  const uses: string[] = []
  const stone = hasText(
    sheet,
    /\bWhenever you expend Fury Dice to reduce incoming damage, add the value of the die\b/,
  )
  if (hasText(sheet, /\bexpend 1 or more Fury Dice to reduce the damage taken by STR\+DEX\b/))
    uses.push(
      `reduce the damage by ${Math.max(0, sheet.stats.STR + sheet.stats.DEX) + (stone ? value : 0)}`,
    )
  if (hasText(sheet, /\bExpend 1 or more Fury Dice on your turn, move DEX spaces per die\b/))
    uses.push(`move ${Math.max(0, sheet.stats.DEX)} spaces for free`)
  if (
    hasText(sheet, /\bAfter you deal damage from a crit, you may expend any number of Fury Dice\b/)
  )
    uses.push(`after a crit, deal ${2 * value} more damage (Death Blow)`)
  return `Spent a Fury Die (${value})${uses.length ? `: ${uses.join(', or ')}` : ''}. ${sheet.resource.rolls.length} left.`
}

export function initiativeActions(total: number, natural: number, max: number): number {
  if (natural === 20 || total >= 20) return max
  return total >= 10 ? Math.min(2, max) : 1
}

export type UsePeriod = 'turn' | 'encounter' | 'rest'

/** A limit read from an ability's text: "(1/encounter)", "WIL times/Safe Rest", a pool. */
export interface AbilityCounter {
  /** Key in `sheet.uses`: "<ability>@<period>", with "#2" for a second limit of that period. */
  id: string
  period: UsePeriod
  /** "per round", "per Safe Rest"… as the rules word it. */
  label: string
  /** What the limit covers, when the text says so right after it. */
  hint: string
  /** The named option the limit belongs to ("Keen Eyes: (1/encounter)"). */
  name: string
  /** Actions a use takes, or the reaction it rides on ("Whenever you Defend"). */
  cost?: CounterCost
  /** The named option's own text, without its limits. */
  text: string
  /** Uses the rules give. */
  rule: number
  /** Uses the hero has: the rule, or the player's own number. */
  max: number
  used: number
}

export interface CounterCost {
  actions: number
  reaction?: 'Defend' | 'Interpose'
  /** The action is an attack: the next attack roll is part of it. */
  attack?: boolean
}

const OPTION_NAME = /([A-Z][\w'’ ]*[\w!]):\s*\(?\s*$/
const OPTION_HEADING = /(?<=^|[.…)]\s)[A-Z][A-Za-z'’ ]*[A-Za-z!]:\s/g
const REACTION_TRIGGER = /\b(?:when|whenever) you (?:use )?(defend|interpose)\b/i
const LEAD = String.raw`(?:^|[,(;:).]\s*)`
const FREE = /\bfree (?:reaction|action)\b/i
const REACTION_COST = new RegExp(String.raw`${LEAD}reaction\b`, 'i')
const ATTACK_ACTION = /\baction:(?:(?!\buntil\b)[^.])*?\battack\b/i
const WEAPON_MOVE = /\b(?:this attack|shoot|weapon)\b/i
const GRANTED_ATTACK = /\bGain the [\w ]+ attack\b/i
const LEADING_ACTION = /(?:^|[).]\s*)Action(?::|\/Reaction\b)/
const ACTION_COST = new RegExp(
  String.raw`(?:${LEAD}|\b(?:as|costs?|spend|takes?) (?:an?|1) )action\b(?!s? less)`,
  'i',
)

/**
 * What a use takes, read from its text: the reaction it rides on ("Whenever you
 * Defend"), a reaction (1 action), "2 actions", or "Action:". An "Action: Attack"
 * pays for the attack roll that follows it.
 */
export function counterCost(text: string): CounterCost | undefined {
  const reaction = REACTION_TRIGGER.exec(text)?.[1]?.toLowerCase()
  if (reaction) return { actions: 1, reaction: reaction === 'defend' ? 'Defend' : 'Interpose' }
  if (FREE.test(text)) return undefined
  if (REACTION_COST.test(text)) return { actions: 1 }
  if (GRANTED_ATTACK.test(text)) return undefined
  if (ATTACK_ACTION.test(text)) return { actions: 1, attack: true }
  const many = /\b(\d+) actions\b(?! less)/.exec(text)
  if (many) return { actions: Number(many[1]), ...(WEAPON_MOVE.test(text) ? { attack: true } : {}) }
  if (LEADING_ACTION.test(text)) return { actions: 1 }
  if (/\bfor free\b/i.test(text)) return undefined
  return ACTION_COST.test(text) ? { actions: 1 } : undefined
}

/**
 * Whether a use can still be made while you wait for your turn in combat: one that costs
 * no actions (free), rides on a reaction (Defend, Interpose), or is a reaction itself
 * ("Reaction:", "Action/Reaction"). Anything else that costs actions waits for your turn.
 */
export function usableOffTurn(cost: CounterCost | undefined, text: string): boolean {
  if (!cost || cost.actions <= 0 || cost.reaction) return true
  return REACTION_COST.test(text) || /\bAction\/Reaction\b/.test(text)
}

export function costLabel(cost: CounterCost | undefined): string {
  if (!cost) return ''
  if (cost.reaction) return `with ${cost.reaction}`
  return `${cost.actions} action${cost.actions === 1 ? '' : 's'}`
}

export function costShort(sheet: NimbleSheet, cost: CounterCost | undefined): boolean {
  if (!cost) return false
  if (cost.reaction && sheet.reactionsUsed.includes(cost.reaction)) return false
  return actionsLeft(sheet) < cost.actions
}

/** Spends what a use costs; null when there aren't enough actions left. */
export function payCost(sheet: NimbleSheet, cost: CounterCost | undefined): string | null {
  if (!cost || (cost.reaction && sheet.reactionsUsed.includes(cost.reaction))) return ''
  if (costShort(sheet, cost)) return null
  spendActions(sheet, cost.actions)
  if (cost.reaction) {
    sheet.reactionsUsed = [...sheet.reactionsUsed, cost.reaction]
    return ` ${cost.reaction}: spent 1 action.`
  }
  return cost.attack
    ? ` Spent ${costLabel(cost)}: roll the attack next, it costs no more.`
    : ` Spent ${costLabel(cost)}.`
}

export function shortMessage(sheet: NimbleSheet, name: string, cost: CounterCost): string {
  return `${name} takes ${costLabel({ actions: cost.actions })}; you have ${actionsLeft(sheet)}.`
}

/**
 * A spent limit, by when it comes back: "Used this turn", "Used this round",
 * "Used this Safe Rest"… ("None left" for a pool with no period).
 */
export function usedUpLabel(counter: { label: string } | undefined): string {
  const when = /^per\s+(.+)$/i.exec(counter?.label ?? '')?.[1]
  if (!when) return 'None left'
  return /^day$/i.test(when) ? 'Used today' : `Used this ${when}`
}

const PERIODS: Record<string, UsePeriod> = {
  turn: 'turn',
  round: 'turn',
  encounter: 'encounter',
  day: 'rest',
  'safe rest': 'rest',
}
const PERIOD = '([Ss]afe [Rr]est|day|encounter|turn|round)'
const AMOUNT = String.raw`((?:\d+\s*×\s*)?(?:STR|DEX|INT|WIL|LVL)|\d+)`
/**
 * In order of appearance: a level step ("L7: 2/encounter", which raises the last
 * limit of that period or, if there is none yet, starts one), a limit ("1/turn",
 * "2×WIL times/Safe Rest"), a pool ("maximum is always 5×LVL and it recharges on a
 * Safe Rest"), charges ("You have DEX Beastshift charges; they reset on a Safe
 * Rest") and a single recharging use ("recharges when you Safe Rest").
 */
const LIMIT = new RegExp(
  [
    String.raw`L(\d+):\s*(\d+)\s*\/\s*${PERIOD}`,
    String.raw`(?<![A-Za-z0-9+×])${AMOUNT}\s*×?(?:\s+times)?\s*(?:\/|\bper\b)\s*${PERIOD}`,
    String.raw`maximum is always ([^.]+?) and it recharges on a Safe Rest`,
    String.raw`You have ${AMOUNT} [^.;]*?charges; they reset on a Safe Rest`,
    String.raw`(recharges when you Safe Rest)`,
  ].join('|'),
  'g',
)
/** "+1 use of Coordinated Strike/Safe Rest" and the like, on some other ability. */
const BONUSES = [
  /\+(\d+) uses? of ([^/.\n]+?)\s*\/\s*Safe Rest/g,
  /(\d+) additional uses? of ([^.\n]+?) per Safe Rest/g,
  /\+(\d+) max ([^.\n]+?) charges/g,
  /(\d+) additional times per Safe Rest/g,
]
const HINT_LENGTH = 48

/** "5×LVL", "2×WIL", "INT" or "3" as a number; at least 1. */
function limitValue(formula: string, sheet: NimbleSheet, level: number): number {
  const factor = (token: string): number => {
    const t = token.replace(/[()\s]/g, '')
    if (t === 'LVL') return level
    if (t === 'STR' || t === 'DEX' || t === 'INT' || t === 'WIL') return sheet.stats[t]
    return Number(t) || 0
  }
  const total = formula
    .split('+')
    .reduce((sum, term) => sum + term.split('×').reduce((p, f) => p * factor(f), 1), 0)
  return Math.max(1, Math.floor(total))
}

const plainName = (name: string) =>
  abilityBaseName(name)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .trim()

/** The start of the sentence that follows a limit: "(1/day) You may reroll…". */
function hintAfter(desc: string, from: number): string {
  const rest = (desc.slice(from).split(/[.\n(]/)[0] ?? '').replace(/^[\s),:;]+/, '').trim()
  return rest.length > HINT_LENGTH ? `${rest.slice(0, HINT_LENGTH).trimEnd()}…` : rest
}

function readLimits(ability: NimbleAbility, sheet: NimbleSheet, level: number): AbilityCounter[] {
  const base = abilityBaseName(ability.name)
  const found: AbilityCounter[] = []
  const matches = [...ability.desc.matchAll(LIMIT)]
  const optionStart = (at: number) => {
    const named = OPTION_NAME.exec(ability.desc.slice(0, at))
    return named ? named.index : at
  }
  const starts = matches.filter((m) => !m[1]).map((m) => optionStart(m.index))
  const heads = [...ability.desc.matchAll(OPTION_HEADING)].map((m) => m.index)
  const add = (
    period: UsePeriod,
    word: string,
    rule: number,
    hint: string,
    from?: number | 'step',
  ) => {
    const same = found.filter((c) => c.period === period).length
    const id = `${base}@${period}${same ? `#${same + 1}` : ''}`
    const owner = from === 'step' ? found.at(-1) : undefined
    const at = typeof from === 'number' ? from : -1
    const end = Math.min(
      starts.find((i) => i > at) ?? ability.desc.length,
      heads.find((i) => i > at) ?? ability.desc.length,
    )
    const name =
      at < 0 ? (owner?.name ?? '') : (OPTION_NAME.exec(ability.desc.slice(0, at))?.[1] ?? '')
    const text = name || starts.length > 1 ? ability.desc.slice(Math.max(0, at), end) : ability.desc
    const cost = owner ? owner.cost : counterCost(text)
    const own = owner
      ? owner.text
      : name
        ? ability.desc
            .slice(at, end)
            .replace(/^[^)]*\)\s*/, '')
            .replace(/\s*\(L\d+:[^)]*\)/g, '')
            .trim()
        : ''
    found.push({
      id,
      period,
      label: `per ${word}`,
      hint,
      name,
      text: own,
      ...(cost ? { cost } : {}),
      rule,
      max: rule,
      used: 0,
    })
  }
  for (const m of matches) {
    const [, stepLevel, stepUses, stepPeriod, amount, word, pool, charges, recharge] = m
    const after = hintAfter(ability.desc, m.index + m[0].length)
    if (stepLevel && stepUses && stepPeriod) {
      const period = PERIODS[stepPeriod.toLowerCase()]
      const target = found.findLast((c) => c.period === period)
      // A step with no earlier limit of its period starts one ("L11: 1/round").
      if (level >= Number(stepLevel) && period) {
        if (target) target.rule = Number(stepUses)
        else add(period, stepPeriod, Number(stepUses), after, 'step')
      }
    } else if (amount && word) {
      const period = PERIODS[word.toLowerCase()]
      if (period) add(period, word, limitValue(amount, sheet, level), after, m.index)
    } else if (pool) {
      // Mana has its own panel.
      if (!/\bmana pool\b/i.test(ability.desc))
        add('rest', 'Safe Rest', limitValue(pool, sheet, level), '', m.index)
    } else if (charges) add('rest', 'Safe Rest', limitValue(charges, sheet, level), '', m.index)
    else if (recharge) add('rest', 'Safe Rest', 1, '', m.index)
  }
  return found
}

/**
 * The abilities with limited uses and their counters, in sheet order. A limit per
 * round counts as per turn and a limit per day as per Safe Rest. Abilities the
 * rules don't limit are left out: they are passive, or free to use.
 */
export function abilityCounters(
  sheet: NimbleSheet,
  level: number,
): { ability: NimbleAbility; counters: AbilityCounter[] }[] {
  const list = sheet.abilities
    .map((ability) => ({ ability, counters: readLimits(ability, sheet, level) }))
    .filter((entry) => entry.counters.length > 0)
  for (const source of sheet.abilities) {
    for (const [i, pattern] of BONUSES.entries()) {
      for (const m of source.desc.matchAll(pattern)) {
        // The last pattern names the ability as a verb: "You can Beastshift 2 additional times".
        const target = i === 3 ? '' : plainName(m[2] ?? '')
        const entry = list.find((e) =>
          target
            ? plainName(e.ability.name) === target
            : source.desc.slice(0, m.index).toLowerCase().includes(plainName(e.ability.name)),
        )
        const counter = entry?.counters.find((c) => c.period === 'rest')
        if (counter) counter.rule += Number(m[1])
      }
    }
  }
  const gadgetBonus = sheet.abilities
    .map((a) => Number(/\+(\d+) use\/Safe Rest to all gadgets/.exec(a.desc)?.[1] ?? 0))
    .reduce((a, b) => a + b, 0)
  if (gadgetBonus) {
    const gadgets = classBySlug(sheet.classSlug)?.pools.find((p) => p.id === 'gadgets')
    for (const { ability, counters } of list) {
      const gadget =
        gadgets?.options.some((o) => o.name === ability.name) || /\bGadget\./.test(ability.desc)
      const counter = gadget ? counters.find((c) => c.period === 'rest') : undefined
      if (counter) counter.rule += gadgetBonus
    }
  }
  for (const { counters } of list) {
    for (const c of counters) {
      const saved = sheet.uses[c.id]
      c.max = Math.max(1, saved?.max ?? c.rule)
      c.used = Math.max(0, Math.min(c.max, saved?.used ?? 0))
    }
  }
  return list
}

/** Refills the counters of the given periods. */
function refill(sheet: NimbleSheet, periods: UsePeriod[]): void {
  for (const [id, tracker] of Object.entries(sheet.uses)) {
    const period = id.slice(id.lastIndexOf('@') + 1).replace(/#\d+$/, '')
    if (periods.some((p) => p === period)) tracker.used = 0
  }
}

/** Ids of the counters written "per round" (they share the turn period). */
function roundCounters(sheet: NimbleSheet, level: number): Set<string> {
  return new Set(
    abilityCounters(sheet, level).flatMap(({ counters }) =>
      counters.filter((c) => c.label === 'per round').map((c) => c.id),
    ),
  )
}

/** Refills per-turn uses; per-round ones too unless `rounds` is false. */
function refillTurn(sheet: NimbleSheet, level: number, rounds: boolean): void {
  const skip = rounds ? new Set<string>() : roundCounters(sheet, level)
  for (const [id, tracker] of Object.entries(sheet.uses))
    if (/@turn(#\d+)?$/.test(id) && !skip.has(id)) tracker.used = 0
}

/**
 * Abilities whose spent use comes back when Initiative is rolled, read from text
 * like "Your Veilwalker's Blessing recharges when you roll Initiative" or "Regain
 * 1 use/charge of Searing Light when you roll Initiative".
 */
const INITIATIVE_RECHARGE = [
  /Your (?<name>[A-Z][\w'’ ]+?) recharges when you roll Initiative/g,
  /Regain (?<count>\d+) (?:use|charge)(?:\/charge)? of (?<name>[A-Z][\w'’ ]+?) when you roll Initiative/g,
  /When you roll Initiative, (?:you may )?regain (?<count>\d+) (?:spent )?uses? of (?:your )?(?<name>[A-Z][\w'’ ]+?)(?= \(|[.,]|$)/g,
  /Regain (?<count>\d+) uses? of (?<name>[A-Z][\w'’ ]+?) each time you roll Initiative/g,
]

/** The abilities that get spent per-Safe-Rest uses back on Initiative, and how many. */
const EXPIRES =
  /\b(?:lost if (?:not spent|unspent)|expires? (?:at the end of combat )?if (?:left )?unused|expires? if unspent|expire at the end of combat|lost if unspent)\b/

export function initiativeRecharges(
  sheet: NimbleSheet,
): { name: string; count: number; expires: boolean }[] {
  const found: { name: string; count: number; expires: boolean }[] = []
  for (const a of sheet.abilities)
    for (const pattern of INITIATIVE_RECHARGE)
      for (const m of a.desc.matchAll(pattern))
        if (m.groups?.name)
          found.push({
            name: m.groups.name.trim(),
            count: Number(m.groups.count ?? 1),
            expires: EXPIRES.test(a.desc),
          })
  return found
}

const GRANT = '~initiative'
const PILFER_GRANT = `Pilfered Power${GRANT}`

function expireGrants(sheet: NimbleSheet): string {
  const lost: string[] = []
  for (const [key, grant] of Object.entries(sheet.uses)) {
    if (!key.endsWith(GRANT) || !grant.used) continue
    const after = grant.max ?? 0
    if (key === PILFER_GRANT) {
      const spent = Math.max(0, after - sheet.resource.count)
      const unspent = Math.max(0, grant.used - spent)
      sheet.resource.count += unspent
      if (unspent) lost.push('Pilfered Power')
    } else {
      const tracker = sheet.uses[key.slice(0, -GRANT.length)]
      const spent = Math.max(0, (tracker?.used ?? after) - after)
      const unspent = Math.max(0, grant.used - spent)
      if (tracker && unspent) {
        tracker.used += unspent
        lost.push(key.slice(0, key.indexOf('@')))
      }
    }
    sheet.uses[key] = { used: 0 }
  }
  return lost.length ? ` Unspent Initiative uses lost: ${lost.join(', ')}.` : ''
}

const REMINDER =
  /\bWhen you roll Initiative(?: or [^,]+)?,? (?:you may )?(?!regain\b|gain (?:STR|DEX|INT|WIL)\b|give yourself and an ally advantage)([^.]+)\./

function initiativeReminders(sheet: NimbleSheet): string {
  const lines = sheet.abilities.flatMap((a) => {
    const clause = REMINDER.exec(a.desc)?.[1]
    return clause ? [`${abilityBaseName(a.name)}: ${clause}`] : []
  })
  const moveIt = sheet.abilities.find((a) =>
    /\bgive yourself and an ally advantage on the roll and \+3 speed\b/.test(a.desc),
  )
  if (moveIt)
    lines.push(`${abilityBaseName(moveIt.name)}: you and an ally get +3 speed for 1 round`)
  return lines.length ? ` You may: ${lines.join('; ')}.` : ''
}

function elementalSurge(sheet: NimbleSheet, rng: Rng): number {
  const surge = sheet.abilities.find((a) => abilityBaseName(a.name) === 'Elemental Surge')
  if (!surge) return 0
  const dice = [...surge.desc.matchAll(/WIL\+(\d+)d4/g)].map((m) => Number(m[1])).pop() ?? 0
  const steel = hasText(
    sheet,
    /\bWhenever you roll a 1 on an Elemental Surge die, you may reroll it once\b/,
  )
  const roll = () => {
    const value = rollDie(4, rng)
    return steel && value === 1 ? rollDie(4, rng) : value
  }
  const rolls = sheet.ownDice ? [] : Array.from({ length: dice }, roll)
  return Math.max(0, sheet.stats.WIL + total(rolls))
}

/** Mana gained on Initiative and lost when combat ends (Spellblade: INT); 0 for everyone else. */
export function encounterMana(sheet: NimbleSheet): number {
  const cls = classBySlug(sheet.classSlug)
  const sub = cls && sheet.subclassSlug ? subclassBySlug(cls, sheet.subclassSlug) : undefined
  return sub?.encounterMana ? Math.max(0, sheet.stats[sub.encounterMana]) : 0
}

/**
 * Combat starts: per-encounter and per-turn uses come back and the turn starts
 * fresh. Initiative is rolled next (`rollInitiative`).
 */
export function beginEncounter(sheet: NimbleSheet): string {
  endRage(sheet)
  sheet.turnActive = false
  sheet.inEncounter = true
  sheet.turnDone = false
  sheet.awaitingInitiative = true
  sheet.initiative = null
  refill(sheet, ['turn', 'encounter'])
  expireGrants(sheet)
  sheet.casting = { ...NOT_CASTING }
  sheet.rushed = 0
  sheet.reactionsUsed = []
  const extra = [summonsGone(endSummons(sheet, 'encounter')), endEffects(sheet, 'encounter')].join(
    '',
  )
  return `New encounter: per-encounter abilities and reactions ready. Roll Initiative.${extra}`
}

/**
 * Initiative is rolled (or entered, when the player rolls their own dice):
 * abilities that recharge on Initiative get one use back, encounter mana is
 * gained, and the hero starts with actions by the roll.
 */
export function rollInitiative(
  sheet: NimbleSheet,
  level: number,
  rng: Rng = Math.random,
  initiative?: number,
): string {
  return initiativeRoll(sheet, level, rng, initiative).message
}

/** `rollInitiative` with the total, for the GM's initiative tracker. */
export function initiativeRoll(
  sheet: NimbleSheet,
  level: number,
  rng: Rng = Math.random,
  initiative?: number,
): { message: string; total: number } {
  sheet.awaitingInitiative = false
  const recharged: string[] = []
  const pilfered = sheetResource(sheet, level)
  for (const { name, count, expires } of initiativeRecharges(sheet)) {
    if (pilfered?.kind === 'uses' && name === pilfered.name) {
      if (sheet.resource.count > 0) {
        const back = Math.min(count, sheet.resource.count)
        sheet.resource.count -= back
        if (expires) sheet.uses[PILFER_GRANT] = { used: back, max: sheet.resource.count }
        recharged.push(name)
      }
      continue
    }
    const key = Object.keys(sheet.uses).find(
      (k) => k.endsWith('@rest') && plainName(k.slice(0, k.lastIndexOf('@'))) === plainName(name),
    )
    const tracker = key ? sheet.uses[key] : undefined
    if (key && tracker && tracker.used > 0) {
      const back = Math.min(count, tracker.used)
      tracker.used -= back
      if (expires) sheet.uses[`${key}${GRANT}`] = { used: back, max: tracker.used }
      recharged.push(name)
    }
  }
  const surge = elementalSurge(sheet, rng)
  const mana = encounterMana(sheet) + surge
  sheet.mana.temp = mana
  const advantage = sheet.abilities.some(
    (a) =>
      /advantage on Initiative/i.test(a.desc) ||
      /\bWhen you roll Initiative you may give yourself and an ally advantage on the roll\b/.test(
        a.desc,
      ),
  )
  const entered = initiative !== undefined && Number.isFinite(initiative)
  const d20s = entered
    ? []
    : quietly(() => (advantage ? [rollDie(20, rng), rollDie(20, rng)] : [rollDie(20, rng)]))
  const natural = entered ? Math.floor(initiative) - sheet.initMod : Math.max(...d20s)
  const rolled = natural + sheet.initMod
  const cheat =
    rolled < 10 &&
    hasText(sheet, /\bIf you roll less than 10 on Initiative, you may change it to 10\b/)
  const roll = cheat ? 10 : rolled
  sheet.initiative = roll
  if (d20s.length)
    showDice({
      sides: 20,
      dice: d20s,
      dropped: d20s.length > 1 ? [d20s[0]! >= d20s[1]! ? 1 : 0] : [],
      primary: -1,
      explosions: [],
      extra: null,
      mod: sheet.initMod,
      total: roll,
      miss: false,
      crit: false,
      odds: advantage ? -1 : 0,
    })
  const max = turnActions(sheet)
  // Classic initiative only orders the turns: every hero starts with full actions.
  const start = sheet.classicInitiative ? max : initiativeActions(roll, natural, max)
  sheet.actionsSpent = max - start
  const extra = [
    cheat ? ` Cheat: ${rolled} raised to 10.` : '',
    grantSoulDice(sheet, start),
    recharged.length ? ` ${recharged.join(', ')} recharged.` : '',
    mana > 0 ? ` ${mana} encounter mana gained.` : '',
    refillResource(sheet, level, 'initiative'),
    initiativeSummons(sheet, level),
    initiativeReminders(sheet),
  ].join('')
  const how = entered
    ? 'as you rolled it'
    : `d20 ${natural}${advantage ? ' with advantage' : ''} ${sign(sheet.initMod)}`
  const surgeDice =
    sheet.ownDice &&
    /WIL\+\d+d4/.test(
      sheet.abilities.find((a) => abilityBaseName(a.name) === 'Elemental Surge')?.desc ?? '',
    )
      ? ' Add your Elemental Surge d4s to temporary mana.'
      : ''
  const message = `Initiative ${roll} (${how}): you start with ${start} action${start === 1 ? '' : 's'}${sheet.classicInitiative ? ' (Classic initiative)' : ''}.${extra}${surgeDice}`
  if (d20s.length) showOutcome({ label: 'Initiative', total: roll, detail: message })
  return { message, total: roll }
}

/** New encounter and Initiative in one step. */
export function newEncounter(
  sheet: NimbleSheet,
  level: number,
  rng: Rng = Math.random,
  initiative?: number,
): string {
  const begun = beginEncounter(sheet).replace(' Roll Initiative.', '')
  return `${begun} ${rollInitiative(sheet, level, rng, initiative)}`
}

const diceWord = (n: number) => (n === 1 ? 'Die' : 'Dice')
const total = (rolls: number[]) => rolls.reduce((a, b) => a + b, 0)

function refillResource(
  sheet: NimbleSheet,
  level: number,
  when: 'turn' | 'turnEnd' | 'initiative' | 'rest',
): string {
  const r = sheetResource(sheet, level)
  if (!r) return ''
  const res = sheet.resource
  if (r.kind === 'crit') res.count = 0
  if (r.kind === 'judgment' && (when === 'initiative' || when === 'rest')) res.rolls = []
  if (r.kind === 'counter' && !r.stat) {
    if (when === 'initiative' || when === 'rest') res.count = 0
    const gain = (ability: string) => (hasAbility(sheet, ability) ? 1 : 0)
    const extra =
      when === 'initiative' ? gain('Apex Predator') : when === 'turn' ? gain('Wild Endurance') : 0
    if (extra) {
      res.count += extra
      return ` +${extra} ${r.name} charge.`
    }
    return ''
  }
  const fills =
    (r.refill === 'turn' && when !== 'turn') || (r.refill === 'initiative' && when === 'initiative')
  if (!fills || res.count === r.max) return ''
  res.count = r.max
  return ` ${r.diceName} Dice: ${r.max}d${r.die} ready.`
}

export function rollResourceDice(
  count: number,
  sides: number,
  advantage = false,
  rng: Rng = Math.random,
): number[] {
  const rolls = Array.from({ length: count + (advantage && count > 0 ? 1 : 0) }, () =>
    rollDie(sides, rng),
  )
  if (advantage && count > 0) rolls.splice(rolls.indexOf(Math.min(...rolls)), 1)
  return rolls
}

const VALVE = 'Mana Recovery Valve~ready'

function valveReady(sheet: NimbleSheet): boolean {
  const ready = !!sheet.uses[VALVE]?.used
  if (ready) sheet.uses[VALVE] = { used: 0 }
  return ready
}

function armValve(sheet: NimbleSheet): string {
  if (
    !hasText(sheet, /\bAfter a mishap, gain advantage on your next Mana Die roll this encounter\b/)
  )
    return ''
  sheet.uses[VALVE] = { used: 1 }
  return ' Mana Recovery Valve: your next Mana Die roll has advantage.'
}

export function isMishap(dice: number[], spent: number): boolean {
  return spent > 0 && dice.some((d) => d <= spent)
}

export function poweredBy(r: SheetResource | null, props: string): boolean {
  return r?.kind === 'power' && props.includes(`${r.diceName} Dice`)
}

export function heldInventions(sheet: NimbleSheet): typeof INVENTIONS {
  return INVENTIONS.filter((i) => sheet.abilities.some((a) => abilityBaseName(a.name) === i.name))
}

function explodeDie(sides: number, rng: Rng): number[] {
  const extra: number[] = []
  for (let last = sides; last === sides; ) {
    last = rollDie(sides, rng)
    extra.push(last)
  }
  return extra
}

/**
 * The Primary Die of an invention attack under `odds` disadvantage (negative:
 * advantage): one more die per step, keeping the lowest or highest.
 */
function primaryDie(first: number, sides: number, odds: number, rng: Rng): number {
  const all = [first, ...Array.from({ length: Math.abs(odds) }, () => rollDie(sides, rng))]
  return odds > 0 ? Math.min(...all) : Math.max(...all)
}

export function operateInvention(
  sheet: NimbleSheet,
  level: number,
  name: string,
  count: number,
  rng: Rng = Math.random,
  mode: 'tether' | 'coil' = 'tether',
  disadvantage = 0,
  armor: ArmorContext = { armor: 'none' },
): string {
  const r = sheetResource(sheet, level)
  const invention = INVENTIONS.find((i) => i.name === name)
  if (r?.kind !== 'power' || !invention) return ''
  if (sheet.malfunctions.includes(name)) return `${name} is inoperable: repair it first.`
  const res = sheet.resource
  const n = Math.min(Math.max(0, Math.floor(count)), res.count)
  if (n < invention.min) return `${name} needs at least ${invention.min} ${r.diceName} Die.`
  if (sheet.ownDice) {
    res.count -= n
    const extra = invention.use === 'cannon' ? ' and the d12' : ''
    const against =
      invention.use === 'blade'
        ? armorRule({ ...armor, lighter: true })
        : invention.use === 'cannon'
          ? armorRule(armor)
          : ''
    return `${name}: spent ${n} ${r.diceName} ${diceWord(n)}; roll ${n}d${r.die}${extra} yourself. Mishap if any die rolls ${n} or less: flip its Malfunction switch or set the condition.${against} ${res.count} left.`
  }
  const has = (upgrade: string) => sheet.abilities.some((a) => a.name === `${name}: ${upgrade}`)
  const attack = invention.use === 'blade' || invention.use === 'cannon'
  const odds = attack
    ? disadvantage - (invention.use === 'blade' && has('Stabilized Mana Core') ? 1 : 0)
    : 0
  const oddsNote = odds > 0 ? ` (${odds}× disadvantage)` : odds < 0 ? ` (${-odds}× advantage)` : ''
  const rolls = rollResourceDice(n, r.die, valveReady(sheet), rng)
  if (invention.use === 'blade' && odds && rolls.length)
    rolls[0] = primaryDie(rolls[0]!, r.die, odds, rng)
  res.count -= n
  const sum = total(rolls)
  const dice = `${n}d${r.die} (${rolls.join(', ')})`
  let line = ''
  let mishapDice = rolls
  if (invention.use === 'cannon') {
    const primary = primaryDie(rollDie(12, rng), 12, odds, rng)
    mishapDice = [primary, ...rolls]
    const crit = primary === 12 ? explodeDie(12, rng) : []
    const perDie = sheet.stats.INT + (has('Amplified Conduit') ? 2 : 0)
    const extra = sum + n * perDie
    const hit = armorHit(primary + total(crit) + extra, n * perDie, armor, !!crit.length)
    line =
      primary === 1
        ? `miss (the d12 rolled a 1); ${dice}`
        : `${hit.damage} damage to the target${hit.note} and ${extra} to ALL creatures between${crit.length ? ' · critical' : ''} [d12 ${[primary, ...crit].join('+')}, ${dice} + ${perDie} each]`
  } else if (invention.use === 'blade') {
    const crit = rolls[0] === r.die ? explodeDie(r.die, rng) : []
    const hit = armorHit(
      2 * (sum + total(crit) + sheet.stats.STR),
      2 * sheet.stats.STR,
      { ...armor, lighter: true },
      !!crit.length,
    )
    line =
      rolls[0] === 1
        ? `miss (the first Mana Die rolled a 1); ${dice}`
        : `${hit.damage} damage${hit.note}${crit.length ? ' · critical' : ''} [2 × (${dice}${crit.length ? ` + ${crit.join('+')}` : ''} + STR)]`
  } else if (invention.use === 'plate') {
    line = `Defend with +${2 * Math.max(0, sheet.stats.STR) * n} Armor [${dice}]`
  } else if (invention.use === 'jerkin') {
    line = `Defend: first move ${n} space${n === 1 ? '' : 's'} [${dice}]`
  } else if (mode === 'coil') {
    line = `Coil: Restrain all creatures fully in a ${n}×${n} area, Range +${4 * Math.max(1, n)} [${dice}]`
  } else {
    line = `Tether: pull a creature your size or smaller next to you (you may Restrain it), or move to a larger one and gain Riding; Range +${4 * Math.max(1, n)} [${dice}]`
  }
  if (!isMishap(mishapDice, n))
    return `${name}${oddsNote}: ${line}. ${res.count} ${r.diceName} Dice left.`
  const notes: string[] = []
  if (invention.use === 'cannon' || invention.use === 'blade') {
    const hurt = invention.use === 'cannon' ? 2 * n : sum
    notes.push(
      `You take ${hurt} damage.`,
      takeDamage(sheet, hurt, level),
      setMalfunction(sheet, name, true),
    )
  } else if (invention.use === 'plate') notes.push(setMalfunction(sheet, name, true))
  else if (invention.use === 'jerkin') notes.push(applyMishapEffect(sheet, name).trim())
  else
    notes.push(
      mode === 'coil'
        ? 'Tangled! You are Restrained as well.'
        : 'Mistether! The GM may choose a different creature in Range.',
    )
  if (sheet.abilities.some((a) => abilityBaseName(a.name) === 'Percussive Maintenance'))
    notes.push('Percussive Maintenance: you may first raise 1 Mana Die by 1.')
  notes.push(armValve(sheet).trim())
  return `${name}${oddsNote}: ${line}. Mishap! (a die rolled ${n} or less) ${notes.filter(Boolean).join(' ')} ${res.count} ${r.diceName} Dice left.`
}

export function spendPower(
  sheet: NimbleSheet,
  level: number,
  count: number,
  rng: Rng = Math.random,
): string {
  const r = sheetResource(sheet, level)
  const res = sheet.resource
  const n = Math.min(Math.max(0, Math.floor(count)), res.count)
  if (r?.kind !== 'power' || n < 1) return ''
  if (sheet.ownDice) {
    res.count -= n
    return `Spent ${n} ${r.diceName} ${diceWord(n)}; roll ${n}d${r.die} yourself (mishap if any die rolls ${n} or less). ${res.count} left.`
  }
  const rolls = rollResourceDice(n, r.die, valveReady(sheet), rng)
  res.count -= n
  const mishap = isMishap(rolls, n) ? ` Mishap! (a die rolled ${n} or less)${armValve(sheet)}` : ''
  return `${n} ${r.diceName} ${diceWord(n)}: ${rolls.join(', ')} = ${total(rolls)}.${mishap} ${res.count} left.`
}

export function rollJudgment(
  sheet: NimbleSheet,
  level: number,
  rng: Rng = Math.random,
  values?: number[],
): string {
  const r = sheetResource(sheet, level)
  const res = sheet.resource
  if (r?.kind !== 'judgment') return ''
  const maximum = sheet.abilities.find((a) =>
    /\bWhenever you are attacked, set a Judgment Die to its max\b/.test(a.desc),
  )
  const maxOne = () => {
    const low = res.rolls.indexOf(Math.min(...res.rolls))
    if (low < 0 || res.rolls[low] === r.die) return ''
    res.rolls = res.rolls.map((v, i) => (i === low ? r.die : v))
    return ` ${abilityBaseName(maximum!.name)}: a die set to ${r.die} (${res.rolls.join(', ')} = ${total(res.rolls)}).`
  }
  if (res.rolls.length) return maximum ? `${r.name}: attacked while holding dice.${maxOne()}` : ''
  if (sheet.ownDice && !values?.length)
    return `${r.name}: roll ${r.roll}d${r.die}${r.advantage ? ' with advantage' : ''} and enter what you rolled.`
  res.rolls = values?.length
    ? values.map((v) => Math.max(0, Math.floor(v)))
    : rollResourceDice(r.roll, r.die, r.advantage, rng)
  const adv = r.advantage ? ', advantage' : ''
  const rolled = `${r.name}: ${r.roll}d${r.die}${adv} → ${res.rolls.join(', ')} = ${total(res.rolls)}, added to your next melee hit.`
  return `${rolled}${maximum ? maxOne() : ''}`
}

export function expendJudgment(sheet: NimbleSheet): string {
  const rolls = sheet.resource.rolls
  if (!rolls.length) return ''
  sheet.resource.rolls = []
  return `Judgment Dice expended: ${total(rolls)}.`
}

export function spendResourceMove(
  sheet: NimbleSheet,
  level: number,
  name: string,
  rng: Rng = Math.random,
): string {
  const r = sheetResource(sheet, level)
  const res = sheet.resource
  if (!r) return ''
  const move = r.moves.find((m) => m.name === name)
  const desc = move?.desc ?? ''
  const maneuver = move?.src === 'Maneuver'
  const turnKey = `${abilityBaseName(r.ability)}@turn`
  if (maneuver && sheet.uses[turnKey]?.used)
    return `${name}: you already used a maneuver this turn.`
  if (res.count < 1) {
    return freeMove(desc) ? `${name}: no charges, so it costs none.` : ''
  }
  const cost = counterCost(desc)
  if (cost && costShort(sheet, cost)) return shortMessage(sheet, name, cost)
  res.count -= 1
  if (maneuver) {
    sheet.uses[turnKey] = { ...sheet.uses[turnKey], used: 1 }
    if (/^Defend\b/.test(desc) && !sheet.reactionsUsed.includes('Defend'))
      sheet.reactionsUsed = [...sheet.reactionsUsed, 'Defend']
  }
  const paid = payCost(sheet, cost) ?? ''
  const word = r.kind === 'dice' ? `${r.diceName} Die` : r.diceName.toLowerCase() || 'charge'
  if (r.kind !== 'dice' || (desc && !/a roll of your Combat Die/.test(desc)))
    return `${name}: spent 1 ${word}. ${res.count} left.${paid}`
  const times = /2× a roll of your Combat Die/.test(desc) ? 2 : 1
  if (sheet.ownDice)
    return `${name}: spent 1 ${word}; roll your d${r.die}${times > 1 ? ' and double it' : ''}. ${res.count} left.${paid}`
  const value = rollDie(r.die, rng)
  const shown = times > 1 ? `${value} × 2 = ${value * 2}` : `${value}`
  return `${name}: ${r.diceName} Die rolled ${shown} (d${r.die}). ${res.count} left.${paid}`
}

export function freeMove(desc: string): boolean {
  return /costs 0 [^.]*if you have none/i.test(desc)
}

export function resourceOnAttack(
  sheet: NimbleSheet,
  level: number,
  attack: { name: string; melee: boolean; props: string },
  roll: NimbleRoll,
  ready: number,
  rng: Rng = Math.random,
): { extra: number; note: string } {
  const r = sheetResource(sheet, level)
  const res = sheet.resource
  if (!r) return { extra: 0, note: '' }
  if (poweredBy(r, attack.props)) {
    const n = Math.min(Math.max(0, Math.floor(ready)), res.count)
    if (n < 1) return { extra: 0, note: '' }
    const rolls = rollResourceDice(n, r.die, valveReady(sheet), rng)
    res.count -= n
    const mishap = isMishap([...roll.dice, ...rolls], n)
      ? ` Mishap! (a die rolled ${n} or less)${applyMishapEffect(sheet, attack.name)}${armValve(sheet)}`
      : ''
    const added = roll.miss ? '' : ` +${total(rolls)}`
    return {
      extra: roll.miss ? 0 : total(rolls),
      note: ` ${n} ${r.diceName} ${diceWord(n)} (${rolls.join(', ')})${added}.${mishap}`,
    }
  }
  if (r.kind === 'judgment' && attack.melee && res.rolls.length) {
    const sum = total(res.rolls)
    res.rolls = []
    return roll.miss
      ? { extra: 0, note: ' Judgment Dice expended.' }
      : { extra: sum, note: ` Judgment Dice +${sum} radiant.` }
  }
  if (r.kind === 'crit' && roll.crit && res.count === 0) {
    const rolls = rollResourceDice(r.roll, r.die, false, rng)
    res.count = 1
    return { extra: total(rolls), note: ` ${r.name} +${total(rolls)} (${rolls.join(', ')}).` }
  }
  return { extra: 0, note: '' }
}

/** Actions a spell takes, from its "2 Actions, AoE" line; rituals and reactions take none. */
export function spellActions(cast: string): number {
  return Number(/^(\d+) Actions?\b/.exec(cast)?.[1] ?? 0)
}

/** Slots one of an item takes when the player hasn't set it: 2 for two-handed weapons. */
export function itemSlots(item: InventoryItem): number {
  if (item.slots !== undefined) return item.slots
  const props = item.custom ? (item.custom.props ?? '') : (weaponByName(item.name)?.props ?? '')
  return props.includes('2-handed') ? 2 : 1
}

function quantity(item: InventoryItem): number {
  const n = Number.parseInt(item.qty, 10)
  return Number.isFinite(n) ? Math.max(0, n) : 1
}

/**
 * Inventory slots in use and the limit (10 + STR). Small items all share one slot,
 * potions stack two to a slot, each weapon takes its own slots, other stacks take
 * their slots once, and every 500 gp fills a slot.
 */
export function inventorySlots(sheet: NimbleSheet): { used: number; max: number } {
  let used = 0
  let small = false
  for (const item of sheet.inventory) {
    const slots = itemSlots(item)
    const qty = quantity(item)
    if (qty === 0) continue
    if (slots === 0) small = true
    else if (/potion/i.test(item.name)) used += Math.ceil(qty / POTIONS_PER_SLOT) * slots
    else if (weaponByName(item.name) && !/stack/i.test(weaponByName(item.name)?.props ?? ''))
      used += qty * slots
    else used += slots
  }
  if (small) used += 1
  used += Math.floor(Math.max(0, sheet.coins.gp) / COINS_PER_SLOT)
  return { used, max: BASE_SLOTS + sheet.stats.STR }
}
