// Weapon and unarmed attacks of a 5e (2024) hero (SRD 5.2.1 pp. 10, 16, 89–91): the attack
// roll's ability (Finesse, ranged, Martial Arts), proficiency, fighting styles (Archery,
// Dueling, Great Weapon Fighting, Two-Weapon Fighting, Thrown Weapon Fighting, Unarmed
// Fighting), Versatile in two hands, the off-hand Light attack (a Bonus Action, or part of the
// Attack action with Nick), Heavy weapons below 13, Critical Hits (Improved and Superior
// Critical), Savage Attacker, Great Weapon Master, Rage Damage, Sneak Attack once a turn,
// Radiant Strikes, the dice effects add (Hunter's Mark, Hex, Divine Favor), the target's AC,
// resistances and Prone, and the eight weapon masteries on a hit or miss. Pure; the Attacks
// panel (components/dnd5e/SheetAttacks.vue) shows and rolls these; tests/dnd5eAttacks.test.ts.
import type { Dnd5eMastery, Dnd5eWeaponDef } from '~/data/dnd5e/types'
import type { Dnd5eAbility, Dnd5eSheet, Dnd5eWeapon } from '~/types/sheets'
import { proficientWith } from '~/utils/dnd5eBuild'
import { conditionRules } from '~/utils/dnd5eConditions'
import { activeEffectDefs, addEffect } from '~/utils/dnd5eEffects'
import {
  type D20Mode,
  type Dnd5eCost,
  type Dnd5eD20,
  d20Mode,
  d20Test,
  dnd5eHero,
  norm5e,
  rollTest,
  useOnce,
  usedOnce,
} from '~/utils/dnd5ePlay'
import { type Rng, parseDice, rollDice, sign } from '~/utils/dice'

/** The class table's columns at the hero's level ("Rage Damage", "Sneak Attack", "Martial Arts"). */
export type Dnd5eColumns = Record<string, string>

/** What the Target row knows about the creature attacked. */
export interface Dnd5eTarget {
  ac: number | null
  /** It resists, is vulnerable to or immune to the attack's damage. */
  resist?: boolean
  vulnerable?: boolean
  immune?: boolean
  /** Prone: Advantage from within 5 ft, Disadvantage from farther (SRD 5.2.1 p. 180). */
  prone?: boolean
  /** An ally of yours is within 5 ft of it (Sneak Attack without Advantage). */
  allyNear?: boolean
}

/** What a weapon card offers to change. */
export interface Dnd5eGrip {
  /** A Versatile weapon held in two hands. */
  twoHands?: boolean
  /** The extra attack with a Light weapon in the other hand. */
  offhand?: boolean
  /** A Thrown melee weapon thrown. */
  thrown?: boolean
  /** Attacking from beyond normal range (Disadvantage). */
  long?: boolean
}

export interface Dnd5eDamagePart {
  dice: string
  type: string
  label: string
  /** Only once a turn (Sneak Attack). */
  once?: string
}

export interface Dnd5eAttackPlan {
  key: string
  name: string
  ability: Dnd5eAbility
  melee: boolean
  test: Dnd5eD20
  /** The weapon's damage dice and modifier. */
  dice: string
  mod: number
  type: string
  /** Flat damage added (Rage, Dueling, Great Weapon Master). */
  flat: { label: string; value: number }[]
  /** Dice added on a hit (Sneak Attack, Hunter's Mark). */
  extras: Dnd5eDamagePart[]
  /** The lowest natural roll that's a Critical Hit. */
  critOn: number
  /** Great Weapon Fighting: 1s and 2s on the weapon's dice count as 3. */
  gwf: boolean
  /** Savage Attacker can roll the weapon's dice twice this turn. */
  savage: boolean
  /** The weapon's mastery, when the hero can use it. */
  mastery: Dnd5eMastery | null
  cost: Dnd5eCost
  /** The off-hand attack made through Nick, as part of the Attack action (once a turn). */
  nick: boolean
  /** What made the numbers, for the tooltip. */
  notes: string[]
  /** Topple's save DC: 8 + the attack's ability modifier + PB. */
  masteryDc: number
}

/** The weapon properties in a line each (SRD 5.2.1 pp. 89–90), for their tooltips. */
export const WEAPON_PROPERTY_TEXT: Record<string, string> = {
  Ammunition:
    'Needs ammunition to make a ranged attack; drawing it is part of the attack. You recover half the spent ammunition after the fight.',
  Finesse: 'Use your choice of Strength or Dexterity for the attack and damage rolls.',
  Heavy:
    'Disadvantage on attack rolls with it unless your Strength (melee) or Dexterity (ranged) is 13 or higher.',
  Light:
    'When you take the Attack action and attack with it, you can make one extra attack as a Bonus Action with a different Light weapon, without adding your ability modifier to its damage unless that modifier is negative.',
  Loading:
    'Only one piece of ammunition per action, Bonus Action or Reaction, whatever the number of attacks.',
  Range:
    'A normal and a long range in feet; beyond normal range the attack roll has Disadvantage, and you can’t attack beyond long range.',
  Reach: 'Adds 5 feet to your reach when you attack with it, and for Opportunity Attacks.',
  Thrown:
    'You can throw it to make a ranged attack, with the same ability as a melee attack with it.',
  'Two-Handed': 'Needs two hands when you attack with it.',
  Versatile: 'Can be used with one or two hands; the damage in parentheses is with two hands.',
}

/** The masteries in a line each (SRD 5.2.1 pp. 90–91). */
export const MASTERY_TEXT: Record<Dnd5eMastery, string> = {
  Cleave:
    'On a melee hit, one more attack against a second creature within 5 ft of the first, without your ability modifier to its damage; once a turn.',
  Graze: 'On a miss, the target still takes damage equal to your ability modifier.',
  Nick: 'The Light property’s extra attack is part of the Attack action instead of a Bonus Action; once a turn.',
  Push: 'On a hit, push a Large or smaller creature up to 10 ft straight away from you.',
  Sap: 'On a hit, the creature has Disadvantage on its next attack roll before your next turn.',
  Slow: 'On a hit that deals damage, the creature’s Speed drops by 10 ft until the start of your next turn.',
  Topple: 'On a hit, the creature makes a Constitution save or has the Prone condition.',
  Vex: 'On a hit that deals damage, Advantage on your next attack roll against it before the end of your next turn.',
}

const columnDice = (cols: Dnd5eColumns | undefined, name: string) =>
  (cols?.[name] ?? '').replace(/\s+/g, '').match(/\d*d\d+/)?.[0] ?? ''

const columnNumber = (cols: Dnd5eColumns | undefined, name: string) =>
  Number(/-?\d+/.exec((cols?.[name] ?? '').replace(/^\+/, ''))?.[0] ?? 0)

/** A die one step bigger ("1d6" → "1d8"), for Versatile in two hands when the data has none. */
const DIE_STEP: Record<string, string> = {
  '1d4': '1d6',
  '1d6': '1d8',
  '1d8': '1d10',
  '1d10': '1d12',
}

/** Weapons a Monk can use with Martial Arts: Simple melee, and Martial melee with Light (p. 50). */
const monkWeapon = (d: Dnd5eWeaponDef) =>
  d.type === 'Melee' && (d.category === 'Simple' || d.properties.includes('Light'))

function adjustTest(
  s: Dnd5eSheet,
  t: Dnd5eD20,
  o: { melee: boolean; strength: boolean; target?: Dnd5eTarget },
) {
  for (const r of conditionRules(s)) {
    if (r.attackAdv) t.adv.push(r.name)
    if (r.attackDis) t.dis.push(r.name)
  }
  for (const d of activeEffectDefs(s)) {
    const a = d.attack
    if (!a || (a.strength && !o.strength)) continue
    if (a.adv) t.adv.push(d.name)
    if (a.dis) t.dis.push(d.name)
    if (a.dice) t.dice.push({ dice: a.dice, label: d.name })
    if (a.bonus) {
      t.bonus += a.bonus
      t.lines.push(`${d.name} ${sign(a.bonus)}`)
    }
  }
  if (o.target?.prone) (o.melee ? t.adv : t.dis).push('target Prone')
}

/**
 * A weapon attack as it stands: `w` is the sheet's weapon and `def` its data (by slug or name;
 * a hand-made weapon has none, and keeps the attack and damage typed on it).
 */
export function weaponAttack(
  s: Dnd5eSheet,
  level: number,
  w: Dnd5eWeapon,
  def: Dnd5eWeaponDef | undefined,
  o: { key: string; grip?: Dnd5eGrip; target?: Dnd5eTarget; columns?: Dnd5eColumns },
): Dnd5eAttackPlan {
  const hero = dnd5eHero(s, level)
  const grip = o.grip ?? {}
  const notes: string[] = []
  const flat: { label: string; value: number }[] = []
  const extras: Dnd5eDamagePart[] = []
  const props = new Set(def?.properties ?? [])
  const ranged = def
    ? def.type === 'Ranged' || (!!grip.thrown && props.has('Thrown'))
    : /\d+\s*\/\s*\d+/.test(w.range)
  const melee = !ranged
  let ability: Dnd5eAbility = def?.type === 'Ranged' ? 'DEX' : 'STR'
  if (def && (props.has('Finesse') || (hero.has('Martial Arts') && monkWeapon(def))))
    ability = hero.mod('DEX') > hero.mod('STR') ? 'DEX' : 'STR'
  else if (!def) ability = ranged ? 'DEX' : 'STR'
  const mod = hero.mod(ability)
  let bonus: number
  const lines: string[] = []
  let dice: string
  let dmgMod: number
  if (def) {
    const prof = proficientWith(s.proficiencies?.weapons ?? [], def) || !s.proficiencies
    bonus = mod + (prof ? hero.pb : 0)
    lines.push(
      `${ability} ${sign(mod)}`,
      ...(prof ? [`Proficiency ${sign(hero.pb)}`] : ['Not proficient']),
    )
    dice =
      grip.twoHands && props.has('Versatile')
        ? (def.versatile ?? DIE_STEP[def.damage] ?? def.damage)
        : def.damage
    if (hero.has('Martial Arts') && monkWeapon(def)) {
      const ma = columnDice(o.columns, 'Martial Arts')
      if (ma && (parseDice(ma)?.sides ?? 0) > (parseDice(dice)?.sides ?? 0)) {
        dice = ma
        notes.push(`Martial Arts die ${ma}`)
      }
    }
    dmgMod = mod
  } else {
    bonus = w.atk
    lines.push(`Attack ${sign(w.atk)} on the sheet`)
    const m = /^\s*(\d*d\d+)\s*([+-]\s*\d+)?/i.exec(w.dmg)
    dice = m?.[1] ?? w.dmg
    dmgMod = m?.[2] ? Number(m[2].replace(/\s+/g, '')) : 0
  }
  if (grip.offhand) {
    if (dmgMod > 0 && !hero.feat('two-weapon-fighting')) {
      notes.push('Off-hand: no ability modifier to damage')
      dmgMod = 0
    } else if (dmgMod > 0) notes.push('Two-Weapon Fighting: modifier to off-hand damage')
  }
  if (ranged && def && hero.feat('archery')) {
    bonus += 2
    lines.push('Archery +2')
  }
  const strength = ability === 'STR'
  const t = d20Test(s, level, { label: w.name, kind: 'attack', ability, bonus, lines })
  adjustTest(s, t, { melee, strength, ...(o.target ? { target: o.target } : {}) })
  if (def && props.has('Heavy')) {
    if (melee && (s.abilities.STR ?? 10) < 13) t.dis.push('Heavy, Strength under 13')
    if (!melee && (s.abilities.DEX ?? 10) < 13) t.dis.push('Heavy, Dexterity under 13')
  }
  if (grip.long) t.dis.push('long range')
  const oneHanded = melee && def && !props.has('Two-Handed') && !grip.twoHands && !grip.offhand
  if (oneHanded && hero.feat('dueling')) flat.push({ label: 'Dueling', value: 2 })
  if (grip.thrown && props.has('Thrown') && hero.feat('thrown-weapon-fighting'))
    flat.push({ label: 'Thrown Weapon Fighting', value: 2 })
  const twoHanding =
    melee && def && (props.has('Two-Handed') || (grip.twoHands && props.has('Versatile')))
  const gwf = !!twoHanding && hero.feat('great-weapon-fighting')
  if (def && props.has('Heavy') && hero.feat('great-weapon-master'))
    flat.push({ label: 'Great Weapon Master', value: hero.pb })
  for (const d of activeEffectDefs(s)) {
    const dm = d.damage
    if (!dm) continue
    if (dm.rage && strength) {
      const v = columnNumber(o.columns, 'Rage Damage')
      if (v) flat.push({ label: 'Rage', value: v })
    }
    if (dm.bonus) flat.push({ label: d.name, value: dm.bonus })
    if (dm.dice)
      extras.push({ dice: dm.dice, type: dm.type ?? def?.damageType ?? w.type, label: d.name })
  }
  if (melee && hero.has('Radiant Strikes'))
    extras.push({ dice: '1d8', type: 'Radiant', label: 'Radiant Strikes' })
  const sneak = columnDice(o.columns, 'Sneak Attack')
  if (sneak && def && (props.has('Finesse') || def.type === 'Ranged') && !usedOnce(s, 'sneak'))
    extras.push({ dice: sneak, type: def.damageType, label: 'Sneak Attack', once: 'sneak' })
  const critOn = hero.has('Superior Critical') ? 18 : hero.has('Improved Critical') ? 19 : 20
  const mastery = def && (s.masteries ?? []).includes(def.slug) ? def.mastery : null
  const nick = mastery === 'Nick' && !usedOnce(s, 'nick')
  return {
    key: o.key,
    name: w.name,
    ability,
    melee,
    test: t,
    dice,
    mod: dmgMod,
    type: def?.damageType ?? w.type,
    flat,
    extras,
    critOn,
    gwf,
    savage: hero.feat('savage-attacker') && !usedOnce(s, 'savage'),
    mastery,
    cost: grip.offhand && !nick ? 'bonus' : 'attack',
    nick: !!grip.offhand && nick,
    notes,
    masteryDc: 8 + mod + hero.pb,
  }
}

/**
 * An Unarmed Strike (SRD 5.2.1 p. 11): Strength + PB, 1 + Strength Bludgeoning damage; the
 * Monk's Martial Arts die and Dexterity, Unarmed Fighting's d6 (d8 without weapons or a shield).
 */
export function unarmedAttack(
  s: Dnd5eSheet,
  level: number,
  o: { target?: Dnd5eTarget; columns?: Dnd5eColumns; bonusAction?: boolean } = {},
): Dnd5eAttackPlan {
  const hero = dnd5eHero(s, level)
  const ma = hero.has('Martial Arts') ? columnDice(o.columns, 'Martial Arts') : ''
  const ability: Dnd5eAbility = ma && hero.mod('DEX') > hero.mod('STR') ? 'DEX' : 'STR'
  const mod = hero.mod(ability)
  const lines = [`${ability} ${sign(mod)}`, `Proficiency ${sign(hero.pb)}`]
  const t = d20Test(s, level, {
    label: 'Unarmed Strike',
    kind: 'attack',
    ability,
    bonus: mod + hero.pb,
    lines,
  })
  adjustTest(s, t, {
    melee: true,
    strength: ability === 'STR',
    ...(o.target ? { target: o.target } : {}),
  })
  const armed = s.weapons.length > 0 || s.inventory.some((i) => i.worn && i.tag === 'Shield')
  const dice =
    ma ||
    (hero.feat('unarmed-fighting')
      ? armed
        ? '1d6'
        : '1d8'
      : hero.feat('tavern-brawler')
        ? '1d4'
        : '')
  const flat: { label: string; value: number }[] = []
  const extras: Dnd5eDamagePart[] = []
  for (const d of activeEffectDefs(s)) {
    const dm = d.damage
    if (!dm) continue
    if (dm.rage && ability === 'STR') {
      const v = columnNumber(o.columns, 'Rage Damage')
      if (v) flat.push({ label: 'Rage', value: v })
    }
    if (dm.dice && !dm.weapon)
      extras.push({ dice: dm.dice, type: dm.type ?? 'Bludgeoning', label: d.name })
  }
  if (hero.has('Radiant Strikes'))
    extras.push({ dice: '1d8', type: 'Radiant', label: 'Radiant Strikes' })
  return {
    key: o.bonusAction ? 'unarmed:bonus' : 'unarmed',
    name: o.bonusAction ? 'Martial Arts strike' : 'Unarmed Strike',
    ability,
    melee: true,
    test: t,
    dice: dice || '',
    mod: dice ? mod : 1 + mod,
    type: 'Bludgeoning',
    flat,
    extras,
    critOn: hero.has('Superior Critical') ? 18 : hero.has('Improved Critical') ? 19 : 20,
    gwf: false,
    savage: false,
    mastery: null,
    cost: o.bonusAction ? 'bonus' : 'attack',
    nick: false,
    notes: ma ? [`Martial Arts die ${ma}`] : [],
    masteryDc: 8 + mod + hero.pb,
  }
}

/** "1d8+3 Slashing + 1d6 Force (Hunter’s Mark)", the damage the card shows. */
export function damageText(p: Dnd5eAttackPlan, o: { sneak?: boolean } = {}): string {
  const flat = p.mod + p.flat.reduce((n, f) => n + f.value, 0)
  const main = p.dice ? `${p.dice}${flat ? sign(flat) : ''}` : String(Math.max(0, flat))
  const extras = p.extras
    .filter((e) => e.once !== 'sneak' || o.sneak)
    .map((e) => `${e.dice} ${e.type} (${e.label})`)
  return [`${main} ${p.type}`.trim(), ...extras].join(' + ')
}

/** The lines behind a card's damage, for its tooltip. */
export function damageWhy(p: Dnd5eAttackPlan): string[] {
  return [
    `${p.dice || '1'} ${p.type}${p.mod ? ` ${sign(p.mod)} (${p.ability})` : ''}`,
    ...p.flat.map((f) => `${f.label} ${sign(f.value)}`),
    ...p.extras.map((e) => `${e.label}: ${e.dice} ${e.type}${e.once ? ', once a turn' : ''}`),
    ...(p.gwf ? ['Great Weapon Fighting: 1s and 2s count as 3'] : []),
    ...(p.savage ? ['Savage Attacker: roll the weapon dice twice, once a turn'] : []),
    ...(p.critOn < 20 ? [`Critical Hit on ${p.critOn}–20`] : []),
    ...p.notes,
  ]
}

/** The chance to hit and to crit against an AC, in whole percent, with the roll's odds. */
export function hitChance(
  bonus: number,
  ac: number,
  mode: D20Mode,
  critOn = 20,
): { hit: number; crit: number } {
  const need = Math.max(2, Math.min(critOn, ac - bonus))
  const one = Math.max(0, Math.min(1, (21 - need) / 20))
  const crit1 = (21 - critOn) / 20
  const twice = (p: number) => (mode === 'adv' ? 1 - (1 - p) ** 2 : mode === 'dis' ? p * p : p)
  return { hit: Math.round(twice(one) * 100), crit: Math.round(twice(crit1) * 100) }
}

function rollPart(
  dice: string,
  o: { crit: boolean; gwf?: boolean; savage?: boolean; rng?: Rng },
): { total: number; text: string } {
  const expr = parseDice(dice)
  if (!expr) return { total: 0, text: '' }
  const count = expr.count * (o.crit ? 2 : 1)
  const once = () => {
    const r = rollDice({ count, sides: expr.sides, mod: 0 }, o.rng)
    const rolls = o.gwf ? r.rolls.map((v) => (v < 3 ? 3 : v)) : r.rolls
    return { total: rolls.reduce((n, v) => n + v, 0), rolls }
  }
  let r = once()
  let note = ''
  if (o.savage) {
    const again = once()
    note = ` / ${again.rolls.join('+')}, Savage Attacker keeps ${Math.max(r.total, again.total)}`
    if (again.total > r.total) r = again
  }
  return { total: r.total, text: `${count}d${expr.sides}: ${r.rolls.join('+')}${note}` }
}

export interface Dnd5eAttackResult {
  line: string
  total: number
  natural: 20 | 1 | null
  hit: boolean | null
  crit: boolean
  damage: number
  /** What the hit's mastery does, said to the player. */
  masteryNote: string
}

/** Applies the target's resistance, vulnerability or immunity to one damage amount. */
function againstTarget(n: number, t: Dnd5eTarget | undefined): number {
  if (!t) return n
  if (t.immune) return 0
  let v = t.resist ? Math.floor(n / 2) : n
  if (t.vulnerable) v *= 2
  return v
}

/**
 * Rolls an attack and its damage at once. Against a known AC a miss deals nothing (Graze still
 * deals its modifier); a natural 20, or the Champion's lower crit range, doubles every damage
 * die. Sneak Attack (when `sneak`), Savage Attacker and Nick are used up for the turn; Vex
 * gives the next attack Advantage.
 */
export function rollAttack5e(
  s: Dnd5eSheet,
  p: Dnd5eAttackPlan,
  o: { mode?: D20Mode; target?: Dnd5eTarget; sneak?: boolean; rng?: Rng; d20?: number[] } = {},
): Dnd5eAttackResult {
  const mode = d20Mode(p.test, o.mode)
  const r = rollTest(s, p.test, {
    mode: o.mode ?? 'normal',
    ...(o.d20 ? { d20: o.d20 } : {}),
    ...(o.rng ? { rng: o.rng } : {}),
  })
  const crit = r.d20 >= p.critOn
  const ac = o.target?.ac ?? null
  const hit = r.natural === 1 ? false : crit ? true : ac === null ? null : r.total >= ac
  const vs = ac === null ? '' : ` vs AC ${ac}`
  const head = `${p.name}: ${r.total} to hit${vs} (${r.rolls.length > 1 ? `${r.rolls.join(' / ')} → ` : ''}${r.d20} ${sign(p.test.bonus)}${r.extra ? ` ${sign(r.extra)}` : ''})${mode !== 'normal' ? ` · ${mode === 'adv' ? 'advantage' : 'disadvantage'}` : ''}`
  if (p.nick) useOnce(s, 'nick')
  if (hit === false) {
    if (p.mastery === 'Graze') {
      const g = againstTarget(Math.max(0, p.mod), o.target)
      return {
        line: `${head} · miss. Graze: ${g} ${p.type.toLowerCase()} damage anyway.`,
        total: r.total,
        natural: r.natural,
        hit,
        crit: false,
        damage: g,
        masteryNote: 'Graze',
      }
    }
    return {
      line: `${head} · ${r.natural === 1 ? 'natural 1, a miss' : 'miss'}.`,
      total: r.total,
      natural: r.natural,
      hit,
      crit: false,
      damage: 0,
      masteryNote: '',
    }
  }
  const savage = p.savage && useOnce(s, 'savage')
  const main = p.dice
    ? rollPart(p.dice, { crit, gwf: p.gwf, savage, ...(o.rng ? { rng: o.rng } : {}) })
    : { total: 0, text: '' }
  const flat = p.mod + p.flat.reduce((n, f) => n + f.value, 0)
  let total = againstTarget(Math.max(0, main.total + flat), o.target)
  const parts = [main.text ? `${main.text}${flat ? ` ${sign(flat)}` : ''}` : `${Math.max(0, flat)}`]
  for (const e of p.extras) {
    if (e.once === 'sneak' && (!o.sneak || !useOnce(s, 'sneak'))) continue
    const x = rollPart(e.dice, { crit, ...(o.rng ? { rng: o.rng } : {}) })
    total += againstTarget(x.total, o.target)
    parts.push(`${e.label} ${x.text} ${e.type.toLowerCase()}`)
  }
  const mastery = masteryOnHit(s, p, total > 0)
  const outcome = crit ? 'Critical Hit!' : hit ? 'hit' : 'if it hits'
  const line = `${head} · ${outcome} ${total} ${p.type.toLowerCase()} damage (${parts.join('; ')}).${mastery ? ` ${mastery}` : ''}`
  return {
    line,
    total: r.total,
    natural: r.natural,
    hit,
    crit,
    damage: total,
    masteryNote: mastery,
  }
}

/** What the weapon's mastery does on a hit, said as a reminder (Vex sets its Advantage). */
export function masteryOnHit(s: Dnd5eSheet, p: Dnd5eAttackPlan, damaged: boolean): string {
  switch (p.mastery) {
    case 'Vex':
      if (!damaged) return ''
      addEffect(s, 'vex', { held: !!s.turn?.active })
      return 'Vex: Advantage on your next attack against it.'
    case 'Sap':
      return 'Sap: it has Disadvantage on its next attack roll before your next turn.'
    case 'Slow':
      return damaged ? 'Slow: its Speed drops by 10 ft until your next turn.' : ''
    case 'Push':
      return 'Push: you can push it up to 10 ft away (Large or smaller).'
    case 'Topple':
      return `Topple: it makes a DC ${p.masteryDc} Constitution save or falls Prone.`
    case 'Cleave':
      return p.melee && !usedOnce(s, 'cleave')
        ? 'Cleave: you can attack a second creature within 5 ft of it (no ability modifier to damage).'
        : ''
    default:
      return ''
  }
}

/** A weapon's data record, by the sheet weapon's slug or its name. */
export function weaponDef(
  w: Pick<Dnd5eWeapon, 'name' | 'slug'>,
  weapons: Dnd5eWeaponDef[],
): Dnd5eWeaponDef | undefined {
  if (w.slug) {
    const bySlug = weapons.find((d) => d.slug === w.slug)
    if (bySlug) return bySlug
  }
  const n = norm5e(w.name)
  return weapons.find((d) => norm5e(d.name) === n)
}
