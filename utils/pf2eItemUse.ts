// Using Pathfinder 2e items from the sheet (GM Core pp. 220, 244–282): paying for them,
// consumables (a healing potion heals, an elixir's or potion's bonus turns on as an
// effect, a bomb is thrown as a Strike), and casting the spell in a scroll, wand or staff
// through the spell rules at the item's rank. The bookkeeping (Bulk, runes, charges) is in
// `utils/pf2eInventory.ts`.
import type { Pf2eEffectDef, Pf2eSpellDef } from '~/data/pf2e/types'
import type { InventoryItem, Pf2eRank, Pf2eSheet } from '~/types/sheets'
import { type Rng, parseDice, rollAttack, rollDice, rollDie, sign } from '~/utils/dice'
import { attacked, mapIndex } from '~/utils/pf2eActions'
import { toggleEffect } from '~/utils/pf2eEffects'
import { highestSlot, spendOne, spendStaff, useWand } from '~/utils/pf2eInventory'
import { adjusted, degreeOf, heal, proficiency, strikeResult } from '~/utils/pf2ePlay'
import { type Pf2eBuildData, higher } from '~/utils/pf2eBuild'
import { profileAt, weaponRankIn } from '~/utils/pf2eLevelUp'
import { type Pf2eCastChoice, castEffect, heightenedRank } from '~/utils/pf2eSpells'

/** Takes the price of `count` from the hero's coins, making change; false when short. */
export function pay(s: Pf2eSheet, cp: number): boolean {
  const c = s.coins
  const have = (c.pp ?? 0) * 1000 + c.gp * 100 + c.sp * 10 + c.cp
  if (cp > have) return false
  const left = have - cp
  const pp = Math.min(c.pp ?? 0, Math.floor(left / 1000))
  const rest = left - pp * 1000
  s.coins = {
    ...(c.pp !== undefined ? { pp } : {}),
    gp: Math.floor(rest / 100),
    sp: Math.floor((rest % 100) / 10),
    cp: rest % 10,
  }
  return true
}

/** A price in copper as the book writes it ("1,500 gp", "5 sp"). */
export function priceLabel(cp: number) {
  if (!cp) return '—'
  if (cp % 100 === 0) return `${(cp / 100).toLocaleString('en-US')} gp`
  if (cp % 10 === 0) return `${cp / 10} sp`
  return `${cp} cp`
}

/** The actions an activation or spell takes, when it's counted in actions. */
const actionCount = (cost: unknown) =>
  typeof cost === 'number' ? cost : Number(/^(\d)/.exec(String(cost ?? ''))?.[1] ?? 0) || 0

/** Why an activation's actions can't be paid while the turn tracker runs, if they can't. */
function actionsProblem(s: Pf2eSheet, cost: unknown): string | undefined {
  const t = s.turn
  if (cost === 'reaction') return t && !t.reaction ? 'Your reaction is spent.' : undefined
  const n = actionCount(cost)
  if (t?.active && n > t.actions)
    return `It takes ${n} action${n === 1 ? '' : 's'}; you have ${t.actions}.`
  return undefined
}

/** Pays an activation's actions (or the reaction) while the turn tracker runs. */
function payActions(s: Pf2eSheet, cost: unknown): string | undefined {
  const problem = actionsProblem(s, cost)
  if (problem) return problem
  const t = s.turn
  if (cost === 'reaction' && t) t.reaction = false
  else if (t?.active) t.actions -= actionCount(cost)
  return undefined
}

/**
 * The hero's rank with bombs (GM Core p. 244: martial thrown weapons) at their level, from the
 * class's proficiencies; a class trained in "alchemical bombs" (the alchemist, Player Core 2
 * p. 56) raises them with its simple weapons. Hand-made sheets are taken as trained.
 */
export function bombRank(s: Pf2eSheet, level: number, data: Pf2eBuildData): Pf2eRank {
  const p = profileAt(s, level, data)
  if (!p) return 'T'
  const martial = weaponRankIn(p, { name: '', category: 'Martial', group: 'Bomb' })
  const cls = data.classes.find((c) => c.slug === s.classSlug)
  const alchemical = cls?.attacks.some((l) => /alchemical bombs/i.test(l))
  const simple = weaponRankIn(p, { name: '', category: 'Simple', group: '' })
  return alchemical ? higher(martial, simple) : martial
}

export interface Pf2eItemUseOptions {
  level: number
  targetAc?: number | null
  /** A bomb's proficiency rank (martial weapons, or alchemical bombs). */
  bombRank?: Pf2eRank
  rng?: Rng
}

/**
 * An elixir's or potion's bonuses as an effect the hero has on until it ends (data/pf2e
 * effects engine): bonuses that hold only sometimes and the duration go in its note; one
 * that lasts a minute ends with the turn steps' "a minute passes".
 */
export function consumableEffect(item: InventoryItem): Pf2eEffectDef | undefined {
  const st = item.pf2e
  const always = (st?.bonuses ?? []).filter((b) => !b.when)
  if (!st || !always.length) return undefined
  const sometimes = (st.bonuses ?? []).filter((b) => b.when).map((b) => b.when)
  return {
    name: item.name,
    source: { book: 'Item' },
    mode: 'toggle',
    effects: always.map((b) => ({
      kind: 'modifier',
      selector: [b.selector],
      value: b.value,
      type: b.type,
      ...(b.skills ? { skills: b.skills } : {}),
    })),
    note: [st.duration ? `Lasts ${st.duration}.` : '', ...sometimes].filter(Boolean).join(' '),
    ...(st.duration === '1 minute' ? { ends: 'minute' as const } : {}),
  }
}

/**
 * Throws a bomb (GM Core p. 244): a martial thrown weapon Strike with DEX, its item bonus to
 * the attack and the turn's multiple attack penalty, against the Target AC. A hit deals its
 * damage and splash (a crit doubles the damage, not the splash), a miss only the splash, a
 * critical miss nothing; persistent damage is said, for the target to track.
 */
function throwBomb(s: Pf2eSheet, item: InventoryItem, o: Pf2eItemUseOptions): string {
  const st = item.pf2e!
  const b = st.bomb!
  const rank = o.bombRank ?? 'T'
  const base = proficiency(rank, o.level) + s.attrs.DEX
  const attack = adjusted(s, base, {
    kind: 'attack',
    attr: 'DEX',
    traits: ['thrown', 'splash'],
    level: o.level,
  })
  const step = mapIndex(s)
  const penalty = [0, 5, 10][step] ?? 0
  const bonus = attack.value + (b.attack ?? 0) - penalty
  const r = rollAttack(bonus, o.rng)
  attacked(s)
  const ac = o.targetAc
  const head = `${item.name} (attack ${step + 1}, ${sign(bonus)}): ${r.total}${r.natural === 20 ? ', natural 20' : r.natural === 1 ? ', natural 1' : ''}`
  const dice = parseDice(b.damage.dice)
  const rolled = dice ? rollDice(dice, o.rng).total : 0
  const splash = b.splash
    ? ` + ${b.splash} ${b.damage.type} splash (also to each creature within 5 feet)`
    : ''
  const persistent = b.persistent ? `; ${b.persistent.dice} persistent ${b.persistent.type}` : ''
  if (!ac)
    return `${head}. Hit: ${rolled} ${b.damage.type}${splash}${persistent}; crit: ${rolled * 2}.`
  const degree = degreeOf(r.total, r.d20, ac)
  const vs = `${head} vs AC ${ac}: ${strikeResult(degree)}`
  if (degree === 'critical failure') return `${vs}: no damage.`
  if (degree === 'failure')
    return b.splash ? `${vs}: ${b.splash} ${b.damage.type} splash damage only.` : `${vs}.`
  const crit = degree === 'critical success'
  const dmg = Math.max(1, rolled) * (crit ? 2 : 1)
  const pers = b.persistent
    ? `; ${crit && /d/.test(b.persistent.dice) ? `2 × ${b.persistent.dice}` : crit ? Number(b.persistent.dice) * 2 : b.persistent.dice} persistent ${b.persistent.type}`
    : ''
  return `${vs}: ${dmg} ${b.damage.type}${crit ? ` (2 × ${rolled})` : ''}${splash}${pers}.`
}

/**
 * Uses a consumable (GM Core p. 220): pays its actions while the turn runs, spends one, and
 * does what it does: Hit Points through `heal`, bonuses as an effect, a bomb's Strike.
 */
export function useConsumable(s: Pf2eSheet, index: number, o: Pf2eItemUseOptions): string {
  const item = s.inventory[index]
  const st = item?.pf2e
  if (!item || !st) return 'Nothing to use.'
  const act = st.activations?.[0]
  const blocked = payActions(s, act?.actions ?? (st.bomb ? 1 : undefined))
  if (blocked) return blocked
  const parts: string[] = []
  if (st.bomb) parts.push(throwBomb(s, item, o))
  if (st.healing) {
    const dice = parseDice(st.healing)
    const amount = dice ? rollDice(dice, o.rng).total : Number(st.healing) || 0
    parts.push(`${item.name}: ${heal(s, amount)}`)
  }
  const effect = consumableEffect(item)
  if (effect) {
    const effects = (s.effects ??= { on: [], given: [] })
    if (effects.on.includes(effect.name)) parts.push(`${effect.name} is already on.`)
    else {
      effects.items = [...(effects.items ?? []).filter((d) => d.name !== effect.name), effect]
      parts.push(toggleEffect(s, effect.name, o.level))
    }
  }
  if (!parts.length) parts.push(`Used ${item.name}.`)
  spendOne(s, index)
  return parts.join(' ')
}

/**
 * Why the hero can't cast a spell from an item (GM Core pp. 220, 262, 278, 282): they need
 * spellcasting, the spell on their list, and for a staff the rank within their slots.
 */
export function itemCastProblem(s: Pf2eSheet, spell: Pf2eSpellDef, rank: number, staff = false) {
  const sc = s.spellcasting
  if (!sc) return 'Casting from an item needs a spellcasting class feature.'
  if (!spell.traditions.includes(sc.tradition))
    return `${spell.name} isn't on the ${sc.tradition.toLowerCase()} spell list.`
  if (staff && rank > highestSlot(s)) return `You can't cast rank ${rank} spells yet.`
  return undefined
}

export interface Pf2eItemCast extends Pf2eCastChoice {
  level: number
  /** A staff spell's rank (0 for its cantrip). */
  rank?: number
  /** A spontaneous caster's slot that pays for a staff spell with 1 charge. */
  slotRank?: number
}

/**
 * Casts the spell in a scroll (used up), a wand (once a day, then overcharged) or a staff
 * (charges by rank) at the item's rank, with the hero's spell attack and DC through
 * `castEffect` (GM Core pp. 262, 278, 282).
 */
export function castFromItem(
  s: Pf2eSheet,
  index: number,
  spell: Pf2eSpellDef,
  o: Pf2eItemCast,
): string {
  const item = s.inventory[index]
  const st = item?.pf2e
  if (!item || !st) return 'Nothing to cast from.'
  const staff = st.kind === 'staff'
  const cantrip = staff && (o.rank ?? 0) === 0
  const rank = cantrip
    ? heightenedRank(o.level)
    : staff
      ? (o.rank ?? spell.rank)
      : (st.spell?.rank ?? spell.rank)
  const problem = itemCastProblem(s, spell, cantrip ? 1 : rank, staff)
  if (problem) return problem
  if (st.wand?.broken) return `${item.name} is broken until it's Repaired.`
  const blocked = actionsProblem(s, spell.actions)
  if (blocked) return blocked
  if (staff) {
    const paid = spendStaff(s, index, cantrip ? 0 : rank, o.slotRank)
    if (!paid.ok) return paid.text
    payActions(s, spell.actions)
    return `${paid.text} ${castEffect(s, spell, rank, o.level, o).text}`.trim()
  }
  payActions(s, spell.actions)
  if (st.kind === 'wand') {
    const overcharging = !!st.wand?.cast && !st.wand.overcharged && !st.wand.broken
    const w = useWand(s, index, overcharging ? rollDie(20, o.rng) : 0)
    if (!w.cast) return w.text
    return `${w.text} ${castEffect(s, spell, rank, o.level, o).text}`.trim()
  }
  const text = castEffect(s, spell, rank, o.level, o).text
  spendOne(s, index)
  return `${item.name}: ${text}`
}
