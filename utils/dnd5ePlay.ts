// The table-side rules of a 5e (2024) hero, as Nimble's utils/nimblePlay.ts and PF2e's
// utils/pf2ePlay.ts are for theirs: what the hero has (`dnd5eHero`, read from the sheet's
// features, feats and options), Speed and AC as they are now, D20 Tests (checks, skills, saves,
// Initiative) with Advantage and Disadvantage cancelling, damage and healing, dying and death
// saves, Concentration, rests and Hit Point Dice, limited uses, and the turn tracker with its
// action economy. Rules cite the SRD 5.2.1; pure, so tests/dnd5ePlay.test.ts covers it.
import type { Dnd5eAbility, Dnd5eSheet, Dnd5eTurn } from '~/types/sheets'
import { DND5E_ABILITIES, DND5E_SKILLS, proficiencyBonus } from '~/utils/dnd5eBuild'
import {
  activeConditions,
  conditionRules,
  endConditions,
  exhaustionOf,
  setExhaustion,
} from '~/utils/dnd5eConditions'
import {
  DND5E_EFFECTS,
  activeEffectDefs,
  effectValues,
  effectsOn,
  endEffects,
  hasEffect,
  removeEffect,
  spendEffects,
} from '~/utils/dnd5eEffects'
import { gearAc, gearAdvantage, gearSaves } from '~/utils/dnd5eMagicItems'
import { activeModifiers, allAbilities, amountOf } from '~/utils/dnd5eModifiers'
import {
  type Rng,
  abilityMod,
  parseDice,
  rollCheck,
  rollCheckTwice,
  rollDice,
  rollDie,
  sign,
  typedCheck,
} from '~/utils/dice'

// --- The hero ------------------------------------------------------------------------

export const norm5e = (s: string) =>
  s.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim()

/** What the hero has, read from the sheet alone (built heroes and hand-made ones alike). */
export interface Dnd5eHero {
  level: number
  pb: number
  /** A feature or trait by name ("Jack of All Trades"), case and apostrophes aside. */
  has: (name: string) => boolean
  /** A feat by slug (`alert`), or by name on a hand-made sheet. */
  feat: (slug: string) => boolean
  /** An option-group pick by slug (`agonizing-blast`). */
  option: (slug: string) => boolean
  mod: (a: Dnd5eAbility) => number
  classSlug: string
  subclassSlug: string
}

export function dnd5eHero(s: Dnd5eSheet, level: number): Dnd5eHero {
  const names = new Set((s.features ?? []).map((f) => norm5e(f.name)))
  const feats = new Set((s.featsTaken ?? []).map((f) => f.slug))
  const options = new Set((s.options ?? []).map((o) => o.slug))
  const slugName = (slug: string) => slug.replace(/-/g, ' ')
  return {
    level,
    pb: s.profBonus || proficiencyBonus(level),
    has: (name) => names.has(norm5e(name)),
    feat: (slug) => feats.has(slug) || names.has(slugName(slug)),
    option: (slug) => options.has(slug) || names.has(slugName(slug)),
    mod: (a) => abilityMod(s.abilities?.[a] ?? 10),
    classSlug: s.classSlug ?? '',
    subclassSlug: s.subclassSlug ?? '',
  }
}

// --- Limited uses ----------------------------------------------------------------------

/** A resource's uses left (`sheet.resources` holds the maxima, `sheet.used` what's spent). */
export function usesLeft(s: Dnd5eSheet, name: string): number {
  const r = s.resources?.find((x) => x.name === name)
  if (!r) return 0
  return Math.max(0, r.max - (s.used?.[name] ?? 0))
}

/** Spends `n` uses; false (and nothing spent) when there aren't that many. */
export function spendUses(s: Dnd5eSheet, name: string, n = 1): boolean {
  if (usesLeft(s, name) < n) return false
  s.used = { ...s.used, [name]: (s.used?.[name] ?? 0) + n }
  return true
}

/** Gives back `n` uses (or all). */
export function restoreUses(s: Dnd5eSheet, name: string, n: number | 'all' = 'all') {
  const used = s.used?.[name] ?? 0
  const left = n === 'all' ? 0 : Math.max(0, used - n)
  const next = { ...s.used }
  if (left) next[name] = left
  else delete next[name]
  s.used = next
}

// --- Speed and AC ----------------------------------------------------------------------

/** The Beast form the hero is in while Wild Shape lasts (utils/dnd5eWildShape.ts). */
const formNow = (s: Dnd5eSheet) =>
  hasEffect(s, 'wild-shape') && s.beastForm
    ? (s.beastForms?.find((f) => f.name === s.beastForm) ?? null)
    : null

/** The walking Speed in feet: the first number of the sheet's Speed ("30 ft, climb 30 ft"). */
export function walkSpeed(s: Pick<Dnd5eSheet, 'speed'>): number {
  const n = /\d+/.exec(s.speed ?? '')
  return n ? Number(n[0]) : 30
}

export interface Dnd5eNumber {
  value: number
  /** What makes it up, a line each (the tooltip). */
  lines: string[]
  /** Something on the hero changes it from the sheet's number. */
  changed: boolean
}

/**
 * Speed now: Haste and Longstrider, Speed 0 from Grappled, Restrained and the like (and Steady
 * Aim), −5 ft per Exhaustion level (SRD 5.2.1 p. 181).
 */
export function speedNow(s: Dnd5eSheet, level = 0): Dnd5eNumber & { others: string } {
  const form = formNow(s)
  const base = walkSpeed(form ?? s)
  const lines = [form ? `${base} ft: the ${form.name}’s` : `${base} ft on the sheet`]
  const moves = [
    ...activeEffectDefs(s).flatMap((d) => (d.moves ? [`${d.moves} (${d.name})`] : [])),
    ...(level ? modifiersNow(s, level) : []).flatMap((m) =>
      m.moves ? [`${m.moves} (${m.feature})`] : [],
    ),
  ]
  const others = [((form ?? s).speed ?? '').split(',').slice(1).join(',').trim(), ...moves]
    .filter(Boolean)
    .join(', ')
  const zero = conditionRules(s).filter((r) => r.speedZero)
  const fx = activeEffectDefs(s).filter(
    (d) => !(d.key === 'steady-aim' && level && dnd5eHero(s, level).has('Infiltration Expertise')),
  )
  if (zero.length || fx.some((d) => d.speed?.zero)) {
    const why = [...zero.map((r) => r.name), ...fx.filter((d) => d.speed?.zero).map((d) => d.name)]
    return { value: 0, lines: [...lines, `Speed 0: ${why.join(', ')}`], changed: true, others }
  }
  let v = base
  const hero = dnd5eHero(s, level)
  if (hero.has('Fast Movement') && wearsHeavy(s)) {
    v -= 10
    lines.push('Fast Movement: not in Heavy armor −10 ft')
  }
  if (hero.has('Unarmored Movement') && (wearsArmor(s) || wearsShield(s)) && level) {
    v -= unarmoredMovement(level)
    lines.push(`Unarmored Movement: not with armor or a Shield −${unarmoredMovement(level)} ft`)
  }
  for (const m of level ? modifiersNow(s, level) : []) {
    if (m.speed) {
      v += m.speed
      lines.push(`${m.feature} ${sign(m.speed)} ft`)
    }
  }
  for (const d of fx) {
    if (d.speed?.bonus) {
      v += d.speed.bonus
      lines.push(`${d.name} ${sign(d.speed.bonus)} ft`)
    }
  }
  for (const d of fx) {
    if (d.speed?.times) {
      v *= d.speed.times
      lines.push(`${d.name} ×${d.speed.times}`)
    }
  }
  const ex = exhaustionOf(s)
  if (ex) {
    v -= 5 * ex
    lines.push(`Exhaustion ${ex}: −${5 * ex} ft`)
  }
  if (activeConditions(s).has('Prone')) lines.push('Prone: crawl, or stand up for half your Speed')
  v = Math.max(0, v)
  return { value: v, lines, changed: v !== base, others }
}

const wearsArmor = (s: Dnd5eSheet) => s.inventory.some((i) => i.worn && i.tag === 'Armor')
const wearsShield = (s: Dnd5eSheet) => s.inventory.some((i) => i.worn && i.tag === 'Shield')

/** Heavy armor by its SRD names (SRD 5.2.1 p. 92): Ring Mail, Chain Mail, Splint, Plate. */
const HEAVY_ARMOR = /^(ring mail|chain mail|splint|plate)/i

export const wearsHeavy = (s: Dnd5eSheet) =>
  s.inventory.some((i) => i.worn && i.tag === 'Armor' && HEAVY_ARMOR.test(i.name.trim()))

/** The Monk's Unarmored Movement bonus by Monk level (SRD 5.2.1 p. 49). */
const unarmoredMovement = (level: number) =>
  level >= 18 ? 30 : level >= 14 ? 25 : level >= 10 ? 20 : level >= 6 ? 15 : level >= 2 ? 10 : 0

/** The modifiers (utils/dnd5eModifiers.ts) that hold for the hero now. */
export const modifiersNow = (s: Dnd5eSheet, level: number) =>
  activeModifiers(s, dnd5eHero(s, level), wearsHeavy(s))

/**
 * AC now: the sheet's AC (armor, shield and unarmored formulas, from Equip), then Mage Armor's
 * 13 + DEX while unarmored, the Defense fighting style's +1 in armor, Shield, Shield of Faith,
 * Haste, and Barkskin's floor of 17.
 */
export function acNow(s: Dnd5eSheet, level: number): Dnd5eNumber {
  const hero = dnd5eHero(s, level)
  const form = formNow(s)
  const lines = form ? [`AC ${form.ac}: the ${form.name}’s`] : [`AC ${s.ac} on the sheet`]
  let v = form ? form.ac : s.ac
  const fx = activeEffectDefs(s)
  const shield = wearsShield(s) ? 2 : 0
  for (const d of fx) {
    if (d.acBase && !wearsArmor(s)) {
      const base = d.acBase + hero.mod('DEX') + shield
      if (base > v) {
        lines.push(`${d.name}: ${d.acBase} + DEX${shield ? ' + shield' : ''} = ${base}`)
        v = base
      }
    }
  }
  if (hero.feat('defense') && wearsArmor(s)) {
    v += 1
    lines.push('Defense fighting style +1 (in armor)')
  }
  for (const d of fx) {
    if (d.ac) {
      v += d.ac
      lines.push(`${d.name} ${sign(d.ac)}`)
    }
  }
  for (const e of [...effectValues(s, 'ac'), ...(form ? [] : gearAc(s))]) {
    v += e.value
    lines.push(`${e.label} ${sign(e.value)}`)
  }
  const mods = modifiersNow(s, level)
  for (const m of mods) {
    if (m.ac) {
      const n = amountOf(hero, m.ac)
      v += n
      lines.push(`${m.feature} ${sign(n)}`)
    }
  }
  for (const m of mods) {
    if (m.acFloor) {
      const floor = m.acFloor.base + hero.mod(m.acFloor.plus)
      if (v < floor) {
        v = floor
        lines.push(`${m.feature}: at least ${m.acFloor.base} + ${m.acFloor.plus} = ${floor}`)
      }
    }
  }
  for (const d of fx) {
    if (d.acMin && v < d.acMin) {
      v = d.acMin
      lines.push(`${d.name}: at least ${d.acMin}`)
    }
  }
  return { value: v, lines, changed: v !== s.ac }
}

// --- D20 Tests -------------------------------------------------------------------------

export type D20Mode = 'normal' | 'adv' | 'dis'
export type D20Kind = 'check' | 'save' | 'attack' | 'initiative' | 'death'

/** A D20 Test before it's rolled: the modifier and what makes it up, the reasons for Advantage or Disadvantage, dice added. */
export interface Dnd5eD20 {
  label: string
  kind: D20Kind
  bonus: number
  lines: string[]
  adv: string[]
  dis: string[]
  /** Dice added to the roll (Bless +1d4, Bane −1d4, Guidance). */
  dice: { dice: string; label: string }[]
  /** It fails without a roll (Paralyzed on a Strength save). */
  fail?: string
  /** Reliable Talent: a 9 or lower on the d20 counts as a 10 (SRD 5.2.1 p. 63). */
  reliable?: boolean
  /** Halfling Luck: a 1 on the d20 is rerolled once (SRD 5.2.1 p. 85). */
  lucky?: boolean
  /** A total below this counts as this (Indomitable Might: your Strength score). */
  floor?: { value: number; label: string }
  /** A death save this high counts as a 20 (Survivor). */
  twentyOn?: number
}

/**
 * The parts of a D20 Test that come from the hero's state, added to `base`: Exhaustion's −2 per
 * level, conditions, effects (Rage, Bless, Help), and class features and traits (Danger Sense,
 * Feral Instinct, Remarkable Athlete, Aura of Protection, Halfling Luck).
 */
export function d20Test(
  s: Dnd5eSheet,
  level: number,
  t: {
    label: string
    kind: D20Kind
    ability?: Dnd5eAbility
    bonus: number
    lines: string[]
    skill?: string
  },
): Dnd5eD20 {
  const hero = dnd5eHero(s, level)
  const out: Dnd5eD20 = {
    label: t.label,
    kind: t.kind,
    bonus: t.bonus,
    lines: [...t.lines],
    adv: [],
    dis: [],
    dice: [],
  }
  const ex = exhaustionOf(s)
  if (ex) {
    out.bonus -= 2 * ex
    out.lines.push(`Exhaustion ${ex} −${2 * ex}`)
  }
  const rules = conditionRules(s)
  const a = t.ability
  if (t.kind === 'check') {
    for (const r of rules) if (r.checkDis) out.dis.push(r.name)
  }
  if (t.kind === 'save' && a) {
    for (const r of rules) {
      if (r.failSaves?.includes(a)) out.fail = `${r.name}: Strength and Dexterity saves fail`
      if (r.saveDis?.includes(a)) out.dis.push(r.name)
    }
  }
  if (t.kind === 'initiative') {
    for (const r of rules) {
      if (r.initiative === 'adv') out.adv.push(r.name)
      if (r.initiative === 'dis') out.dis.push(r.name)
    }
    if (hero.has('Feral Instinct')) out.adv.push('Feral Instinct')
    if (hero.has('Remarkable Athlete')) out.adv.push('Remarkable Athlete')
  }
  for (const d of activeEffectDefs(s)) {
    const part =
      t.kind === 'save' || t.kind === 'death' ? d.save : t.kind === 'check' ? d.check : null
    if (!part) continue
    if (a && part.adv?.includes(a)) out.adv.push(d.name)
    if (a && part.dis?.includes(a)) out.dis.push(d.name)
    if (part.dice) out.dice.push({ dice: part.dice, label: d.name })
  }
  if (t.kind === 'save' && a === 'DEX' && hero.has('Danger Sense')) {
    const blind = ['Blinded', 'Deafened', 'Incapacitated'].some((c) => activeConditions(s).has(c))
    if (!blind) out.adv.push('Danger Sense')
  }
  if (t.kind === 'save' && a && ['INT', 'WIS', 'CHA'].includes(a) && hero.has('Gnomish Cunning'))
    out.adv.push('Gnomish Cunning')
  if (t.kind === 'death' && hero.feat('durable')) out.adv.push('Durable: Defy Death')
  if ((t.kind === 'save' || t.kind === 'death') && hero.has('Aura of Protection')) {
    if (!activeConditions(s).has('Incapacitated')) {
      const cha = Math.max(1, hero.mod('CHA'))
      out.bonus += cha
      out.lines.push(`Aura of Protection ${sign(cha)}`)
    }
  }
  if (t.kind === 'check' && t.skill === 'Athletics' && hero.has('Remarkable Athlete'))
    out.adv.push('Remarkable Athlete')
  if (t.kind === 'check' && t.skill)
    for (const d of activeEffectDefs(s))
      if (d.skillAdv?.includes(t.skill) && !out.adv.includes(d.name)) out.adv.push(d.name)
  const gear = gearAdvantage(s)
  if (t.kind === 'initiative') out.adv.push(...gear.initiative)
  if (t.kind === 'check' && t.skill) out.adv.push(...(gear.skills[t.skill] ?? []))
  if (t.kind === 'save' || t.kind === 'death')
    for (const g of gearSaves(s)) {
      out.bonus += g.value
      out.lines.push(`${g.label} ${sign(g.value)}`)
    }
  const rely = t.kind === 'initiative' || t.kind === 'death' ? null : t.kind
  if (rely && activeEffectDefs(s).some((d) => d.reliable?.includes(rely))) out.reliable = true
  for (const m of modifiersNow(s, level)) {
    const add = (n: number) => {
      out.bonus += n
      out.lines.push(`${m.feature} ${sign(n)}`)
    }
    if (t.kind === 'save' && m.save && a && allAbilities(m.save.abilities).includes(a)) {
      if (m.save.plus !== undefined) add(amountOf(hero, m.save.plus))
      if (m.save.adv) out.adv.push(m.feature)
    }
    if (t.kind === 'check' && m.check) {
      const hit =
        (!!t.skill && !!m.check.skills?.includes(t.skill)) ||
        (!!a && !!m.check.abilities?.includes(a))
      if (hit && m.check.plus !== undefined) add(amountOf(hero, m.check.plus))
      if (hit && m.check.adv) out.adv.push(m.feature)
    }
    if (t.kind === 'initiative' && m.initiative) {
      if (m.initiative.plus !== undefined) add(amountOf(hero, m.initiative.plus))
      if (m.initiative.dice) out.dice.push({ dice: m.initiative.dice, label: m.feature })
      if (m.initiative.adv) out.adv.push(m.feature)
    }
    if (t.kind === 'death' && m.death) {
      if (m.death.adv) out.adv.push(m.feature)
      if (m.death.twentyOn) out.twentyOn = m.death.twentyOn
    }
  }
  if (a === 'STR' && (t.kind === 'check' || t.kind === 'save') && hero.has('Indomitable Might'))
    out.floor = { value: s.abilities.STR ?? 10, label: 'Indomitable Might' }
  if (hero.has('Luck') && s.speciesSlug === 'halfling') out.lucky = true
  return out
}

/** Advantage and Disadvantage cancel: any of both is a single d20 (SRD 5.2.1 p. 6). */
export function d20Mode(t: Pick<Dnd5eD20, 'adv' | 'dis'>, chosen: D20Mode = 'normal'): D20Mode {
  const adv = t.adv.length > 0 || chosen === 'adv'
  const dis = t.dis.length > 0 || chosen === 'dis'
  return adv && !dis ? 'adv' : dis && !adv ? 'dis' : 'normal'
}

/** "advantage (Rage)", "disadvantage (Poisoned)", "advantage and disadvantage cancel". */
export function modeNote(t: Pick<Dnd5eD20, 'adv' | 'dis'>, chosen: D20Mode = 'normal'): string {
  const adv = [...t.adv, ...(chosen === 'adv' ? ['your call'] : [])]
  const dis = [...t.dis, ...(chosen === 'dis' ? ['your call'] : [])]
  if (adv.length && dis.length) return 'advantage and disadvantage cancel'
  if (adv.length) return `advantage (${adv.join(', ')})`
  if (dis.length) return `disadvantage (${dis.join(', ')})`
  return ''
}

export interface D20Result {
  /** The d20 kept. */
  d20: number
  /** Every d20 rolled. */
  rolls: number[]
  total: number
  natural: 20 | 1 | null
  mode: D20Mode
  /** What the added dice came to. */
  extra: number
  failed?: boolean
  line: string
}

/**
 * Rolls a D20 Test: one d20, or two keeping the higher (Advantage) or lower (Disadvantage),
 * Halfling Luck's reroll of a 1, Reliable Talent's 10, added dice. With Manual dice `d20`
 * holds what the player rolled (one die, or both for Advantage or Disadvantage).
 */
export function rollD20(
  t: Dnd5eD20,
  o: { mode?: D20Mode; d20?: number[]; rng?: Rng } = {},
): D20Result {
  const mode = d20Mode(t, o.mode)
  if (t.fail)
    return {
      d20: 0,
      rolls: [],
      total: 0,
      natural: null,
      mode,
      extra: 0,
      failed: true,
      line: `${t.label}: fails (${t.fail}).`,
    }
  const rng = o.rng ?? Math.random
  let rolls: number[]
  let d20: number
  const typed = o.d20?.filter((v) => Number.isFinite(v))
  if (typed?.length) {
    rolls = typed.slice(0, mode === 'normal' ? 1 : 2).map((v) => typedCheck(v, 0).d20)
    d20 = mode === 'dis' ? Math.min(...rolls) : Math.max(...rolls)
  } else if (mode === 'normal') {
    d20 = rollCheck(t.bonus, rng).d20
    rolls = [d20]
  } else {
    const r = rollCheckTwice(t.bonus, mode === 'adv' ? 'higher' : 'lower', rng)
    rolls = [...r.rolls]
    d20 = r.d20
  }
  const notes: string[] = []
  if (t.lucky && d20 === 1) {
    d20 = typed?.length ? d20 : rollCheck(t.bonus, rng).d20
    if (!typed?.length) {
      rolls.push(d20)
      notes.push(`Luck rerolled the 1: ${d20}`)
    }
  }
  const natural = d20 === 20 ? 20 : d20 === 1 ? 1 : null
  let counted = d20
  if (t.reliable && counted < 10) {
    counted = 10
    notes.push(`Reliable Talent: ${d20} counts as 10`)
  }
  let extra = 0
  for (const d of t.dice) {
    const neg = d.dice.trim().startsWith('-')
    const expr = parseDice(d.dice.replace(/^\s*-/, ''))
    if (!expr) continue
    const r = rollDice(expr, rng).total
    extra += neg ? -r : r
    notes.push(`${d.label} ${neg ? '−' : '+'}${r}`)
  }
  let total = counted + t.bonus + extra
  if (t.floor && total < t.floor.value) {
    notes.push(`${t.floor.label}: ${total} counts as ${t.floor.value}`)
    total = t.floor.value
  }
  const dice = rolls.length > 1 ? `${rolls.join(' / ')} → ${d20}` : `${d20}`
  const how = modeNote(t, o.mode)
  const nat = natural ? `, natural ${natural}` : ''
  const line = `${t.label}: ${total} (${dice} ${sign(t.bonus)}${nat})${how ? ` · ${how}` : ''}${notes.length ? ` · ${notes.join(', ')}` : ''}.`
  return { d20, rolls, total, natural, mode, extra, line }
}

/** A roll and the effects it spends (Help, Guidance), as the panels make it. */
export function rollTest(
  s: Dnd5eSheet,
  t: Dnd5eD20,
  o: { mode?: D20Mode; d20?: number[]; rng?: Rng } = {},
): D20Result {
  const r = rollD20(t, o)
  const kind = t.kind === 'attack' ? 'attack' : t.kind === 'check' ? 'check' : 'save'
  const spent = t.kind === 'initiative' || t.kind === 'death' ? [] : spendEffects(s, kind)
  if (spent.length) r.line = `${r.line.replace(/\.$/, '')} · ${spent.join(', ')} spent.`
  return r
}

export type Dnd5eProf = 0 | 0.5 | 1 | 2

export interface Dnd5eSkillRow {
  name: string
  ability: Dnd5eAbility
  /** 0 none, 0.5 Jack of All Trades, 1 proficient, 2 Expertise. */
  prof: Dnd5eProf
  test: Dnd5eD20
}

const PROF_LABEL: Record<Dnd5eProf, string> = {
  0: '',
  0.5: 'Jack of All Trades (half PB)',
  1: 'Proficiency',
  2: 'Expertise (twice PB)',
}

/**
 * A skill check (SRD 5.2.1 p. 8): the ability modifier, the Proficiency Bonus if proficient,
 * twice it with Expertise, half of it (rounded down) from Jack of All Trades when not
 * proficient; Reliable Talent with proficiency.
 */
export function skillRow(s: Dnd5eSheet, level: number, skill: string): Dnd5eSkillRow {
  const hero = dnd5eHero(s, level)
  const ability = DND5E_SKILLS.find((k) => k.name === skill)?.ability ?? 'STR'
  const p = s.proficiencies
  const prof: Dnd5eProf = p?.expertise.includes(skill)
    ? 2
    : p?.skills.includes(skill)
      ? 1
      : hero.has('Jack of All Trades')
        ? 0.5
        : 0
  const mod = hero.mod(ability)
  const add = Math.floor(hero.pb * prof)
  const lines = [`${ability} ${sign(mod)}`, ...(add ? [`${PROF_LABEL[prof]} ${sign(add)}`] : [])]
  const test = d20Test(s, level, {
    label: skill,
    kind: 'check',
    ability,
    skill,
    bonus: mod + add,
    lines,
  })
  if (prof >= 1 && hero.has('Reliable Talent')) test.reliable = true
  return { name: skill, ability, prof, test }
}

/** What each skill is for, in a line (SRD 5.2.1 p. 14). */
export const DND5E_SKILL_USES: Record<string, string> = {
  Acrobatics: 'Stay on your feet in a tricky situation, or perform an acrobatic stunt.',
  'Animal Handling': 'Calm or train an animal, or get an animal to behave in a certain way.',
  Arcana: 'Recall lore about spells, magic items and the planes of existence.',
  Athletics: 'Jump farther than normal, stay afloat in rough water, or break something.',
  Deception: 'Tell a convincing lie, or wear a disguise convincingly.',
  History: 'Recall lore about historical events, people, nations and cultures.',
  Insight: 'Discern a person’s mood and intentions.',
  Intimidation: 'Awe or threaten someone into doing what you want.',
  Investigation: 'Find obscure information in books, or deduce how something works.',
  Medicine: 'Diagnose an illness, or determine what killed the recently slain.',
  Nature: 'Recall lore about terrain, plants, animals and weather.',
  Perception: 'Using a combination of senses, notice something that’s easy to miss.',
  Performance: 'Act, tell a story, perform music or dance.',
  Persuasion: 'Honestly and graciously convince someone of something.',
  Religion: 'Recall lore about gods, religious rituals and holy symbols.',
  'Sleight of Hand': 'Pick a pocket, conceal a handheld object, or perform legerdemain.',
  Stealth: 'Escape notice by moving quietly and hiding behind things.',
  Survival: 'Follow tracks, forage, find a trail, or avoid natural hazards.',
}

export const skillRows = (s: Dnd5eSheet, level: number) =>
  DND5E_SKILLS.map((k) => skillRow(s, level, k.name))

/** A plain ability check (no skill). */
export function abilityCheck(s: Dnd5eSheet, level: number, a: Dnd5eAbility): Dnd5eD20 {
  const mod = dnd5eHero(s, level).mod(a)
  return d20Test(s, level, {
    label: `${a} check`,
    kind: 'check',
    ability: a,
    bonus: mod,
    lines: [`${a} ${sign(mod)}`],
  })
}

/** A saving throw: the modifier, plus the Proficiency Bonus if proficient (SRD 5.2.1 p. 8). */
export function saveRow(s: Dnd5eSheet, level: number, a: Dnd5eAbility): Dnd5eSkillRow {
  const hero = dnd5eHero(s, level)
  const prof: Dnd5eProf = s.saveProfs?.includes(a) ? 1 : 0
  const mod = hero.mod(a)
  const add = prof ? hero.pb : 0
  const test = d20Test(s, level, {
    label: `${a} save`,
    kind: 'save',
    ability: a,
    bonus: mod + add,
    lines: [`${a} ${sign(mod)}`, ...(add ? [`Proficiency ${sign(add)}`] : [])],
  })
  return { name: `${a} save`, ability: a, prof, test }
}

export const saveRows = (s: Dnd5eSheet, level: number) =>
  DND5E_ABILITIES.map((a) => saveRow(s, level, a))

/** Initiative: a Dexterity check, with the sheet's Initiative (Alert's PB included). */
export function initiativeTest(s: Dnd5eSheet, level: number): Dnd5eD20 {
  const hero = dnd5eHero(s, level)
  const dex = hero.mod('DEX')
  const lines = [`DEX ${sign(dex)}`]
  if (s.initMod !== dex)
    lines.push(`${hero.feat('alert') ? 'Alert' : 'Other'} ${sign(s.initMod - dex)}`)
  return d20Test(s, level, {
    label: 'Initiative',
    kind: 'initiative',
    ability: 'DEX',
    bonus: s.initMod,
    lines,
  })
}

// --- Damage, healing, dying --------------------------------------------------------------

/** The damage types (SRD 5.2.1 p. 16). */
export const DND5E_DAMAGE_TYPES = [
  'Acid',
  'Bludgeoning',
  'Cold',
  'Fire',
  'Force',
  'Lightning',
  'Necrotic',
  'Piercing',
  'Poison',
  'Psychic',
  'Radiant',
  'Slashing',
  'Thunder',
]

export const isDead = (s: Dnd5eSheet) => (s.deathSaves?.failures ?? 0) >= 3 || exhaustionOf(s) >= 6
export const isStable = (s: Dnd5eSheet) => s.hp <= 0 && (s.deathSaves?.successes ?? 0) >= 3
export const isDying = (s: Dnd5eSheet) => s.hp <= 0 && !isDead(s) && !isStable(s)

const has = (list: string[] | undefined, type: string) =>
  (list ?? []).some((x) => norm5e(x) === norm5e(type) || norm5e(x) === 'all damage')

/** The hero's resistances, vulnerabilities and immunities now: the sheet's, plus effects' and conditions'. */
export function defensesNow(
  s: Dnd5eSheet,
  level = 0,
): {
  resist: string[]
  immune: string[]
  vulnerable: string[]
} {
  const resist = [...(s.defenses?.resistances ?? [])]
  for (const d of activeEffectDefs(s)) {
    for (const r of d.resist ?? []) resist.push(r)
    if (d.resistAllBut)
      for (const t of DND5E_DAMAGE_TYPES) if (!d.resistAllBut.includes(t)) resist.push(t)
  }
  for (const m of level ? modifiersNow(s, level) : [])
    for (const r of m.resist ?? []) resist.push(r)
  if (conditionRules(s).some((r) => r.resistAll)) resist.push('All damage')
  return {
    resist: [...new Set(resist)],
    immune: [...(s.defenses?.immunities ?? [])],
    vulnerable: [],
  }
}

export interface Dnd5eHit {
  amount: number
  type?: string
  crit?: boolean
  /** A reaction that halves it (Uncanny Dodge), by name. */
  halve?: string
  /** Amounts taken off first (Heavy Armor Master, Deflect Attacks), with what does it. */
  reduce?: { label: string; amount: number }[]
  /** The hero's level, for the Resistances its features give (Primordial Bond). */
  level?: number
  /** It's halved after the rest (a reaction's Resistance to it, Warding Maneuver). */
  resisted?: string
  /** Dice for what rolls on its own (Relentless Rage's save). */
  rng?: Rng
}

/**
 * Features that keep a hero dropping to 0 HP standing, in the order the sheet tries them:
 * Relentless Endurance (Orc, SRD 5.2.1 p. 86), Undying Sentinel (Ancients 15), Persistent
 * Wrath (Hollow Warden 15, while transformed), Unholy Resuscitation (Undead Patron 10),
 * Relentless Rage (SRD 5.2.1 p. 29, a CON save while raging, DC 10 + 5 a use), Strength of the
 * Grave (Shadow Sorcery 3, a CHA save of DC 5 + the damage). Returns what happened, or ''.
 */
function keepStanding(s: Dnd5eSheet, hit: Dnd5eHit, taken: number): string {
  const level = hit.level ?? 0
  const hero = dnd5eHero(s, level)
  if (usesLeft(s, 'Relentless Endurance') > 0) {
    spendUses(s, 'Relentless Endurance')
    s.hp = 1
    return 'Relentless Endurance: you drop to 1 HP instead.'
  }
  if (usesLeft(s, 'Undying Sentinel') > 0) {
    spendUses(s, 'Undying Sentinel')
    s.hp = Math.min(s.hpMax, 1 + 3 * level)
    return `Undying Sentinel: you stay at 1 HP and regain ${3 * level} (${s.hp}/${s.hpMax}).`
  }
  if (hasEffect(s, 'wrath-of-the-wild') && usesLeft(s, 'Ancient Might: Persistent Wrath') > 0) {
    spendUses(s, 'Ancient Might: Persistent Wrath')
    s.hp = Math.min(s.hpMax, 2 * level)
    return `Persistent Wrath: your HP becomes ${s.hp}.`
  }
  if (usesLeft(s, 'Necrotic Husk: Unholy Resuscitation') > 0) {
    spendUses(s, 'Necrotic Husk: Unholy Resuscitation')
    s.hp = Math.min(s.hpMax, 2 * level)
    setExhaustion(s, exhaustionOf(s) + 1)
    return `Unholy Resuscitation: your HP becomes ${s.hp} and you gain 1 Exhaustion level; chosen creatures within 30 ft make a CON save against 2d10 + CHA Necrotic, half on a success.`
  }
  if (hasEffect(s, 'rage') && hero.has('Relentless Rage')) {
    const uses = s.used?.['Relentless Rage'] ?? 0
    const dc = 10 + 5 * uses
    s.used = { ...s.used, 'Relentless Rage': uses + 1 }
    const r = rollD20(saveRow(s, level, 'CON').test, hit.rng ? { rng: hit.rng } : {})
    if (!r.failed && r.total >= dc) {
      s.hp = Math.min(s.hpMax, 2 * level)
      return `Relentless Rage: DC ${dc} CON save ${r.total}, your HP becomes ${s.hp}.`
    }
    return `Relentless Rage: DC ${dc} CON save ${r.total}, failed.`
  }
  const grave = 'Power of Shadow: Strength of the Grave'
  if (usesLeft(s, grave) > 0) {
    const dc = 5 + taken
    const r = rollD20(saveRow(s, level, 'CHA').test, hit.rng ? { rng: hit.rng } : {})
    if (!r.failed && r.total >= dc) {
      spendUses(s, grave)
      s.hp = Math.min(s.hpMax, Math.max(1, hero.mod('CHA') + level))
      return `Strength of the Grave: DC ${dc} CHA save ${r.total}, your HP becomes ${s.hp}.`
    }
    return `Strength of the Grave: DC ${dc} CHA save ${r.total}, failed.`
  }
  return ''
}

/**
 * Damage after what changes it (SRD 5.2.1 p. 16): reductions and halving first, then
 * Resistance (half, rounded down), then Vulnerability (double); Immunity takes it all.
 */
export function damageAfter(s: Dnd5eSheet, hit: Dnd5eHit): { taken: number; notes: string[] } {
  let n = Math.max(0, Math.floor(hit.amount))
  const notes: string[] = []
  for (const r of hit.reduce ?? []) {
    if (r.amount > 0 && n > 0) {
      n = Math.max(0, n - r.amount)
      notes.push(`${r.label} −${r.amount}`)
    }
  }
  if (hit.halve && n > 0) {
    n = Math.floor(n / 2)
    notes.push(`${hit.halve}: halved`)
  }
  const type = hit.type?.trim()
  const d = defensesNow(s, hit.level ?? 0)
  if (hit.resisted && n > 0 && !(type && has(d.resist, type))) {
    n = Math.floor(n / 2)
    notes.push(`${hit.resisted}: resisted`)
  }
  if (type) {
    if (has(d.immune, type)) return { taken: 0, notes: [...notes, `immune to ${type}`] }
    if (has(d.resist, type)) {
      n = Math.floor(n / 2)
      notes.push(`resistance to ${type}: halved`)
    }
    if (has(d.vulnerable, type)) {
      n *= 2
      notes.push(`vulnerable to ${type}: doubled`)
    }
  }
  return { taken: n, notes }
}

/** DC of the Constitution save to keep Concentration after damage (SRD 5.2.1 p. 179). */
export const concentrationDc = (damage: number) =>
  Math.min(30, Math.max(10, Math.floor(damage / 2)))

/** Effects that end when the hero is Incapacitated (Rage, Dodge), and Concentration. */
export function endOnIncapacitated(s: Dnd5eSheet): string[] {
  if (!activeConditions(s).has('Incapacitated')) return []
  const out: string[] = []
  for (const e of effectsOn(s))
    if (DND5E_EFFECTS[e.key]?.endsIncapacitated) out.push(removeEffect(s, e.key))
  const c = endConcentration(s)
  if (c) out.push(c)
  return out.filter(Boolean)
}

function setUnconscious(s: Dnd5eSheet, on: boolean) {
  const list = s.conditions ?? []
  const there = list.includes('Unconscious')
  if (on && !there) s.conditions = [...list, 'Unconscious']
  else if (!on && there) s.conditions = list.filter((c) => c !== 'Unconscious')
}

export interface Dnd5eDamageResult {
  line: string
  taken: number
  /** The Concentration save's DC when the hero concentrates and took damage. */
  concentrationDc: number | null
}

/**
 * Damage (SRD 5.2.1 pp. 16–18): what changes it (`damageAfter`), temporary Hit Points first,
 * then HP down to 0. Dropping to 0: Unconscious (Concentration and Rage end), unless Relentless
 * Endurance leaves 1 HP; damage left over that reaches the HP maximum kills outright. While at
 * 0, damage is a failed death save (two on a Critical Hit) and ends Stable.
 */
export function takeDamage(s: Dnd5eSheet, hit: Dnd5eHit): Dnd5eDamageResult {
  const { taken, notes } = damageAfter(s, hit)
  const saves = (s.deathSaves ??= { successes: 0, failures: 0 })
  const wasUp = s.hp > 0
  const ward = Math.min(Math.max(0, s.arcaneWard ?? 0), taken)
  if (ward) {
    s.arcaneWard = (s.arcaneWard ?? 0) - ward
    notes.push(`Arcane Ward took ${ward}`)
  }
  const temp = Math.max(0, s.tempHp ?? 0)
  const fromTemp = Math.min(temp, taken - ward)
  s.tempHp = temp - fromTemp
  const toHp = taken - ward - fromTemp
  const before = Math.max(0, s.hp)
  s.hp = Math.max(0, before - toHp)
  const overflow = Math.max(0, toHp - before)
  const after: string[] = []
  if (s.hp === 0 && toHp > 0) {
    if (overflow >= s.hpMax && s.hpMax > 0) {
      saves.failures = 3
      after.push('Massive damage: dead.')
    } else if (wasUp) {
      const stand = keepStanding(s, hit, taken)
      if (stand) after.push(stand)
      if (s.hp === 0) {
        setUnconscious(s, true)
        after.push('Down: roll death saves.')
        const ended = endOnIncapacitated(s)
        if (ended.length) after.push(`${ended.join(', ')} ended.`)
      }
    } else if (overflow > 0 && saves.failures < 3) {
      if (saves.successes >= 3) saves.successes = 0
      saves.failures = Math.min(3, saves.failures + (hit.crit ? 2 : 1))
      after.push(
        saves.failures >= 3
          ? 'Death save failed (3/3): dead.'
          : `Death save failed (${saves.failures}/3).`,
      )
    }
  }
  const dc =
    taken > 0 && s.concentration && s.hp > 0 && !holdsConcentration(s, hit.level ?? 0)
      ? concentrationDc(taken)
      : null
  if (dc !== null) after.push(`Concentration on ${s.concentration!.name}: CON save DC ${dc}.`)
  const type = hit.type?.trim() ? ` ${hit.type.trim().toLowerCase()}` : ''
  const why = notes.length ? ` (${notes.join(', ')})` : ''
  const line = `Took ${taken}${type} damage${hit.crit ? ' (crit)' : ''}${why}: ${s.hp}/${s.hpMax} HP.${after.length ? ` ${after.join(' ')}` : ''}`
  return { line, taken, concentrationDc: dc }
}

/**
 * Concentration damage can't break: Relentless Hunter's Hunter's Mark (SRD 5.2.1 p. 58),
 * Focused Conjuration's Conjuration spells.
 */
function holdsConcentration(s: Dnd5eSheet, level: number): boolean {
  const c = s.concentration
  if (!c) return false
  const hero = dnd5eHero(s, level)
  if (c.slug === 'hunters-mark' && hero.has('Relentless Hunter')) return true
  return c.school === 'Conjuration' && hero.has('Focused Conjuration')
}

/** Healing up to the maximum; from 0 it resets the death saves and wakes the hero (p. 18). */
export function heal(s: Dnd5eSheet, amount: number): string {
  const n = Math.max(0, Math.floor(amount))
  if (!n) return ''
  if (isDead(s)) return 'Healing has no effect: the hero is dead.'
  const wasDown = s.hp <= 0
  s.hp = Math.min(s.hpMax, Math.max(0, s.hp) + n)
  if (wasDown) {
    s.deathSaves = { successes: 0, failures: 0 }
    setUnconscious(s, false)
  }
  return `Healed ${n}: ${s.hp}/${s.hpMax} HP.${wasDown ? ' Death saves reset.' : ''}`
}

/** Temporary Hit Points don't stack: the higher number stays (SRD 5.2.1 p. 18). */
export function gainTempHp(s: Dnd5eSheet, amount: number, from: string): string {
  const n = Math.max(0, Math.floor(amount))
  if (n <= (s.tempHp ?? 0)) return `${from}: ${n} temporary HP, but you keep your ${s.tempHp}.`
  s.tempHp = n
  return `${from}: ${n} temporary HP.`
}

/** The death saving throw test: no ability, Exhaustion and Bless apply, Durable gives Advantage. */
export function deathSaveTest(s: Dnd5eSheet, level: number): Dnd5eD20 {
  return d20Test(s, level, { label: 'Death save', kind: 'death', bonus: 0, lines: [] })
}

/**
 * A death saving throw (SRD 5.2.1 p. 17): 10 or higher succeeds, three successes make you
 * Stable, three failures kill you; a 1 is two failures; a 20 gives back 1 HP.
 */
export function deathSave(
  s: Dnd5eSheet,
  level: number,
  o: { d20?: number[]; mode?: D20Mode; rng?: Rng } = {},
): string {
  if (!isDying(s)) return isDead(s) ? 'The hero is dead.' : 'No death save needed.'
  const t = deathSaveTest(s, level)
  const r = rollD20(t, o)
  const saves = (s.deathSaves ??= { successes: 0, failures: 0 })
  if (r.natural === 20 || (t.twentyOn && r.d20 >= t.twentyOn)) {
    s.hp = 1
    s.deathSaves = { successes: 0, failures: 0 }
    setUnconscious(s, false)
    return `${r.line.replace(/\.$/, '')}: you regain 1 HP and wake.`
  }
  if (r.natural === 1) saves.failures = Math.min(3, saves.failures + 2)
  else if (r.total >= 10) saves.successes = Math.min(3, saves.successes + 1)
  else saves.failures = Math.min(3, saves.failures + 1)
  const state =
    saves.failures >= 3
      ? 'three failures: dead'
      : saves.successes >= 3
        ? 'three successes: Stable'
        : `${saves.successes} success${saves.successes === 1 ? '' : 'es'}, ${saves.failures} failure${saves.failures === 1 ? '' : 's'}`
  return `${r.line.replace(/\.$/, '')}: ${r.natural === 1 ? 'two failures' : r.total >= 10 ? 'success' : 'failure'}, ${state}.`
}

/** Stable at 0 HP (Spare the Dying, a DC 10 Medicine check): no more death saves. */
export function stabilize(s: Dnd5eSheet): string {
  if (!isDying(s)) return ''
  s.deathSaves = { successes: 3, failures: s.deathSaves?.failures ?? 0 }
  return 'Stable: no more death saves; you regain 1 HP after 1d4 hours.'
}

/** Raised from the dead (Revivify and the like): 1 HP, death saves cleared, awake. */
export function resurrect(s: Dnd5eSheet): string {
  s.hp = 1
  s.deathSaves = { successes: 0, failures: 0 }
  setUnconscious(s, false)
  if (exhaustionOf(s) >= 6) setExhaustion(s, 5)
  return 'Back from the dead at 1 HP.'
}

// --- Concentration -----------------------------------------------------------------------

/** Ends Concentration and the effects that hang on it; returns the spell's name, or ''. */
export function endConcentration(s: Dnd5eSheet): string {
  const c = s.concentration
  if (!c) return ''
  delete s.concentration
  endEffects(s, 'concentration')
  return c.name
}

/** Starts concentrating on a spell; another spell's Concentration ends first. Returns that spell's name. */
export function startConcentration(
  s: Dnd5eSheet,
  spell: { slug: string; name: string; level: number; school?: string },
): string {
  const was = s.concentration?.slug !== spell.slug ? endConcentration(s) : ''
  s.concentration = { ...spell }
  return was
}

/** The Concentration save: a Constitution save; War Caster and Eldritch Mind give Advantage. */
export function concentrationTest(s: Dnd5eSheet, level: number, dc: number): Dnd5eD20 {
  const hero = dnd5eHero(s, level)
  const t = saveRow(s, level, 'CON').test
  t.label = `Concentration (DC ${dc})`
  if (hero.feat('war-caster')) t.adv.push('War Caster')
  if (hero.option('eldritch-mind')) t.adv.push('Eldritch Mind')
  for (const v of effectValues(s, 'concentration')) {
    t.bonus += v.value
    t.lines.push(`${v.label} ${sign(v.value)}`)
  }
  if (activeEffectDefs(s).some((d) => d.reliable?.includes('concentration'))) t.reliable = true
  for (const m of modifiersNow(s, level)) {
    if (m.concentration?.plus !== undefined) {
      const n = amountOf(hero, m.concentration.plus)
      t.bonus += n
      t.lines.push(`${m.feature} ${sign(n)}`)
    }
    if (m.concentration?.adv) t.adv.push(m.feature)
  }
  return t
}

export function concentrationSave(
  s: Dnd5eSheet,
  level: number,
  dc: number,
  o: { d20?: number[]; mode?: D20Mode; rng?: Rng } = {},
): string {
  if (!s.concentration) return ''
  const name = s.concentration.name
  const r = rollTest(s, concentrationTest(s, level, dc), o)
  if (!r.failed && r.total >= dc) return `${r.line.replace(/\.$/, '')}: you keep ${name}.`
  endConcentration(s)
  return `${r.line.replace(/\.$/, '')}: ${name} ends.`
}

// --- Rests ---------------------------------------------------------------------------------

export const hitDiceLeft = (s: Dnd5eSheet, level: number) =>
  Math.max(0, level - (s.hitDiceUsed ?? 0))

/**
 * Spends a Hit Point Die (SRD 5.2.1 p. 186): the die (rolled, or the player's `roll`) plus the
 * Constitution modifier, at least 1 HP.
 */
export function spendHitDie(
  s: Dnd5eSheet,
  level: number,
  o: { roll?: number; rng?: Rng } = {},
): string {
  if (hitDiceLeft(s, level) < 1) return 'No Hit Point Dice left.'
  if (isDead(s)) return 'The hero is dead.'
  const die = s.hitDie || 8
  const roll =
    o.roll !== undefined ? Math.max(1, Math.min(die, Math.round(o.roll))) : rollDie(die, o.rng)
  const con = abilityMod(s.abilities.CON)
  const gain = Math.max(1, roll + con)
  s.hitDiceUsed = (s.hitDiceUsed ?? 0) + 1
  const healed = heal(s, gain)
  return `Hit Point Die d${die}: ${roll} ${sign(con)} = ${gain}. ${healed}`
}

/**
 * Short Rest (SRD 5.2.1 p. 186): Short Rest uses and Pact Magic slots come back, and what
 * features add to it (`restExtras`: Font of Inspiration, Sorcerous Restoration…).
 */
export function shortRest(s: Dnd5eSheet, level = 0): string {
  const back: string[] = []
  for (const r of s.resources ?? []) {
    const spent = s.used?.[r.name] ?? 0
    if (!spent) continue
    if (r.recharge === 'short' || r.recharge === 'turn') {
      restoreUses(s, r.name)
      back.push(r.name)
    } else if (r.short) {
      restoreUses(s, r.name, r.short)
      back.push(r.short === 'all' ? r.name : `${r.short} ${r.name}`)
    }
  }
  if (s.pactUsed) {
    s.pactUsed = 0
    back.push('Pact Magic slots')
  }
  const extras = level ? restExtras(s, level, 'short') : []
  return `Short Rest.${back.length ? ` Back: ${back.join(', ')}.` : ''}${extras.length ? ` ${extras.join(' ')}` : ''}`
}

/**
 * What features do at the end of a rest: Font of Inspiration (Bardic Inspiration back on a
 * Short Rest, SRD 5.2.1 p. 34), Sorcerous Restoration (Sorcery Points up to half the level,
 * p. 66), Refreshed Genius and Magical Guidance (Flash of Genius), Cutthroat (Bloodthirst),
 * Celestial Resilience's temporary HP, Relentless Rage's DC back to 10; after a Long Rest also
 * Portent's foretold d20s, the Blood rune's temporary HP, and the Arcane Ward gone.
 */
function restExtras(s: Dnd5eSheet, level: number, kind: 'short' | 'long'): string[] {
  const hero = dnd5eHero(s, level)
  const out: string[] = []
  const used = { ...s.used }
  delete used['Relentless Rage']
  delete used['Fanatical Focus']
  s.used = used
  if (kind === 'short') {
    if (hero.has('Font of Inspiration') && s.used?.['Bardic Inspiration']) {
      restoreUses(s, 'Bardic Inspiration')
      out.push('Font of Inspiration: Bardic Inspiration back.')
    }
    const sp = s.used?.['Font of Magic'] ?? 0
    if (hero.has('Sorcerous Restoration') && sp && usesLeft(s, 'Sorcerous Restoration') > 0) {
      const n = Math.min(sp, Math.floor(level / 2))
      restoreUses(s, 'Font of Magic', n)
      spendUses(s, 'Sorcerous Restoration')
      out.push(`Sorcerous Restoration: ${n} Sorcery Point${n === 1 ? '' : 's'} back.`)
    }
    const fog = s.used?.['Flash of Genius'] ?? 0
    if (fog && hero.has('Soul of Artifice') && s.inventory.some((i) => i.attuned)) {
      restoreUses(s, 'Flash of Genius')
      out.push('Magical Guidance: Flash of Genius back.')
    } else if (fog && hero.has('Advanced Artifice')) {
      restoreUses(s, 'Flash of Genius', 1)
      out.push('Refreshed Genius: 1 Flash of Genius back.')
    }
    if (hero.has('Dread Incarnate') && s.used?.['Bloodthirst']) {
      restoreUses(s, 'Bloodthirst', 1)
      out.push('Cutthroat: 1 Bloodthirst back.')
    }
  } else {
    s.arcaneWard = 0
    if (hero.has('Portent')) {
      const n = hero.has('Greater Portent') ? 3 : 2
      s.portent = Array.from({ length: n }, () => rollDie(20))
      out.push(`Portent: ${s.portent.join(', ')} foretold.`)
    }
    if (hero.has('Runeforging: Blood'))
      out.push(gainTempHp(s, Math.max(1, hero.mod('CHA')) + level, 'Blood rune'))
  }
  if (hero.has('Celestial Resilience'))
    out.push(gainTempHp(s, level + Math.max(0, hero.mod('CHA')), 'Celestial Resilience'))
  return out
}

/**
 * Long Rest (SRD 5.2.1 p. 186): all HP, all spent Hit Point Dice, spell slots, free casts and
 * limited uses come back; temporary HP go; Exhaustion drops by 1; Concentration and the
 * effects that last until a Long Rest end. A dead hero stays dead.
 */
export function longRest(s: Dnd5eSheet, level: number): string {
  if (isDead(s)) return 'The dead don’t rest.'
  const hero = dnd5eHero(s, level)
  const wasDown = s.hp <= 0
  s.hp = s.hpMax
  s.tempHp = 0
  s.hitDiceUsed = 0
  s.used = {}
  s.slotsUsed = []
  s.pactUsed = 0
  s.freeUsed = {}
  s.deathSaves = { successes: 0, failures: 0 }
  if (wasDown) setUnconscious(s, false)
  const ex = exhaustionOf(s)
  if (ex) setExhaustion(s, ex - 1)
  const ended = [endConcentration(s), ...endEffects(s, 'long')].filter(Boolean)
  const notes = [
    'HP, Hit Point Dice, spell slots and limited uses are back',
    ...(ex ? [`Exhaustion ${ex} → ${ex - 1}`] : []),
    ...(ended.length ? [`${ended.join(', ')} ended`] : []),
  ]
  if (hero.has('Resourceful') && !s.heroicInspiration) {
    s.heroicInspiration = true
    notes.push('Resourceful: Heroic Inspiration')
  }
  const extras = restExtras(s, level, 'long')
  return `Long Rest: ${notes.join('; ')}.${extras.length ? ` ${extras.join(' ')}` : ''}`
}

// --- The turn and the action economy ------------------------------------------------------

export function newTurn(): Dnd5eTurn {
  return {
    active: false,
    actions: 1,
    actionsMax: 1,
    bonus: true,
    reaction: true,
    object: true,
    moved: 0,
    attacks: 0,
    round: 0,
    once: [],
  }
}

export const NOT_YOUR_TURN = 'Not your turn'

/** In an encounter and not on your turn: actions wait for it (reactions don't). */
export const offTurn = (s: Dnd5eSheet) => !!s.inEncounter && !s.turn?.active

/** Why the hero can't do anything now, or ''. */
export function cantAct(s: Dnd5eSheet): string {
  if (isDead(s)) return 'Dead'
  const inc = conditionRules(s).find((r) => r.incapacitated)
  if (inc) return [...activeConditions(s)].includes('Unconscious') ? 'Unconscious' : 'Incapacitated'
  return ''
}

/**
 * Attacks one Attack action makes (SRD 5.2.1 p. 10): Extra Attack 2, the Fighter's Two Extra
 * Attacks 3 and Three Extra Attacks 4; Thirsting Blade is a second attack with the pact weapon.
 */
export function attacksPerAction(s: Dnd5eSheet, level: number): number {
  const hero = dnd5eHero(s, level)
  if (hero.has('Three Extra Attacks')) return 4
  if (hero.has('Two Extra Attacks')) return 3
  if (hero.has('Extra Attack') || hero.option('thirsting-blade')) return 2
  return 1
}

/** What something takes on the turn: an action (the Magic action too), one attack, a Bonus Action… */
export type Dnd5eCost =
  | 'action'
  | 'attack'
  | 'bonus'
  | 'reaction'
  | 'free'
  | 'object'
  | 'magic'
  | 'special'
  | 'time'

export const COST_LABEL: Record<Dnd5eCost, string> = {
  action: 'Action',
  attack: 'Attack',
  bonus: 'Bonus Action',
  reaction: 'Reaction',
  free: 'Free',
  object: 'Object interaction',
  magic: 'Magic action',
  special: 'Special',
  time: 'Takes time',
}

/**
 * Why this can't be paid now, or ''. Outside an encounter nothing is counted. In one, off your
 * turn only reactions and free things go ("Not your turn"); on it, what's left of the action,
 * Bonus Action, Reaction and object interaction decides. Incapacitated, nothing but free.
 */
export function costWhy(s: Dnd5eSheet, cost: Dnd5eCost): string {
  if (cost === 'free' || cost === 'special') return ''
  const stopped = cantAct(s)
  if (stopped) return stopped
  if (!s.inEncounter) return ''
  const t = s.turn ?? newTurn()
  if (cost === 'reaction') return t.reaction ? '' : 'Reaction used'
  if (cost === 'time') return 'Not in combat: it takes longer than a turn'
  if (!t.active) return NOT_YOUR_TURN
  if (cost === 'bonus') return t.bonus ? '' : 'Bonus Action used'
  if (cost === 'object') return t.object || t.actions > 0 ? '' : 'Nothing left to do it with'
  if (cost === 'attack') return t.attacks > 0 || t.actions > 0 ? '' : 'No attacks left'
  return t.actions > 0 ? '' : 'No action left'
}

/**
 * Pays a cost on the turn tracker (only counted in an encounter): one attack uses an attack
 * left in the Attack action or takes the action for a new one; a second object interaction
 * takes the action (Utilize). Returns '' when paid, or why not.
 */
export function payCost(s: Dnd5eSheet, level: number, cost: Dnd5eCost): string {
  const why = costWhy(s, cost)
  if (why || !s.inEncounter) return why
  const t = (s.turn ??= newTurn())
  if (cost === 'reaction') t.reaction = false
  else if (cost === 'bonus') t.bonus = false
  else if (cost === 'object') {
    if (t.object) t.object = false
    else t.actions -= 1
  } else if (cost === 'attack') {
    if (t.attacks > 0) t.attacks -= 1
    else {
      t.actions -= 1
      t.attacks = attacksPerAction(s, level) - 1
    }
  } else if (cost === 'action' || cost === 'magic') t.actions -= 1
  return ''
}

/**
 * Marks a once-a-turn thing used; false when it already was this turn. Outside an encounter
 * there are no turns, so nothing is counted (as costs aren't).
 */
export function useOnce(s: Dnd5eSheet, key: string): boolean {
  if (!s.inEncounter) return true
  const t = (s.turn ??= newTurn())
  if (t.once.includes(key)) return false
  t.once = [...t.once, key]
  return true
}

export const usedOnce = (s: Dnd5eSheet, key: string) =>
  !!s.inEncounter && !!s.turn?.once.includes(key)

/** Actions a turn starts with: 1, Haste's extra one; none while Incapacitated. */
export function turnActions(s: Dnd5eSheet): number {
  if (cantAct(s)) return 0
  return 1 + activeEffectDefs(s).reduce((n, d) => n + (d.actions ?? 0), 0)
}

/** New encounter: in combat, waiting for Initiative. */
export function beginEncounter(s: Dnd5eSheet): string {
  s.inEncounter = true
  s.awaitingInitiative = true
  s.turnDone = false
  s.turn = { ...newTurn(), round: 1 }
  return 'New encounter: roll Initiative.'
}

/** Takes an Initiative total (rolled, typed, or the GM's). */
export function setInitiative(s: Dnd5eSheet, total: number) {
  const t = (s.turn ??= { ...newTurn(), round: 1 })
  t.initiative = total
  s.awaitingInitiative = false
  if (!s.inEncounter) s.inEncounter = true
}

/**
 * Start turn (SRD 5.2.1 p. 13): the action (and Haste's), Bonus Action, Reaction, movement
 * and object interaction come back; what ends at the start of your turn ends. A dying hero
 * makes a death save.
 */
export function startTurn(s: Dnd5eSheet, level = 0): string {
  const was = s.turn ?? newTurn()
  const n = turnActions(s)
  s.turn = {
    ...newTurn(),
    active: true,
    actions: n,
    actionsMax: n,
    bonus: n > 0,
    reaction: n > 0,
    round: Math.max(1, was.round),
    ...(was.initiative !== undefined ? { initiative: was.initiative } : {}),
    ...(was.trackerRound !== undefined ? { trackerRound: was.trackerRound } : {}),
  }
  s.turnDone = false
  const ended = [...endConditions(s, 'turnStart'), ...endEffects(s, 'turnStart')]
  const notes = [`Your turn (round ${s.turn.round})`]
  if (ended.length) notes.push(`${ended.join(', ')} ended`)
  if (isDying(s)) notes.push('roll a death saving throw')
  else if (!n) notes.push(`${cantAct(s)}: no actions`)
  if (hasEffect(s, 'heroism')) notes.push('Heroism: gain your temporary HP')
  if (level) notes.push(...turnStartExtras(s, level))
  return `${notes.join('; ')}.`
}

/**
 * What features do as your turn starts: Heroic Warrior's Heroic Inspiration in combat (SRD
 * 5.2.1 p. 47), Survivor's Heroic Rally (5 + CON while Bloodied, p. 47), Elder Champion's 10 HP.
 */
function turnStartExtras(s: Dnd5eSheet, level: number): string[] {
  const hero = dnd5eHero(s, level)
  const out: string[] = []
  if (s.inEncounter && hero.has('Heroic Warrior') && !s.heroicInspiration) {
    s.heroicInspiration = true
    out.push('Heroic Warrior: Heroic Inspiration')
  }
  const bloodied = s.hp > 0 && s.hp <= Math.floor(s.hpMax / 2)
  if (bloodied && hero.has('Survivor')) out.push(`Heroic Rally: ${heal(s, 5 + hero.mod('CON'))}`)
  if (s.hp > 0 && hasEffect(s, 'elder-champion')) out.push(`Elder Champion: ${heal(s, 10)}`)
  return out
}

/**
 * What features do when the hero rolls Initiative: Persistent Rage gives Rage back (SRD 5.2.1
 * p. 30), Superior Inspiration tops Bardic Inspiration up to 2 (p. 34), Perfect Focus Focus
 * Points to 4 (p. 52), Evergreen Wild Shape gives a use when none is left (p. 45), Ever-Ready
 * Shot an Arcane Shot use.
 */
export function onInitiative(s: Dnd5eSheet, level: number): string[] {
  const hero = dnd5eHero(s, level)
  const out: string[] = []
  const topUp = (name: string, to: number, label: string) => {
    const r = s.resources?.find((x) => x.name === name)
    if (!r) return
    const left = usesLeft(s, name)
    if (left >= to) return
    restoreUses(s, name, Math.min(to, r.max) - left)
    out.push(`${label}: ${name} ${Math.min(to, r.max)}`)
  }
  if (
    hero.has('Persistent Rage') &&
    (s.used?.['Rage'] ?? 0) > 0 &&
    usesLeft(s, 'Persistent Rage') > 0
  ) {
    restoreUses(s, 'Rage')
    spendUses(s, 'Persistent Rage')
    out.push('Persistent Rage: all Rage uses back')
  }
  if (hero.has('Superior Inspiration')) topUp('Bardic Inspiration', 2, 'Superior Inspiration')
  if (hero.has('Perfect Focus')) topUp('Monk’s Focus', 4, 'Perfect Focus')
  if (hero.has('Archdruid') && usesLeft(s, 'Wild Shape') < 1)
    topUp('Wild Shape', 1, 'Evergreen Wild Shape')
  if (hero.has('Ever-Ready Shot') && (s.used?.['Arcane Shot'] ?? 0) > 0) {
    restoreUses(s, 'Arcane Shot', 1)
    out.push('Ever-Ready Shot: 1 Arcane Shot use back')
  }
  return out
}

/** End turn: what ends at the end of your turn ends; the next round starts the next turn. */
export function endTurn(s: Dnd5eSheet): string {
  const t = (s.turn ??= newTurn())
  t.active = false
  t.attacks = 0
  if (s.inEncounter) s.turnDone = true
  const ended = [...endConditions(s, 'turnEnd'), ...endEffects(s, 'turnEnd')]
  return `Turn over.${ended.length ? ` ${ended.join(', ')} ended.` : ''}`
}

/** New round: the round counts up and what lasts "until the next round" ends. */
export function newRound(s: Dnd5eSheet): string {
  const t = (s.turn ??= newTurn())
  t.round += 1
  s.turnDone = false
  const ended = [...endConditions(s, 'round'), ...endEffects(s, 'round')]
  return `Round ${t.round}.${ended.length ? ` ${ended.join(', ')} ended.` : ''}`
}

/** End encounter: combat's effects (Rage, Dodge…) and conditions set to end with it end. */
export function endEncounter(s: Dnd5eSheet): string {
  s.inEncounter = false
  s.awaitingInitiative = false
  s.turnDone = false
  s.turn = newTurn()
  const ended = [...endConditions(s, 'encounter'), ...endEffects(s, 'encounter')]
  return `Encounter over.${ended.length ? ` ${ended.join(', ')} ended.` : ''}`
}
