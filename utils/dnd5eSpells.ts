// Casting a 5e (2024) hero's spells (SRD 5.2.1 pp. 104–106): what a spell can be cast with
// (a slot of its level or higher, a Pact Magic slot, a free cast from a feat, species or
// Mystic Arcanum, at will, or as a Ritual), spending it (one spell slot a turn), Concentration
// (a new Concentration spell ends the last), the spell attack or save DC from the ability the
// spell is cast with, damage and healing from the data (`damage`, `healing`, `scaling`) with
// higher-level slots and cantrip tiers at 5, 11 and 17, Agonizing Blast, Potent Spellcasting,
// Empowered Evocation and Disciple of Life, the effects a spell puts on the caster
// (`SPELL_EFFECTS`), and Font of Magic, Arcane Recovery and Magical Cunning. `SPELL_RULES`
// fills in what the data's fields can't say (Eldritch Blast's beams, Magic Missile's darts);
// tests/dnd5eRules.test.ts checks its slugs are in the data. Pure; tests/dnd5eSpells.test.ts.
import type { Dnd5eSpellDef } from '~/data/dnd5e/types'
import type { Dnd5eSheet, Dnd5eSpellRef } from '~/types/sheets'
import { type Dnd5eTarget, adjustAttackTest } from '~/utils/dnd5eAttacks'
import {
  DND5E_EFFECTS,
  SPELL_EFFECTS,
  activeEffectDefs,
  addEffect,
  hasEffect,
} from '~/utils/dnd5eEffects'
import { gearSpellAttack } from '~/utils/dnd5eMagicItems'
import {
  type D20Mode,
  type Dnd5eCost,
  costWhy,
  d20Test,
  dnd5eHero,
  gainTempHp,
  rollTest,
  startConcentration,
  useOnce,
  usedOnce,
  usesLeft,
  restoreUses,
  spendUses,
} from '~/utils/dnd5ePlay'
import { type Rng, parseDice, rollDice, sign } from '~/utils/dice'

/** Cantrip damage tier by character level: 1, then 2 at 5, 3 at 11, 4 at 17 (SRD 5.2.1 p. 104). */
export const cantripTier = (level: number) =>
  level >= 17 ? 4 : level >= 11 ? 3 : level >= 5 ? 2 : 1

/** What the data's fields don't say about a spell, by slug. */
export interface Dnd5eSpellRule {
  /** Separate attack rolls (Eldritch Blast's beams by cantrip tier, Scorching Ray's rays). */
  attacks?: 'tier' | { base: number; perLevel: number }
  /** Separate darts that always hit (Magic Missile: 3, +1 per slot level above 1). */
  darts?: { base: number; perLevel: number }
  /** Damage the data leaves out (Chromatic Orb's 3d8 of the chosen type). */
  damage?: { dice: string; type: string; addMod?: boolean }
  /** Temporary Hit Points it gives (False Life 2d4 + 4, +5 per slot level above 1). */
  temp?: { dice: string; perLevel: number }
  /** Flat healing (Heal 70, +10 per slot level above 6). */
  healFlat?: { amount: number; perLevel: number }
  /** It rolls nothing when cast: its effect does the work later (Hunter's Mark, Hex). */
  noRoll?: boolean
}

export const SPELL_RULES: Record<string, Dnd5eSpellRule> = {
  'eldritch-blast': { attacks: 'tier' },
  'scorching-ray': { attacks: { base: 3, perLevel: 1 } },
  'magic-missile': { darts: { base: 3, perLevel: 1 } },
  'chromatic-orb': { damage: { dice: '3d8', type: 'chosen' } },
  'spiritual-weapon': { damage: { dice: '1d8', type: 'Force', addMod: true } },
  'dragons-breath': { damage: { dice: '3d6', type: 'chosen' } },
  'false-life': { temp: { dice: '2d4+4', perLevel: 5 } },
  'armor-of-agathys': { temp: { dice: '5', perLevel: 5 } },
  heal: { healFlat: { amount: 70, perLevel: 10 } },
  'hunters-mark': { noRoll: true },
  hex: { noRoll: true },
}

/** How a spell can be cast now. */
export interface Dnd5eCastOption {
  key: string
  label: string
  /** The level it's cast at (0 for a cantrip). */
  level: number
  kind: 'cantrip' | 'slot' | 'pact' | 'free' | 'resource' | 'atWill' | 'ritual'
  /** Uses of it left (slots of that level, free casts). */
  left?: number
}

const ORD = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th']
export const levelName = (n: number) => (n === 0 ? 'Cantrip' : `${ORD[n]} level`)

export function slotsMax(s: Dnd5eSheet): number[] {
  return Array.from({ length: 9 }, (_, i) => s.castingStats?.slots[i] ?? 0)
}

/** Slots of each level left (Font of Magic can make extra ones, past the maximum). */
export function slotsLeft(s: Dnd5eSheet): number[] {
  const max = slotsMax(s)
  return max.map((m, i) => Math.max(0, m - (s.slotsUsed?.[i] ?? 0)))
}

export function pactLeft(s: Dnd5eSheet): number {
  const p = s.castingStats?.pact
  return p ? Math.max(0, p.slots - (s.pactUsed ?? 0)) : 0
}

const freeKey = (ref: Pick<Dnd5eSpellRef, 'slug' | 'from'>) => `${ref.slug}|${ref.from}`

/**
 * The resource that pays a feat's or species' free cast when the spell ref has no `free`
 * itself ("Magic Initiate: Level 1 Spell" for a spell from "Magic Initiate (Wizard): spell").
 */
export function freeResource(s: Dnd5eSheet, ref: Dnd5eSpellRef): string {
  if (ref.level === 0) return ''
  const r = (s.resources ?? []).find((x) => /spell/i.test(x.name) && ref.from.startsWith(x.from))
  return r?.name ?? ''
}

export function freeLeft(s: Dnd5eSheet, ref: Dnd5eSpellRef): number {
  if (!ref.free) return 0
  const max = typeof ref.free.count === 'number' ? ref.free.count : 1
  return Math.max(0, max - (s.freeUsed?.[freeKey(ref)] ?? 0))
}

/** Can it be cast as a Ritual (SRD 5.2.1 p. 187): a Ritual spell prepared, or in a Wizard's book. */
function ritualOk(s: Dnd5eSheet, ref: Dnd5eSpellRef, def: Dnd5eSpellDef, level: number) {
  if (!def.ritual) return false
  if (!ref.book) return true
  return dnd5eHero(s, level).has('Ritual Adept')
}

/** Every way the spell can be cast now, cheapest first; the highest slots last. */
export function castOptions(
  s: Dnd5eSheet,
  level: number,
  ref: Dnd5eSpellRef,
  def: Dnd5eSpellDef,
): Dnd5eCastOption[] {
  if (def.level === 0) return [{ key: 'cantrip', label: 'Cantrip', level: 0, kind: 'cantrip' }]
  const out: Dnd5eCastOption[] = []
  if (ref.atWill) out.push({ key: 'atWill', label: 'At will', level: def.level, kind: 'atWill' })
  if (ref.free)
    out.push({
      key: 'free',
      label: 'Free cast',
      level: def.level,
      kind: 'free',
      left: freeLeft(s, ref),
    })
  const res = freeResource(s, ref)
  if (res)
    out.push({
      key: 'resource',
      label: res,
      level: def.level,
      kind: 'resource',
      left: usesLeft(s, res),
    })
  if (!ref.book || ref.always) {
    const left = slotsLeft(s)
    for (let l = def.level; l <= 9; l++)
      if ((s.castingStats?.slots[l - 1] ?? 0) > 0 || (left[l - 1] ?? 0) > 0)
        out.push({
          key: `slot${l}`,
          label: `${ORD[l]}-level slot`,
          level: l,
          kind: 'slot',
          left: left[l - 1] ?? 0,
        })
    const p = s.castingStats?.pact
    if (p && p.level >= def.level)
      out.push({
        key: 'pact',
        label: `Pact slot (level ${p.level})`,
        level: p.level,
        kind: 'pact',
        left: pactLeft(s),
      })
  }
  if (ritualOk(s, ref, def, level))
    out.push({ key: 'ritual', label: 'As a Ritual (+10 min)', level: def.level, kind: 'ritual' })
  return out
}

/** What casting takes on the turn (SRD 5.2.1 p. 105): the Magic action, a Bonus Action, a Reaction, or longer. */
export function spellCost(def: Pick<Dnd5eSpellDef, 'activation'>): Dnd5eCost {
  const a = def.activation
  if (a === 'bonus') return 'bonus'
  if (a === 'reaction') return 'reaction'
  if (a === 'time') return 'time'
  if (a === 'free' || a === 'special') return 'free'
  return 'magic'
}

/** Why the spell can't be cast with `opt` now, or ''. */
export function castWhy(
  s: Dnd5eSheet,
  def: Dnd5eSpellDef,
  opt: Dnd5eCastOption | undefined,
): string {
  if (!opt) return 'No slot left'
  const beastSpells = dnd5eHero(s, 0).has('Beast Spells')
  const rage = activeEffectDefs(s).find(
    (d) =>
      d.noSpells &&
      !(d.key === 'wild-shape' && beastSpells && !def.components.cost && !def.components.consumed),
  )
  if (rage) return `No spells while in ${rage.name}`
  const cost = opt.kind === 'ritual' ? 'time' : spellCost(def)
  const turn = costWhy(s, cost)
  if (turn) return turn
  if (opt.left !== undefined && opt.left < 1)
    return opt.kind === 'slot' || opt.kind === 'pact' ? 'No slot left' : 'None left'
  if ((opt.kind === 'slot' || opt.kind === 'pact') && s.turn?.active && usedOnce(s, 'slot'))
    return 'One spell slot a turn'
  return ''
}

/** Spends what the cast takes; returns what was spent ("a 3rd-level slot"). */
export function spendCast(s: Dnd5eSheet, ref: Dnd5eSpellRef, opt: Dnd5eCastOption): string {
  if (opt.kind === 'slot') {
    const used = [...(s.slotsUsed ?? [])]
    while (used.length < 9) used.push(0)
    used[opt.level - 1] = (used[opt.level - 1] ?? 0) + 1
    s.slotsUsed = used
    if (s.turn?.active) useOnce(s, 'slot')
    return `a ${ORD[opt.level]}-level slot`
  }
  if (opt.kind === 'pact') {
    s.pactUsed = (s.pactUsed ?? 0) + 1
    if (s.turn?.active) useOnce(s, 'slot')
    return 'a Pact Magic slot'
  }
  if (opt.kind === 'free') {
    s.freeUsed = { ...s.freeUsed, [freeKey(ref)]: (s.freeUsed?.[freeKey(ref)] ?? 0) + 1 }
    return 'its free cast'
  }
  if (opt.kind === 'resource') {
    spendUses(s, opt.label)
    return opt.label
  }
  if (opt.kind === 'ritual') return 'no slot (Ritual)'
  return ''
}

/** The cast's spell attack bonus and save DC, from the ability the spell is cast with (p. 106). */
export function spellNumbers(s: Dnd5eSheet, level: number, ref: Pick<Dnd5eSpellRef, 'ability'>) {
  const hero = dnd5eHero(s, level)
  const mod = hero.mod(ref.ability)
  const fx = activeEffectDefs(s).filter((d) => d.spell)
  const dcBonus = fx.reduce((n, d) => n + (d.spell?.dc ?? 0), 0)
  const wand = gearSpellAttack(s).reduce((n, g) => n + g.value, 0)
  return {
    mod,
    attack: mod + hero.pb + wand,
    dc: 8 + mod + hero.pb + dcBonus,
    /** Effects giving the spell attacks Advantage (Innate Sorcery). */
    adv: fx.filter((d) => d.spell?.adv).map((d) => d.name),
  }
}

function cantripsWithAgonizing(s: Dnd5eSheet): string[] {
  const picked = Object.entries(s.choices ?? {})
    .filter(([k]) => /agonizing-blast/.test(k))
    .flatMap(([, v]) => v)
  if (picked.length) return picked
  return dnd5eHero(s, 0).option('agonizing-blast') ? ['eldritch-blast'] : []
}

/** The spell's damage dice at this cast, with what adds to them (a part per damage type). */
export function spellDamage(
  s: Dnd5eSheet,
  level: number,
  ref: Dnd5eSpellRef,
  def: Dnd5eSpellDef,
  castLevel: number,
): { parts: { dice: string; type: string }[]; flat: { label: string; value: number }[] } {
  const rule = SPELL_RULES[def.slug]
  if (rule?.noRoll || rule?.temp || rule?.healFlat) return { parts: [], flat: [] }
  const hero = dnd5eHero(s, level)
  // The same type twice is a choice between them (Toll the Dead's d8 or d12): the first.
  let parts = (def.damage ?? [])
    .filter((d, i, all) => all.findIndex((x) => x.type === d.type) === i)
    .map((d) => ({ ...d }))
  if (!parts.length && rule?.damage) parts = [{ dice: rule.damage.dice, type: rule.damage.type }]
  if (!parts.length) return { parts: [], flat: [] }
  const tier = cantripTier(level)
  const up = Math.max(0, castLevel - def.level)
  const grow = (dice: string, times: number, by?: string) => {
    const d = parseDice(dice)
    if (!d) return dice
    const step = by ? parseDice(by) : null
    if (step && step.sides === d.sides)
      return `${d.count + step.count * times}d${d.sides}${d.mod ? sign(d.mod) : ''}`
    if (!by) return `${d.count * (times + 1)}d${d.sides}${d.mod ? sign(d.mod) : ''}`
    return dice
  }
  if (def.level === 0 && rule?.attacks !== 'tier' && tier > 1)
    parts = parts.map((p, i) => ({
      ...p,
      dice: i === 0 || !def.scaling?.dice ? grow(p.dice, tier - 1, def.scaling?.dice) : p.dice,
    }))
  if (
    def.level > 0 &&
    up &&
    def.scaling?.kind === 'slot' &&
    def.scaling.dice &&
    !rule?.attacks &&
    !rule?.darts
  ) {
    const step = parseDice(def.scaling.dice)
    const first = parts[0]!
    if (step && parseDice(first.dice)?.sides === step.sides)
      first.dice = grow(first.dice, up, def.scaling.dice)
    else if (step) parts.push({ dice: `${step.count * up}d${step.sides}`, type: first.type })
  }
  const flat: { label: string; value: number }[] = []
  const mod = hero.mod(ref.ability)
  if (rule?.damage?.addMod) flat.push({ label: ref.ability, value: mod })
  if (def.level === 0 && cantripsWithAgonizing(s).includes(def.slug))
    flat.push({ label: 'Agonizing Blast', value: hero.mod('CHA') })
  const potent = (cls: string, feature: string) => ref.from.startsWith(cls) && hero.has(feature)
  if (
    def.level === 0 &&
    (hero.has('Potent Spellcasting') ||
      potent('Cleric', 'Blessed Strikes: Potent Spellcasting') ||
      potent('Druid', 'Elemental Fury: Potent Spellcasting'))
  )
    flat.push({ label: 'Potent Spellcasting', value: hero.mod('WIS') })
  if (
    def.school === 'Evocation' &&
    hero.has('Empowered Evocation') &&
    ref.from.startsWith('Wizard')
  )
    flat.push({ label: 'Empowered Evocation', value: hero.mod('INT') })
  for (const b of spellBonuses(s, level, ref, def, parts)) {
    if (b.dice) parts.push({ dice: b.dice, type: b.type ?? parts[0]!.type })
    else flat.push({ label: b.label, value: b.value ?? 0 })
  }
  return { parts, flat: flat.filter((f) => f.value) }
}

/**
 * Subclass bonuses to a spell's damage (one roll each): Elemental Affinity's CHA to its type
 * (SRD 5.2.1 p. 70), Radiant Soul's CHA to Radiant or Fire, the Alchemist's Alchemical Savant
 * and Chemical Mastery, the Artillerist's Arcane Firearm, the Cartographer's Guided Precision,
 * Shadowform's Void Empowerment and the College of Spirits' Power from Beyond.
 */
function spellBonuses(
  s: Dnd5eSheet,
  level: number,
  ref: Dnd5eSpellRef,
  def: Dnd5eSpellDef,
  parts: { dice: string; type: string }[],
): { label: string; value?: number; dice?: string; type?: string }[] {
  const hero = dnd5eHero(s, level)
  const types = parts.map((p) => p.type.toLowerCase())
  const of = (...t: string[]) => t.some((x) => types.includes(x.toLowerCase()))
  const artificer =
    /^(Artificer|Alchemist|Artillerist|Armorer|Battle Smith|Cartographer|Reanimator)/.test(ref.from)
  const slot = def.level > 0
  const out: { label: string; value?: number; dice?: string; type?: string }[] = []
  const affinity = Object.entries(s.choices ?? {}).find(([k]) =>
    /elemental-affinity/.test(k),
  )?.[1]?.[0]
  if (hero.has('Elemental Affinity') && affinity && of(affinity))
    out.push({ label: 'Elemental Affinity', value: hero.mod('CHA') })
  if (hero.has('Radiant Soul') && of('Radiant', 'Fire'))
    out.push({ label: 'Radiant Soul (once a turn)', value: hero.mod('CHA') })
  if (hero.has('Alchemical Savant') && artificer && of('Acid', 'Fire', 'Poison'))
    out.push({ label: 'Alchemical Savant', value: Math.max(1, hero.mod('INT')) })
  if (hero.has('Guided Precision') && ref.from.startsWith('Cartographer'))
    out.push({ label: 'Guided Precision (once a turn)', value: hero.mod('INT') })
  if (hero.has('Arcane Firearm') && artificer) out.push({ label: 'Arcane Firearm', dice: '1d8' })
  if (hero.has('Chemical Mastery') && artificer && of('Acid', 'Fire', 'Poison'))
    out.push({ label: 'Alchemical Eruption', dice: '2d8', type: 'Force' })
  if (hasEffect(s, 'shadowform') && slot && of('Psychic', 'Necrotic'))
    out.push({ label: 'Void Empowerment', dice: '1d6' })
  if (hero.has('Empowered Channeling') && slot && ref.from.startsWith('Bard'))
    out.push({ label: 'Power from Beyond', dice: '1d6' })
  return out
}

/** Separate attack rolls or darts the cast makes. */
export function castCount(def: Dnd5eSpellDef, level: number, castLevel: number): number {
  const r = SPELL_RULES[def.slug]
  if (r?.attacks === 'tier') return cantripTier(level)
  const n = r?.attacks ?? r?.darts
  if (n && typeof n === 'object') return n.base + n.perLevel * Math.max(0, castLevel - def.level)
  return 1
}

const spellText = (def: Dnd5eSpellDef) => `${def.text ?? ''} ${def.summary ?? ''}`

/** Healing dice and what's added (the spellcasting modifier when the spell says so, Disciple of Life). */
export function spellHealing(
  s: Dnd5eSheet,
  level: number,
  ref: Dnd5eSpellRef,
  def: Dnd5eSpellDef,
  castLevel: number,
): { dice: string; flat: { label: string; value: number }[] } | null {
  const rule = SPELL_RULES[def.slug]
  const hero = dnd5eHero(s, level)
  const up = Math.max(0, castLevel - def.level)
  const flat: { label: string; value: number }[] = []
  if (hero.has('Disciple of Life') && def.level > 0)
    flat.push({ label: 'Disciple of Life', value: 2 + castLevel })
  if (hero.has('Alchemical Savant') && /^(Artificer|Alchemist)/.test(ref.from))
    flat.push({ label: 'Alchemical Savant', value: Math.max(1, hero.mod('INT')) })
  if (rule?.healFlat) {
    flat.unshift({ label: def.name, value: rule.healFlat.amount + rule.healFlat.perLevel * up })
    return { dice: '', flat }
  }
  if (!def.healing) return null
  let dice = def.healing
  const step = def.scaling?.kind === 'slot' && def.scaling.dice ? parseDice(def.scaling.dice) : null
  const d = parseDice(dice)
  if (step && d && step.sides === d.sides && up)
    dice = `${d.count + step.count * up}d${d.sides}${d.mod ? sign(d.mod) : ''}`
  if (/spellcasting ability modifier|spellcasting modifier/i.test(spellText(def)))
    flat.unshift({ label: ref.ability, value: hero.mod(ref.ability) })
  return { dice, flat }
}

/** "8d6 Fire", "1d10+4 Force ×3 beams": what the card says the spell deals. */
export function damageLine(
  s: Dnd5eSheet,
  level: number,
  ref: Dnd5eSpellRef,
  def: Dnd5eSpellDef,
  castLevel: number,
): string {
  const { parts, flat } = spellDamage(s, level, ref, def, castLevel)
  if (!parts.length) return ''
  const add = flat.reduce((n, f) => n + f.value, 0)
  const n = castCount(def, level, castLevel)
  const dice = parts
    .map((p, i) => `${p.dice}${i === 0 && add ? sign(add) : ''} ${p.type}`)
    .join(' + ')
  const many = SPELL_RULES[def.slug]?.darts
    ? 'darts'
    : SPELL_RULES[def.slug]?.attacks
      ? def.slug === 'eldritch-blast'
        ? 'beams'
        : 'rays'
      : ''
  return n > 1 ? `${dice} ×${n} ${many}` : dice
}

export interface Dnd5eCastResult {
  line: string
  /** Healing rolled, for "Heal yourself". */
  healing: number | null
  damage: number | null
}

function rollParts(parts: { dice: string; type: string }[], crit: boolean, rng?: Rng) {
  let total = 0
  const text: string[] = []
  for (const p of parts) {
    const d = parseDice(p.dice)
    if (!d) {
      const n = Number(p.dice)
      if (Number.isFinite(n)) {
        total += n
        text.push(`${n} ${p.type.toLowerCase()}`)
      }
      continue
    }
    const r = rollDice({ count: d.count * (crit ? 2 : 1), sides: d.sides, mod: d.mod }, rng)
    total += r.total
    text.push(
      `${d.count * (crit ? 2 : 1)}d${d.sides}${d.mod ? sign(d.mod) : ''}: ${r.rolls.join('+')} ${p.type.toLowerCase()}`,
    )
  }
  return { total, text }
}

const againstTarget = (n: number, t: Dnd5eTarget | undefined) =>
  !t ? n : t.immune ? 0 : (t.resist ? Math.floor(n / 2) : n) * (t.vulnerable ? 2 : 1)

/**
 * Casts the spell with `opt` (the cost on the turn is the caller's): spends the slot or use,
 * starts Concentration (ending the last), puts its effect on the caster, then rolls: each
 * spell attack against the target (a natural 20 doubles the dice), or the damage once with the
 * save DC, healing, or temporary HP.
 */
export function castSpell(
  s: Dnd5eSheet,
  level: number,
  ref: Dnd5eSpellRef,
  def: Dnd5eSpellDef,
  opt: Dnd5eCastOption,
  o: { target?: Dnd5eTarget; mode?: D20Mode; rng?: Rng } = {},
): Dnd5eCastResult {
  const notes: string[] = []
  const spent = spendCast(s, ref, opt)
  const at = opt.level > def.level ? ` at ${ORD[opt.level]} level` : ''
  if (def.concentration) {
    const ended = startConcentration(s, {
      slug: def.slug,
      name: def.name,
      level: opt.level,
      school: def.school,
    })
    if (ended) notes.push(`${ended} ends (Concentration)`)
  }
  const fx = SPELL_EFFECTS[def.slug]
  if (fx && DND5E_EFFECTS[fx]) {
    addEffect(s, fx, { ends: def.concentration ? 'concentration' : DND5E_EFFECTS[fx]!.ends })
    notes.push(`${DND5E_EFFECTS[fx]!.name} is on`)
  }
  const nums = spellNumbers(s, level, ref)
  const head = `${def.name}${at}${spent ? ` (${spent})` : ''}`
  const rule = SPELL_RULES[def.slug]
  let damage: number | null = null
  let healing: number | null = null
  const lines: string[] = []
  if (rule?.temp) {
    const up = Math.max(0, opt.level - def.level)
    const d = parseDice(rule.temp.dice)
    const n = (d ? rollDice(d, o.rng).total : Number(rule.temp.dice)) + rule.temp.perLevel * up
    lines.push(gainTempHp(s, n, def.name))
  }
  const dmg = spellDamage(s, level, ref, def, opt.level)
  const add = dmg.flat.reduce((n, f) => n + f.value, 0)
  if (dmg.parts.length && def.attack) {
    const count = castCount(def, level, opt.level)
    let total = 0
    for (let i = 0; i < count; i++) {
      const t = d20Test(s, level, {
        label: count > 1 ? `${def.name} ${i + 1}` : def.name,
        kind: 'attack',
        ability: ref.ability,
        bonus: nums.attack,
        lines: [`Spell attack ${sign(nums.attack)}`],
      })
      adjustAttackTest(s, t, {
        melee: def.attack === 'melee',
        strength: false,
        ...(o.target ? { target: o.target } : {}),
      })
      t.adv.push(...nums.adv)
      const r = rollTest(s, t, { mode: o.mode ?? 'normal', ...(o.rng ? { rng: o.rng } : {}) })
      const ac = o.target?.ac ?? null
      const crit = r.natural === 20
      const hit = r.natural === 1 ? false : crit ? true : ac === null ? null : r.total >= ac
      const roll = `${r.total} to hit${ac !== null ? ` vs AC ${ac}` : ''} (${r.rolls.length > 1 ? `${r.rolls.join(' / ')} → ` : ''}${r.d20} ${sign(t.bonus)})`
      if (hit === false) {
        lines.push(`${count > 1 ? `${t.label}: ` : ''}${roll} · miss.`)
        continue
      }
      const d = rollParts(dmg.parts, crit, o.rng)
      const n = againstTarget(Math.max(0, d.total + add), o.target)
      total += n
      lines.push(
        `${count > 1 ? `${t.label}: ` : ''}${roll} · ${crit ? 'Critical Hit! ' : hit ? '' : 'if it hits, '}${n} damage (${d.text.join(' + ')}${add ? ` ${sign(add)}` : ''}).`,
      )
    }
    damage = total
  } else if (dmg.parts.length) {
    const count = castCount(def, level, opt.level)
    let total = 0
    const each: number[] = []
    for (let i = 0; i < count; i++) {
      const d = rollParts(dmg.parts, false, o.rng)
      const n = againstTarget(Math.max(0, d.total + add), o.target)
      each.push(n)
      total += n
      if (count === 1)
        lines.push(
          `${n} damage (${d.text.join(' + ')}${add ? ` ${sign(add)}` : ''})${def.save ? '' : '.'}`,
        )
    }
    if (count > 1) lines.push(`${count} darts: ${each.join(' + ')} = ${total} damage.`)
    if (def.save) {
      const half = /half as much|half damage/i.test(spellText(def))
      const last = lines.length - 1
      lines[last] =
        `DC ${nums.dc} ${def.save} save: ${lines[last]}${half ? ', half on a success' : ''}.`
    }
    damage = total
  } else if (def.save) {
    lines.push(`DC ${nums.dc} ${def.save} save.`)
  }
  const h = spellHealing(s, level, ref, def, opt.level)
  if (h) {
    const d = h.dice ? parseDice(h.dice) : null
    const supreme = dnd5eHero(s, level).has('Supreme Healing')
    const r = d
      ? supreme
        ? { total: d.count * d.sides + d.mod, rolls: Array(d.count).fill(d.sides) as number[] }
        : rollDice(d, o.rng)
      : null
    const add2 = h.flat.reduce((n, f) => n + f.value, 0)
    healing = Math.max(0, (r?.total ?? 0) + add2)
    lines.push(
      `Heals ${healing}${r ? ` (${h.dice}: ${r.rolls.join('+')}${add2 ? ` ${sign(add2)}` : ''})` : ''}${h.flat.length ? ` with ${h.flat.map((f) => f.label).join(', ')}` : ''}.`,
    )
  }
  notes.push(...castExtras(s, level, ref, def, opt, { damage, healing, rng: o.rng }))
  const line = [`${head}:`, ...lines, ...(notes.length ? [`${notes.join('; ')}.`] : [])].join(' ')
  return { line: line.endsWith(':') ? `${head}.` : line, healing, damage }
}

/**
 * What casting sets off: the Abjurer's Arcane Ward (made by the first Abjuration slot spell
 * after a Long Rest, 2 × Wizard level + INT, and topped up 2 × the slot's level by the next),
 * the Winter Walker's Hunter's Rime temporary HP, Tides of Chaos coming back with a Wild Magic
 * Surge roll, Potent Cantrip's half damage, Improved Blessed Strikes' temporary HP, Blessed
 * Healer.
 */
function castExtras(
  s: Dnd5eSheet,
  level: number,
  ref: Dnd5eSpellRef,
  def: Dnd5eSpellDef,
  opt: Dnd5eCastOption,
  o: { damage: number | null; healing: number | null; rng?: Rng },
): string[] {
  const hero = dnd5eHero(s, level)
  const out: string[] = []
  const slot = opt.kind === 'slot' || opt.kind === 'pact'
  if (def.school === 'Abjuration' && slot && hero.has('Arcane Ward')) {
    const max = 2 * level + hero.mod('INT')
    if (!s.arcaneWard && usesLeft(s, 'Arcane Ward') > 0) {
      spendUses(s, 'Arcane Ward')
      s.arcaneWard = max
      out.push(`Arcane Ward: ${max} HP`)
    } else if (s.arcaneWard !== undefined && usesLeft(s, 'Arcane Ward') < 1) {
      s.arcaneWard = Math.min(max, (s.arcaneWard ?? 0) + 2 * opt.level)
      out.push(`Arcane Ward: ${s.arcaneWard}/${max} HP`)
    }
  }
  if (def.slug === 'hunters-mark' && hero.has('Hunter’s Rime')) {
    const n = rollDice({ count: 1, sides: 10, mod: 0 }, o.rng).total + level
    out.push(gainTempHp(s, n, 'Hunter’s Rime').replace(/\.$/, ''))
  }
  if (slot && ref.from.startsWith('Sorcerer') && hero.has('Wild Magic Surge')) {
    if ((s.used?.['Tides of Chaos'] ?? 0) > 0) {
      restoreUses(s, 'Tides of Chaos')
      out.push('Tides of Chaos is back: roll on the Wild Magic Surge table')
    } else if (useOnce(s, 'surge')) {
      const d = rollDice({ count: 1, sides: 20, mod: 0 }, o.rng).total
      const twice = hero.has('Controlled Chaos') ? ' (roll on it twice and pick one)' : ''
      out.push(
        `Wild Magic Surge d20: ${d}${d === 20 ? `, a surge: roll on the table${twice}` : ''}`,
      )
    }
  }
  if (def.level === 0 && o.damage !== null && hero.has('Potent Cantrip'))
    out.push('Potent Cantrip: on a miss or a successful save it still takes half')
  if (
    def.level === 0 &&
    o.damage &&
    ref.from.startsWith('Cleric') &&
    hero.has('Blessed Strikes: Potent Spellcasting') &&
    hero.has('Improved Blessed Strikes')
  )
    out.push(`you or a creature within 60 ft can gain ${2 * hero.mod('WIS')} temporary HP`)
  if (o.healing && slot && hero.has('Blessed Healer'))
    out.push(`Blessed Healer: if it healed someone else, you regain ${2 + opt.level}`)
  if (def.slug === 'divine-smite' && hero.has('Smite of Protection'))
    out.push(
      'Smite of Protection: you and allies in your aura have Half Cover until your next turn',
    )
  if (o.damage && hero.has('Infusion of Light') && def.damage?.some((d) => d.type === 'Radiant')) {
    const r = s.resources?.find((x) => x.name === 'Lay on Hands')
    if (r && (s.used?.['Lay on Hands'] ?? 0) > 0) {
      const n = Math.min(o.damage, s.used!['Lay on Hands']!)
      restoreUses(s, 'Lay on Hands', n)
      out.push(`Infusion of Light: ${n} back in your Lay on Hands pool`)
    }
  }
  if (slot && def.school === 'Divination' && opt.level >= 2 && hero.has('Expert Divination')) {
    const back = [...Array(Math.min(5, opt.level - 1)).keys()]
      .map((i) => i + 1)
      .reverse()
      .find((l) => (s.slotsUsed?.[l - 1] ?? 0) > 0)
    if (back) {
      const used = [...(s.slotsUsed ?? [])]
      used[back - 1] = (used[back - 1] ?? 0) - 1
      s.slotsUsed = used
      out.push(`Expert Divination: a ${ORD[back]}-level slot back`)
    }
  }
  if (slot && def.school === 'Evocation' && hero.has('Sculpt Spells'))
    out.push(
      `Sculpt Spells: up to ${1 + opt.level} creatures you see succeed on the save and take no damage`,
    )
  if (
    slot &&
    (def.school === 'Enchantment' || def.school === 'Illusion') &&
    hero.has('Bewitching Magic')
  )
    out.push('Bewitching Magic: cast Misty Step as part of the same action, with no slot')
  if ((s.conditions ?? []).includes('Invisible') && hero.has('Magical Ambush') && def.save)
    out.push('Magical Ambush: its targets have Disadvantage on the save this turn')
  return out
}

// --- Slot features ------------------------------------------------------------------------

/** Sorcery Points a slot is worth, and what a slot costs to make (SRD 5.2.1 p. 66), up to 5th level. */
export const FONT_COST: Record<number, number> = { 1: 2, 2: 3, 3: 5, 4: 6, 5: 7 }
export const SORCERY_POINTS = 'Font of Magic'

/** Font of Magic: spend a slot for Sorcery Points equal to its level (no more than the maximum). */
export function slotToPoints(s: Dnd5eSheet, slotLevel: number): string {
  if ((slotsLeft(s)[slotLevel - 1] ?? 0) < 1) return 'No slot of that level left.'
  const used = s.used?.[SORCERY_POINTS] ?? 0
  if (used <= 0) return 'Your Sorcery Points are full.'
  const gain = Math.min(slotLevel, used)
  const slots = [...(s.slotsUsed ?? [])]
  while (slots.length < 9) slots.push(0)
  slots[slotLevel - 1] = (slots[slotLevel - 1] ?? 0) + 1
  s.slotsUsed = slots
  s.used = { ...s.used, [SORCERY_POINTS]: used - gain }
  return `Font of Magic: a ${ORD[slotLevel]}-level slot into ${gain} Sorcery Point${gain === 1 ? '' : 's'}.`
}

/** Font of Magic: spend Sorcery Points for a slot (it vanishes on a Long Rest). */
export function pointsToSlot(s: Dnd5eSheet, slotLevel: number): string {
  const cost = FONT_COST[slotLevel]
  if (!cost) return 'Font of Magic makes slots up to 5th level.'
  if (!spendUses(s, SORCERY_POINTS, cost)) return `Not enough Sorcery Points (${cost} needed).`
  const slots = [...(s.slotsUsed ?? [])]
  while (slots.length < 9) slots.push(0)
  slots[slotLevel - 1] = (slots[slotLevel - 1] ?? 0) - 1
  s.slotsUsed = slots
  return `Font of Magic: ${cost} Sorcery Points into a ${ORD[slotLevel]}-level slot.`
}

/** Gives back one spent slot of a level (for features like Arcane Recovery). */
function regainSlot(s: Dnd5eSheet, slotLevel: number): boolean {
  const used = s.slotsUsed?.[slotLevel - 1] ?? 0
  if (used <= 0) return false
  const slots = [...(s.slotsUsed ?? [])]
  slots[slotLevel - 1] = used - 1
  s.slotsUsed = slots
  return true
}

/**
 * Arcane Recovery (SRD 5.2.1 p. 77): once a Long Rest, after a Short Rest, regain spent slots
 * whose levels add up to half your Wizard level (rounded up) or less, none 6th level or higher.
 */
export function arcaneRecovery(s: Dnd5eSheet, level: number, levels: number[]): string {
  const budget = Math.ceil(level / 2)
  const total = levels.reduce((n, l) => n + l, 0)
  if (!levels.length) return 'Choose the slots to regain.'
  if (levels.some((l) => l >= 6))
    return 'Arcane Recovery can’t regain slots of 6th level or higher.'
  if (total > budget) return `Those slots add up to ${total}; you can regain ${budget}.`
  if (!spendUses(s, 'Arcane Recovery')) return 'Arcane Recovery is used until your next Long Rest.'
  const got = levels.filter((l) => regainSlot(s, l))
  return `Arcane Recovery: regained ${got.map((l) => `a ${ORD[l]}-level slot`).join(', ') || 'nothing (no slots spent)'}.`
}

/** Magical Cunning (Warlock 2): regain up to half your Pact Magic slots (rounded up), once a Long Rest. */
export function magicalCunning(s: Dnd5eSheet): string {
  const p = s.castingStats?.pact
  if (!p) return ''
  if (!spendUses(s, 'Magical Cunning')) return 'Magical Cunning is used until your next Long Rest.'
  const back = Math.min(s.pactUsed ?? 0, Math.ceil(p.slots / 2))
  s.pactUsed = (s.pactUsed ?? 0) - back
  return `Magical Cunning: ${back} Pact Magic slot${back === 1 ? '' : 's'} back.`
}

/** What gives a limited use back early, read from the data's `restore` ("a level 5 spell slot"). */
export interface Dnd5eRestoreCost {
  /** A spell slot of at least this level (`pact`: a Pact Magic slot). */
  slot?: number | 'pact'
  /** Uses of another resource, by its sheet name. */
  resource?: string
  n: number
  /** The use comes back per slot level (Mystic Focus: Focus Points equal to the slot's level). */
  perLevel?: boolean
}

const RESTORE_RESOURCES: [RegExp, string][] = [
  [/superiority di/i, 'Combat Superiority'],
  [/psionic energy di/i, 'Psionic Power'],
  [/sorcery points?/i, SORCERY_POINTS],
  [/use of rage/i, 'Rage'],
  [/bardic inspiration/i, 'Bardic Inspiration'],
  [/channel divinity/i, 'Channel Divinity'],
  [/second wind/i, 'Second Wind'],
]

/** Reads a `restore` text; null when it's something the sheet doesn't track (a soul trinket). */
export function restoreCost(text: string | undefined): Dnd5eRestoreCost | null {
  if (!text) return null
  if (/pact magic spell slot/i.test(text)) return { slot: 'pact', n: 1 }
  const lvl = /level (\d)\+? spell slot/i.exec(text)
  if (lvl) return { slot: Number(lvl[1]), n: 1 }
  if (/spell slot/i.test(text)) return { slot: 1, n: 1 }
  for (const [re, resource] of RESTORE_RESOURCES)
    if (re.test(text)) return { resource, n: Number(/(\d+)/.exec(text)?.[1] ?? 1) }
  return null
}

/** The slot levels a restore can spend now (those left at or above its minimum). */
export function restoreSlots(s: Dnd5eSheet, c: Dnd5eRestoreCost): number[] {
  if (c.slot === 'pact') return pactLeft(s) > 0 ? [s.castingStats!.pact!.level] : []
  if (!c.slot) return []
  return slotsLeft(s).flatMap((n, i) => (n > 0 && i + 1 >= (c.slot as number) ? [i + 1] : []))
}

/**
 * Gives back a use of `name` by paying its restore cost: a spell slot (the level chosen), a
 * Pact Magic slot, or uses of another resource. With `perLevel` the slot's level in uses.
 */
export function restoreUse(
  s: Dnd5eSheet,
  name: string,
  c: Dnd5eRestoreCost,
  slotLevel?: number,
): string {
  if ((s.used?.[name] ?? 0) <= 0) return `${name} is full.`
  let paid = ''
  let n = 1
  if (c.slot === 'pact') {
    if (pactLeft(s) < 1) return 'No Pact Magic slot left.'
    s.pactUsed = (s.pactUsed ?? 0) + 1
    paid = 'a Pact Magic slot'
  } else if (c.slot) {
    const at = slotLevel ?? restoreSlots(s, c)[0]
    if (!at || (slotsLeft(s)[at - 1] ?? 0) < 1 || at < c.slot) return 'No spell slot to spend.'
    const used = [...(s.slotsUsed ?? [])]
    while (used.length < 9) used.push(0)
    used[at - 1] = (used[at - 1] ?? 0) + 1
    s.slotsUsed = used
    paid = `a ${ORD[at]}-level slot`
    if (c.perLevel) n = at
  } else if (c.resource) {
    if (!spendUses(s, c.resource, c.n)) return `Not enough ${c.resource}.`
    paid = `${c.n} ${c.resource}`
  } else return ''
  const back = Math.min(n, s.used?.[name] ?? 0)
  s.used = { ...s.used, [name]: (s.used?.[name] ?? 0) - back }
  if (!s.used[name]) delete s.used[name]
  return `${name}: ${back} back for ${paid}.`
}
