// Table-side rules for a Nimble sheet: damage and dying, rests, mana, the turn
// tracker and inventory slots. Pure functions that change the sheet in place and
// return the line to show in the roll log.
import { weaponByName } from '~/data/nimble/core'
import type { InventoryItem, NimbleAbility, NimbleSheet } from '~/types/sheets'
import { rollDie, sign, type Rng } from '~/utils/dice'
import { abilityBaseName } from '~/utils/nimbleBuild'

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
export function turnActions(sheet: NimbleSheet): number {
  const windborne = hasAbility(sheet, 'Windborne')
  if (sheet.dying) return windborne || hasAbility(sheet, 'Enduring Rage') ? 2 : 1
  return windborne ? 4 : 3
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

export function isBloodied(sheet: NimbleSheet): boolean {
  return sheet.hp > 0 && sheet.hp <= sheet.hpMax / 2
}

export function isDead(sheet: NimbleSheet): boolean {
  return sheet.wounds >= Math.max(1, sheet.woundsMax)
}

function addWounds(sheet: NimbleSheet, n: number) {
  sheet.wounds = Math.min(Math.max(1, sheet.woundsMax), sheet.wounds + n)
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
export function payBloodCast(sheet: NimbleSheet): void {
  addWounds(sheet, 1)
}

/**
 * Temp HP absorbs damage first. Dropping to 0 HP means Dying, 1 Wound and lost
 * concentration; damage taken while already at 0 HP causes 2 Wounds.
 */
export function takeDamage(sheet: NimbleSheet, amount: number): string {
  let left = Math.max(0, Math.floor(amount))
  const absorbed = Math.min(sheet.tempHp, left)
  sheet.tempHp -= absorbed
  left -= absorbed
  if (left <= 0) return ''
  if (sheet.hp <= 0) {
    sheet.dying = true
    addWounds(sheet, 2)
    return 'Damage while Dying: +2 Wounds (3 on a crit).'
  }
  sheet.hp = Math.max(0, sheet.hp - left)
  if (sheet.hp > 0) return ''
  sheet.dying = true
  addWounds(sheet, 1)
  const hadFocus = sheet.concentration.trim() !== ''
  sheet.concentration = ''
  return `Down to 0 HP: +1 Wound, Dying.${hadFocus ? ' Concentration broken.' : ''}`
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

export function hitDiceLeft(sheet: NimbleSheet): number {
  return Math.max(0, sheet.hitDice - sheet.hitDiceUsed)
}

export interface FieldRestOptions {
  /** Hit Dice to spend; clamped to the dice left. */
  dice: number
  /** Made camp (8 hours with food and sleep): each die gives its maximum instead of a roll. */
  camp: boolean
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
  { dice, camp }: FieldRestOptions,
  rng: Rng = Math.random,
): string {
  const count = Math.min(hitDiceLeft(sheet), Math.max(0, Math.floor(dice)))
  if (count === 0 || sheet.hp >= sheet.hpMax) return ''
  const values = Array.from({ length: count }, () =>
    camp ? sheet.hitDie : rollDie(sheet.hitDie, rng),
  )
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
export function safeRest(sheet: NimbleSheet): string {
  sheet.hp = sheet.hpMax
  sheet.tempHp = 0
  sheet.dying = false
  sheet.hitDiceUsed = 0
  sheet.wounds = Math.max(0, sheet.wounds - 1)
  sheet.mana.current = sheet.mana.max
  sheet.mana.temp = 0
  for (const tracker of Object.values(sheet.uses)) tracker.used = 0
  sheet.resource.count = 0
  sheet.resource.dice = 0
  sheet.resource.active = false
  sheet.actionsSpent = 0
  sheet.rushed = 0
  sheet.reactionsUsed = []
  return 'Safe Rest: HP, Hit Dice, mana and limited uses restored; 1 Wound healed; temp HP expired.'
}

/** Start of a new round for this hero: actions and once-per-round reactions come back. */
export function newTurn(sheet: NimbleSheet): string {
  sheet.actionsSpent = 0
  sheet.rushed = 0
  sheet.reactionsUsed = []
  refill(sheet, ['turn'])
  const res = sheet.resource
  // A sustained Rage grows by one Fury die each round.
  if (res.active) res.dice = Math.min(MAX_RAGE_DICE, res.dice + 1)
  const n = turnActions(sheet)
  return `New turn: ${n} action${n === 1 ? '' : 's'}, reactions ready.`
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
  /** Uses the rules give. */
  rule: number
  /** Uses the hero has: the rule, or the player's own number. */
  max: number
  used: number
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
 * In order of appearance: a level step ("L7: 2/encounter"), a limit ("1/turn",
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
  const add = (period: UsePeriod, word: string, rule: number, hint: string) => {
    const same = found.filter((c) => c.period === period).length
    const id = `${base}@${period}${same ? `#${same + 1}` : ''}`
    found.push({ id, period, label: `per ${word}`, hint, rule, max: rule, used: 0 })
  }
  for (const m of ability.desc.matchAll(LIMIT)) {
    const [, stepLevel, stepUses, stepPeriod, amount, word, pool, charges, recharge] = m
    const after = hintAfter(ability.desc, m.index + m[0].length)
    if (stepLevel && stepUses && stepPeriod) {
      const period = PERIODS[stepPeriod.toLowerCase()]
      const target = found.findLast((c) => c.period === period)
      if (target && level >= Number(stepLevel)) target.rule = Number(stepUses)
    } else if (amount && word) {
      const period = PERIODS[word.toLowerCase()]
      if (period) add(period, word, limitValue(amount, sheet, level), after)
    } else if (pool) {
      // Mana has its own panel.
      if (!/\bmana pool\b/i.test(ability.desc))
        add('rest', 'Safe Rest', limitValue(pool, sheet, level), '')
    } else if (charges) add('rest', 'Safe Rest', limitValue(charges, sheet, level), '')
    else if (recharge) add('rest', 'Safe Rest', 1, '')
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

/** Initiative is rolled: per-encounter and per-turn uses come back, and the turn starts fresh. */
export function newEncounter(sheet: NimbleSheet): string {
  refill(sheet, ['turn', 'encounter'])
  sheet.actionsSpent = 0
  sheet.rushed = 0
  sheet.reactionsUsed = []
  return 'New encounter: per-encounter abilities, actions and reactions ready.'
}

/** Actions a spell takes, from its "2 Actions, AoE" line; rituals and reactions take none. */
export function spellActions(cast: string): number {
  return Number(/^(\d+) Actions?\b/.exec(cast)?.[1] ?? 0)
}

/** Slots one of an item takes when the player hasn't set it: 2 for two-handed weapons. */
export function itemSlots(item: InventoryItem): number {
  if (item.slots !== undefined) return item.slots
  return weaponByName(item.name)?.props.includes('2-handed') ? 2 : 1
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
