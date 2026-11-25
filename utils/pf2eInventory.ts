// Pathfinder 2e inventory rules for the sheet: Bulk and the encumbered and overloaded limits
// (Player Core pp. 269–271), investing magic items (GM Core p. 219), etching runes on weapons
// and armor and what they add to Strikes, AC and saves (GM Core pp. 224–225), the constant
// bonuses of worn and held items, and staff and wand charges (GM Core pp. 278, 282). Pure
// functions on the sheet; using an item is `utils/pf2eItemUse.ts`.
import type {
  Pf2eArmorDef,
  Pf2eEffectDef,
  Pf2eItemDef,
  Pf2eShieldDef,
  Pf2eSpellDef,
  Pf2eWeaponDef,
} from '~/data/pf2e/types'
import type { InventoryItem, Pf2eItemState, Pf2eSheet } from '~/types/sheets'

/** A modifier the way utils/pf2ePlay.ts stacks them (kept here to avoid an import cycle). */
interface ItemMod {
  value: number
  type: 'item'
  source: string
}

// --- Bulk ---------------------------------------------------------------------

/** Bulk as the book writes it: "L" for light, "—" for negligible (Player Core p. 269). */
export const bulkLabel = (b: number) => (b === 0 ? '—' : b < 1 ? 'L' : String(b))

/** A Bulk the player typed ("L", "2", "—"). */
export function parseBulk(qty: string): number {
  const v = qty.trim().toUpperCase()
  if (v === 'L') return 0.1
  const n = Number.parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

/** The inventory's view of an item: hand-written ones are one item of their typed Bulk. */
export const itemState = (item: InventoryItem): Pf2eItemState =>
  item.pf2e ?? { count: 1, bulk: parseBulk(item.qty), carry: 'stowed' }

/**
 * One stack's Bulk, split into whole Bulk and light items (ten light items are 1 Bulk).
 * Armor carried rather than worn is 1 Bulk more, or 1 Bulk if it's light (p. 271).
 */
export function stackBulk(item: InventoryItem): { whole: number; light: number } {
  const st = itemState(item)
  const count = Math.max(0, st.count)
  const carriedArmor = st.kind === 'armor' && st.carry !== 'worn'
  const one = carriedArmor ? (st.bulk < 1 ? 1 : st.bulk + 1) : st.bulk
  if (one <= 0) return { whole: 0, light: 0 }
  if (one < 1) return { whole: 0, light: count }
  return { whole: one * count, light: 0 }
}

/** Coins of every kind: a thousand are 1 Bulk, fractions dropped (p. 269). */
export const coinCount = (c: Pf2eSheet['coins']) =>
  (c.pp ?? 0) + (c.gp ?? 0) + (c.sp ?? 0) + (c.cp ?? 0)

/**
 * The hero's Bulk (p. 269): whole Bulk, plus 1 per ten light items, plus 1 per thousand
 * coins, fractions dropped; negligible items count for nothing.
 */
export function totalBulk(s: Pf2eSheet) {
  let whole = 0
  let light = 0
  for (const item of s.inventory) {
    const b = stackBulk(item)
    whole += b.whole
    light += b.light
  }
  const coins = Math.floor(coinCount(s.coins) / 1000)
  return { bulk: whole + Math.floor(light / 10) + coins, light, coins }
}

/**
 * Bulk limits (p. 269): encumbered over 5 + STR, and no more than 10 + STR can be carried.
 * Hand-made sheets keep the limit typed in `bulkLimit`.
 */
export function bulkLimits(s: Pf2eSheet) {
  const encumbered = s.classSlug ? 5 + s.attrs.STR : s.bulkLimit
  return { encumbered, max: encumbered + 5 }
}

export function bulkState(s: Pf2eSheet) {
  const { bulk, light, coins } = totalBulk(s)
  const { encumbered, max } = bulkLimits(s)
  return {
    bulk,
    light,
    coins,
    limit: encumbered,
    max,
    encumbered: bulk > encumbered,
    overloaded: bulk > max,
  }
}

/**
 * Gives or takes the encumbered condition as the Bulk crosses the limit (p. 269). It takes
 * away only the encumbered it gave, so one the player set stays. Returns what changed.
 */
export function syncEncumbered(s: Pf2eSheet): string | undefined {
  const over = bulkState(s).encumbered
  const has = s.conditions.includes('Encumbered')
  if (over && !has) {
    s.conditions = [...s.conditions, 'Encumbered']
    s.bulkEncumbered = true
    return 'Carrying more than your Bulk limit: encumbered (clumsy 1, −10 feet Speed).'
  }
  if (!over && has && s.bulkEncumbered) {
    s.conditions = s.conditions.filter((c) => c !== 'Encumbered')
    delete s.bulkEncumbered
    return 'Back within your Bulk limit: no longer encumbered.'
  }
  if (!over && s.bulkEncumbered) delete s.bulkEncumbered
  return undefined
}

/** Any record the inventory can add: other equipment, or a weapon, armor or shield. */
export type Pf2eOwnable =
  | { set: 'item'; def: Pf2eItemDef }
  | { set: 'weapons'; def: Pf2eWeaponDef }
  | { set: 'armor'; def: Pf2eArmorDef }
  | { set: 'shields'; def: Pf2eShieldDef }

/**
 * A new inventory entry from a data record, with the numbers the sheet uses copied onto it.
 * Armor starts worn; a scroll or wand holds the `spell` chosen for it.
 */
export function itemFromDef(o: Pf2eOwnable, count = 1, spell?: Pf2eSpellDef): InventoryItem {
  const d = o.def
  const common: Pf2eItemState = {
    id: d.id,
    count,
    bulk: d.bulk,
    level: d.level,
    price: d.price,
    carry: 'stowed',
    traits: d.traits,
  }
  let st: Pf2eItemState
  let name = d.name
  if (o.set === 'weapons')
    st = { ...common, kind: 'weapon', ranged: o.def.type === 'Ranged', carry: 'held' }
  else if (o.set === 'armor')
    st = { ...common, kind: 'armor', category: o.def.category.toLowerCase(), carry: 'worn' }
  else if (o.set === 'shields') st = { ...common, kind: 'shield', carry: 'held' }
  else {
    const i = o.def
    const { healing, bonuses, duration, bomb, rune, spells, spellRank } = i
    st = {
      ...common,
      kind: i.kind,
      ...(i.usage ? { usage: i.usage } : {}),
      ...(i.activations.length ? { activations: i.activations } : {}),
      ...(healing ? { healing } : {}),
      ...(bonuses ? { bonuses } : {}),
      ...(duration ? { duration } : {}),
      ...(bomb ? { bomb } : {}),
      ...(rune ? { rune } : {}),
      ...(spells ? { spells, charges: 0 } : {}),
      ...(spellRank ? { spellRank } : {}),
      ...(i.kind === 'wand' ? { wand: { cast: false, overcharged: false, broken: false } } : {}),
    }
    if (/^worn\b/i.test(i.usage ?? '')) st.carry = 'worn'
    if (spell && spellRank) {
      st.spell = { id: spell.id, name: spell.name, rank: spellRank }
      name =
        i.kind === 'scroll'
          ? `Scroll of ${spell.name} (rank ${spellRank})`
          : `${d.name.replace(/\s*\(\d+(?:st|nd|rd|th)-rank Spell\)$/i, '')} of ${spell.name} (rank ${spellRank})`
    }
  }
  return { name, qty: bulkLabel(d.bulk), pf2e: st }
}

// --- Investing (GM Core p. 219) ----------------------------------------------------

/** A hero benefits from at most 10 invested items a day (GM Core p. 219). */
export const INVEST_LIMIT = 10

/** Runes make armor invested (GM Core p. 224). */
const hasRunes = (st: Pf2eItemState) =>
  !!st.runes && (st.runes.potency + st.runes.resilient > 0 || st.runes.property.length > 0)

/** Items with the invested trait, and armor with runes, must be invested to work. */
export const needsInvesting = (st: Pf2eItemState) =>
  !!st.traits?.includes('Invested') || (st.kind === 'armor' && hasRunes(st))

export const investedCount = (s: Pf2eSheet) =>
  s.inventory.filter((i) => i.pf2e?.invested && needsInvesting(i.pf2e)).length

/** Invests or stops investing an item: it must be worn, and the eleventh is refused. */
export function setInvested(s: Pf2eSheet, index: number, on: boolean): string {
  const item = s.inventory[index]
  const st = item?.pf2e
  if (!item || !st || !needsInvesting(st)) return `${item?.name ?? 'That'} isn't invested.`
  if (!on) {
    st.invested = false
    return `${item.name} is no longer invested.`
  }
  if (st.invested) return `${item.name} is already invested.`
  if (st.carry !== 'worn') return `Wear ${item.name} to invest it.`
  if (investedCount(s) >= INVEST_LIMIT)
    return `You already have ${INVEST_LIMIT} invested items today (GM Core p. 219).`
  st.invested = true
  return `Invested ${item.name} (${investedCount(s)}/${INVEST_LIMIT}).`
}

/** Whether an item's magic works now: invested when it must be, else worn or held. */
export const itemActive = (st: Pf2eItemState) =>
  needsInvesting(st) ? !!st.invested && st.carry === 'worn' : st.carry !== 'stowed'

// --- Runes (GM Core pp. 224–225) -------------------------------------------------

export const noRunes = () => ({ potency: 0, striking: 0, resilient: 0, property: [] })

const FUNDAMENTAL_WORDS: Record<string, string[]> = {
  striking: ['', 'striking', 'greater striking', 'major striking'],
  resilient: ['', 'resilient', 'greater resilient', 'major resilient'],
}

/** A rune's family, without its grade ("Flaming (Greater)" → flaming). */
const runeFamily = (name: string) =>
  name
    .replace(/\s*\((?:Greater|Major|Lesser|Moderate|True)\)\s*$/i, '')
    .trim()
    .toLowerCase()

/**
 * Whether a rune can be etched on the item, and why not (GM Core pp. 224–225): weapon runes on
 * weapons and armor runes on armor (explorer's clothing takes armor runes that name no
 * category), a melee-only rune on a melee weapon, no more property runes than the potency
 * value. A stronger fundamental rune of the same kind replaces the one there.
 */
export function runeProblem(st: Pf2eItemState, rune: Pf2eItemDef): string | undefined {
  const r = rune.rune
  if (!r) return `${rune.name} isn't a rune.`
  const isWeapon = st.kind === 'weapon'
  const isArmor = st.kind === 'armor'
  if (r.onto === 'weapon' && !isWeapon) return 'Weapon runes go on weapons.'
  if (r.onto === 'armor' && !isArmor) return 'Armor runes go on armor.'
  const usage = r.usage.toLowerCase()
  if (/\bmelee weapon\b/.test(usage) && st.ranged) return 'Only on a melee weapon.'
  if (/\branged weapon\b/.test(usage) && !st.ranged) return 'Only on a ranged weapon.'
  const category = (st.category ?? '').toLowerCase()
  const named = ['light', 'medium', 'heavy'].filter((c) => new RegExp(`\\b${c}\\b`).test(usage))
  if (isArmor && named.length && !named.includes(category))
    return `Only on ${named.join(' or ')} armor.`
  const runes = st.runes ?? noRunes()
  if (r.slot !== 'property') {
    const now = runes[r.slot]
    if ((r.value ?? 0) <= now) return `It already has an equal or stronger ${r.slot} rune.`
    return undefined
  }
  const family = runeFamily(rune.name)
  const same = runes.property.find((p) => runeFamily(p.name) === family)
  if (same && same.level >= rune.level) return `It already has ${same.name}.`
  if (!same && runes.property.length >= runes.potency)
    return runes.potency
      ? `A +${runes.potency} potency rune holds ${runes.potency} property rune${runes.potency > 1 ? 's' : ''}.`
      : 'Property runes need a potency rune first.'
  return undefined
}

/** Etches a rune (a stronger one of the same kind replaces the old); returns what happened. */
export function etchRune(item: InventoryItem, rune: Pf2eItemDef): string {
  const st = item.pf2e
  if (!st) return `${item.name} can't take runes.`
  const problem = runeProblem(st, rune)
  if (problem) return problem
  const r = rune.rune!
  const runes = (st.runes ??= noRunes())
  if (r.slot === 'property') {
    const family = runeFamily(rune.name)
    runes.property = [
      ...runes.property.filter((p) => runeFamily(p.name) !== family),
      {
        id: rune.id,
        name: rune.name,
        level: rune.level,
        ...(r.damage ? { damage: r.damage } : {}),
        ...(r.crit ? { crit: r.crit } : {}),
      },
    ]
  } else runes[r.slot] = r.value ?? 0
  st.level = Math.max(st.level ?? 0, rune.level)
  return `Etched ${rune.name} on ${item.name}: ${runedName(item)}.`
}

/**
 * Takes a rune off. Property runes past what the potency holds go dormant (GM Core p. 225):
 * they stay etched but do nothing (`activeProperty`).
 */
export function removeRune(
  item: InventoryItem,
  which: 'potency' | 'striking' | 'resilient' | string,
) {
  const runes = item.pf2e?.runes
  if (!runes) return
  if (which === 'potency' || which === 'striking' || which === 'resilient') runes[which] = 0
  else runes.property = runes.property.filter((p) => p.id !== which)
}

/** Property runes that work: as many as the potency value (GM Core p. 224). */
export const activeProperty = (st: Pf2eItemState) =>
  (st.runes?.property ?? []).slice(0, st.runes?.potency ?? 0)

/** "+1 striking flaming longsword" (GM Core p. 224's order). */
export function runedName(item: InventoryItem) {
  const r = item.pf2e?.runes
  if (!r) return item.name
  const parts = [
    r.potency ? `+${r.potency}` : '',
    FUNDAMENTAL_WORDS.striking![r.striking] ?? '',
    FUNDAMENTAL_WORDS.resilient![r.resilient] ?? '',
    ...r.property.map((p) => runeFamily(p.name)),
    item.name,
  ]
  return parts.filter(Boolean).join(' ')
}

/** The armor the hero wears: the first armor item marked worn. */
export const wornArmor = (s: Pf2eSheet) =>
  s.inventory.find((i) => i.pf2e?.kind === 'armor' && i.pf2e.carry === 'worn')

/**
 * The weapon item a Strike is made with: the one of the same name, preferring a held one,
 * then one with runes.
 */
export function strikeItem(s: Pf2eSheet, strike: string) {
  const named = s.inventory.filter((i) => i.pf2e?.kind === 'weapon' && i.name === strike)
  return (
    named.find((i) => i.pf2e?.carry === 'held' && i.pf2e.runes) ??
    named.find((i) => i.pf2e?.runes) ??
    named[0]
  )
}

/** A Strike's runes: potency, striking dice and the property runes that work. */
export function strikeRunes(s: Pf2eSheet, strike: string) {
  const st = strikeItem(s, strike)?.pf2e
  if (!st?.runes) return undefined
  return { potency: st.runes.potency, striking: st.runes.striking, property: activeProperty(st) }
}

/**
 * Item bonuses runes give (GM Core p. 224): a weapon's potency to its attack rolls, worn
 * armor's potency to AC (whether invested or not), and its resilient rune to saves while it's
 * invested (GM Core p. 219).
 */
export function runeMods(s: Pf2eSheet, kind: string, weapon?: string): ItemMod[] {
  if (kind === 'attack' && weapon) {
    const p = strikeRunes(s, weapon)?.potency ?? 0
    return p ? [{ value: p, type: 'item', source: `+${p} weapon potency` }] : []
  }
  const armor = wornArmor(s)?.pf2e
  if (!armor?.runes) return []
  if (kind === 'ac' && armor.runes.potency)
    return [
      { value: armor.runes.potency, type: 'item', source: `+${armor.runes.potency} armor potency` },
    ]
  if (kind === 'save' && armor.runes.resilient && armor.invested)
    return [
      {
        value: armor.runes.resilient,
        type: 'item',
        source: `${FUNDAMENTAL_WORDS.resilient![armor.runes.resilient]} rune`,
      },
    ]
  return []
}

/**
 * A worn or held item's constant bonuses as permanent effects for the effects engine: on
 * while the item works (`itemActive`). Bonuses that hold only sometimes stay in the note.
 */
export function inventoryEffects(s: Pf2eSheet): Pf2eEffectDef[] {
  const consumable = (st: Pf2eItemState) => !!st.traits?.includes('Consumable')
  return s.inventory.flatMap((item) => {
    const st = item.pf2e
    if (!st?.bonuses?.length || consumable(st) || !itemActive(st)) return []
    const always = st.bonuses.filter((b) => !b.when)
    const sometimes = st.bonuses.filter((b) => b.when)
    if (!always.length && !sometimes.length) return []
    return [
      {
        name: item.name,
        source: { book: 'Item' },
        mode: 'permanent' as const,
        effects: always.map((b) => ({
          kind: 'modifier' as const,
          selector: [b.selector],
          value: b.value,
          type: b.type,
          ...(b.skills ? { skills: b.skills } : {}),
        })),
        ...(sometimes.length ? { note: sometimes.map((b) => b.when).join(' ') } : {}),
      },
    ]
  })
}

// --- Staves and wands (GM Core pp. 278, 282) -------------------------------------------

/** The rank of the hero's highest spell slot (a staff's daily charges, GM Core p. 278). */
export const highestSlot = (s: Pf2eSheet) =>
  (s.spellcasting?.slots ?? []).reduce((top, r, i) => (r.max > 0 ? i + 1 : top), 0)

/**
 * Prepares a staff (GM Core p. 278): charges equal to the highest slot's rank, plus the rank of
 * one slot a prepared caster expends into it. One staff a day; preparing it anew replaces the
 * old charges. `expend` is that slot's rank (and index for a prepared slot).
 */
export function prepareStaff(
  s: Pf2eSheet,
  index: number,
  expend?: { rank: number; slot?: number },
): string {
  const item = s.inventory[index]
  const st = item?.pf2e
  if (!item || st?.kind !== 'staff') return 'That isn’t a staff.'
  const top = highestSlot(s)
  if (!top) return 'You need spell slots to prepare a staff.'
  let extra = 0
  const sc = s.spellcasting
  if (expend && sc?.kind === 'prepared') {
    const row = sc.slots[expend.rank - 1]
    const slot = row?.prepared?.[expend.slot ?? 0]
    if (!slot || slot.cast) return `No unspent rank ${expend.rank} slot to expend.`
    slot.cast = true
    extra = expend.rank
  }
  for (const other of s.inventory)
    if (other !== item && other.pf2e?.kind === 'staff') other.pf2e.charges = 0
  st.charges = top + extra
  return `Prepared ${item.name}: ${st.charges} charge${st.charges === 1 ? '' : 's'}${extra ? ` (${top} + ${extra} from a rank ${expend!.rank} slot)` : ''}.`
}

/**
 * Pays for a spell from a staff (GM Core p. 278): charges equal to its rank, none for a
 * cantrip; a spontaneous caster can pay 1 charge and a slot of that rank or higher instead.
 */
export function spendStaff(
  s: Pf2eSheet,
  index: number,
  rank: number,
  slotRank?: number,
): { ok: boolean; text: string } {
  const item = s.inventory[index]
  const st = item?.pf2e
  if (!item || st?.kind !== 'staff') return { ok: false, text: 'That isn’t a staff.' }
  if (rank === 0) return { ok: true, text: `${item.name}: cantrip, no charge.` }
  const charges = st.charges ?? 0
  if (slotRank) {
    const sc = s.spellcasting
    const slot = sc?.slots[slotRank - 1]
    if (sc?.kind !== 'spontaneous' || !slot)
      return { ok: false, text: 'Only a spontaneous caster adds a slot.' }
    if (slotRank < rank)
      return { ok: false, text: `A rank ${rank} spell needs a rank ${rank} slot or higher.` }
    if (slot.used >= slot.max) return { ok: false, text: `No rank ${slotRank} slots left today.` }
    if (charges < 1) return { ok: false, text: `${item.name} has no charges left.` }
    slot.used += 1
    st.charges = charges - 1
    return {
      ok: true,
      text: `${item.name}: 1 charge and a rank ${slotRank} slot (${st.charges} left).`,
    }
  }
  if (charges < rank)
    return {
      ok: false,
      text: `${item.name} has ${charges} charge${charges === 1 ? '' : 's'}; it takes ${rank}.`,
    }
  st.charges = charges - rank
  return {
    ok: true,
    text: `${item.name}: ${rank} charge${rank === 1 ? '' : 's'} (${st.charges} left).`,
  }
}

/**
 * Uses a wand (GM Core p. 282): once a day; after that it can be overcharged once, a DC 10
 * flat check (success: broken; failure: destroyed); overcharging it again destroys it and
 * no spell is cast. `flat` is the d20. Returns whether the spell goes off and if it's gone.
 */
export function useWand(
  s: Pf2eSheet,
  index: number,
  flat: number,
): { cast: boolean; destroyed: boolean; text: string } {
  const item = s.inventory[index]
  const st = item?.pf2e
  if (!item || st?.kind !== 'wand')
    return { cast: false, destroyed: false, text: 'That isn’t a wand.' }
  const w = (st.wand ??= { cast: false, overcharged: false, broken: false })
  if (w.broken)
    return { cast: false, destroyed: false, text: `${item.name} is broken until it's Repaired.` }
  if (!w.cast) {
    w.cast = true
    return { cast: true, destroyed: false, text: `${item.name}: cast (its use for today).` }
  }
  if (w.overcharged) {
    s.inventory.splice(index, 1)
    return {
      cast: false,
      destroyed: true,
      text: `${item.name} was already overcharged today: it's destroyed and no spell is cast.`,
    }
  }
  w.overcharged = true
  if (flat >= 10) {
    w.broken = true
    return {
      cast: true,
      destroyed: false,
      text: `${item.name} overcharged: flat check ${flat} vs DC 10, success: the spell goes off and the wand is broken.`,
    }
  }
  s.inventory.splice(index, 1)
  return {
    cast: true,
    destroyed: true,
    text: `${item.name} overcharged: flat check ${flat} vs DC 10, failure: the spell goes off and the wand is destroyed.`,
  }
}

/**
 * Daily preparations for items: wands can be cast again (a broken one stays broken until
 * Repaired) and staves lose yesterday's charges until prepared anew (GM Core pp. 278, 282).
 */
export function itemsDailyPrep(s: Pf2eSheet) {
  for (const item of s.inventory) {
    const st = item.pf2e
    if (st?.kind === 'wand' && st.wand) {
      st.wand.cast = false
      st.wand.overcharged = false
    }
    if (st?.kind === 'staff') st.charges = 0
  }
}

/** Spends one of a stack; the last one leaves the inventory. */
export function spendOne(s: Pf2eSheet, index: number) {
  const item = s.inventory[index]
  if (!item) return
  const st = itemState(item)
  if (st.count > 1 && item.pf2e) item.pf2e.count -= 1
  else s.inventory.splice(index, 1)
}
