import { ABILITY_ROLLS, SELF_EFFECTS } from '~/data/nimble/effects'
import type { EffectEnd, Mishap, SelfEffectDef } from '~/data/nimble/types'
import type { NimbleAttack, NimbleSheet } from '~/types/sheets'
import { rollDie, type Rng } from '~/utils/dice'
import { armorHit, armorLabel, ignoresArmor, type ArmorContext } from '~/utils/nimbleTargetArmor'
import {
  abilityBaseName,
  keyStatValue,
  knownSpells,
  knownUtilitySpells,
  malfunctionRisks,
} from '~/utils/nimbleBuild'

const DIE_STEPS = [4, 6, 8, 10, 12, 20]
const POSITIVE = ['Invisible', 'Riding', 'Bloodied', 'Dying', 'Wounded']

function has(sheet: NimbleSheet, name: string): boolean {
  return sheet.abilities.some((a) => abilityBaseName(a.name) === name || a.name === name)
}

function rank(sheet: NimbleSheet, name: string): number {
  const ability = sheet.abilities.find((a) => abilityBaseName(a.name) === name)
  if (!ability) return 0
  return Number(/\((\d+)\)$/.exec(ability.name)?.[1] ?? 1)
}

function value(sheet: NimbleSheet, level: number, formula: string): number {
  return formula.split('+').reduce((sum, term) => {
    const [a, b] = term.split('×')
    const token = (b ?? a ?? '').trim()
    const factor = b ? Number(a) : 1
    const base =
      token === 'LVL'
        ? level
        : token === 'KEY'
          ? (keyStatValue(sheet)?.value ?? 0)
          : token in sheet.stats
            ? sheet.stats[token as keyof NimbleSheet['stats']]
            : Number(token) || 0
    return sum + factor * base
  }, 0)
}

function available(sheet: NimbleSheet, e: SelfEffectDef): boolean {
  if (e.form)
    return e.form.rank === 0
      ? has(sheet, e.form.requires)
      : rank(sheet, e.form.requires) >= e.form.rank
  return !e.trigger || e.trigger === 'use' ? has(sheet, e.source) : false
}

export function effectSources(sheet: NimbleSheet): SelfEffectDef[] {
  return SELF_EFFECTS.filter((e) => available(sheet, e))
}

export function hasTransforms(sheet: NimbleSheet): boolean {
  const spells = new Set([...knownSpells(sheet), ...knownUtilitySpells(sheet)].map((s) => s.name))
  return SELF_EFFECTS.some(
    (e) => e.transform && (e.trigger === 'cast' ? spells.has(e.source) : available(sheet, e)),
  )
}

export function effectDef(source: string): SelfEffectDef | undefined {
  return SELF_EFFECTS.find((e) => e.source === source)
}

function apply(sheet: NimbleSheet, level: number, effect: SelfEffectDef, upcast = 0): string {
  if (effect.form) endForms(sheet)
  const per = effect.tempHpPerUpcast ? value(sheet, level, effect.tempHpPerUpcast) : 0
  const temp = effect.tempHp ? Math.max(0, value(sheet, level, effect.tempHp) + per * upcast) : 0
  if (temp) sheet.tempHp = Math.max(sheet.tempHp, temp)
  if (effect.clearNegative) sheet.conditions = sheet.conditions.filter((c) => POSITIVE.includes(c))
  if (!sheet.conditions.includes(effect.condition))
    sheet.conditions = [...sheet.conditions, effect.condition]
  if (effect.transform) sheet.portraitOverride = sheet.formPortraits[effect.source] ?? ''
  sheet.effects = [
    ...sheet.effects.filter((e) => e.source !== effect.source),
    {
      condition: effect.condition,
      source: effect.source,
      ends: [...effect.ends],
      ...(effect.ends.includes('nextTurnEnd') && sheet.turnActive ? { skip: 1 } : {}),
      ...(temp ? { tempHp: temp } : {}),
    },
  ]
  const label =
    effect.condition === effect.source ? effect.source : `${effect.condition} (${effect.source})`
  return temp ? `${label}: ${temp} temp HP. ${effect.until}.` : `${label} ${effect.until}.`
}

export function applyEffect(sheet: NimbleSheet, level: number, source: string): string {
  const effect = SELF_EFFECTS.find((e) => e.source === source)
  return effect && available(sheet, effect) ? apply(sheet, level, effect) : ''
}

export function applyCastEffect(
  sheet: NimbleSheet,
  level: number,
  spell: string,
  upcast = 0,
): string {
  const effect = SELF_EFFECTS.find((e) => e.source === spell && e.trigger === 'cast')
  return effect ? ` ${apply(sheet, level, effect, upcast)}` : ''
}

export function applyMishapEffect(sheet: NimbleSheet, weapon: string): string {
  const effect = SELF_EFFECTS.find((e) => e.source === weapon && e.trigger === 'mishap')
  return effect ? ` You are ${apply(sheet, 1, effect)}` : ''
}

function endForms(sheet: NimbleSheet): void {
  const forms = sheet.effects.filter((e) => effectDef(e.source)?.form)
  if (forms.length) finish(sheet, forms)
}

function finish(sheet: NimbleSheet, ending: NimbleSheet['effects']): string[] {
  sheet.effects = sheet.effects.filter((e) => !ending.includes(e))
  const notes: string[] = []
  for (const e of ending) {
    if (e.tempHp && !sheet.effects.some((x) => x.tempHp)) sheet.tempHp = 0
    const transformed = sheet.effects.some((x) => effectDef(x.source)?.transform)
    if (effectDef(e.source)?.transform && !transformed) sheet.portraitOverride = ''
    if (effectDef(e.source)?.dropToZero && sheet.hp > 0) {
      sheet.hp = 0
      sheet.dying = true
      sheet.wounds = Math.min(sheet.woundsMax || sheet.wounds + 1, sheet.wounds + 1)
      notes.push(`${e.source} ends: you drop to 0 HP (+1 Wound, Dying).`)
    }
  }
  const lost = [...new Set(ending.map((e) => e.condition))].filter(
    (c) => !sheet.effects.some((e) => e.condition === c),
  )
  sheet.conditions = sheet.conditions.filter((c) => !lost.includes(c))
  return [...(lost.length ? [`No longer ${lost.join(' or ')}.`] : []), ...notes]
}

export function splitMishap(desc: string): { text: string; mishap: Mishap | null } {
  if ((desc.match(/Mishap:/g) ?? []).length !== 1) return { text: desc, mishap: null }
  const m = /\s*Mishap:\s*([^.!]+)[.!]\s*(.*?)(?=\s+Only\b|$)/.exec(desc)
  if (!m) return { text: desc, mishap: null }
  const rest = desc.slice(0, m.index) + desc.slice(m.index + m[0].length)
  return { text: rest.trim(), mishap: { name: m[1]!.trim(), text: m[2]!.trim() } }
}

export function endEffects(sheet: NimbleSheet, trigger: EffectEnd): string {
  const ending = sheet.effects.filter((e) => {
    if (trigger === 'rest') return true
    if (trigger === 'turnEnd' && e.ends.includes('nextTurnEnd')) {
      if (e.skip) {
        e.skip -= 1
        return false
      }
      return true
    }
    if (!e.ends.includes(trigger)) return false
    const keep = effectDef(e.source)?.form?.keepOnSpell
    return !(trigger === 'spell' && keep && has(sheet, keep))
  })
  if (!ending.length) return ''
  return ` ${finish(sheet, ending).join(' ')}`
}

export function endEffect(sheet: NimbleSheet, source: string): string {
  const ending = sheet.effects.filter((e) => e.source === source)
  return ending.length ? finish(sheet, ending).join(' ') : ''
}

export function effectAttacks(sheet: NimbleSheet, level: number): NimbleAttack[] {
  return sheet.effects.flatMap((e) => {
    const attack = effectDef(e.source)?.attack
    if (!attack) return []
    const [dice = '', ...rest] = attack.dice.split('+')
    const flat = rest.length ? value(sheet, level, rest.join('+')) : 0
    return [
      {
        name: attack.name,
        props: [e.source, attack.note].filter(Boolean).join(', '),
        dmg: flat ? `${dice}+${flat}` : dice,
        melee: true,
      },
    ]
  })
}

export function afterEffectAttack(
  sheet: NimbleSheet,
  level: number,
  name: string,
  roll: { miss: boolean; crit: boolean },
): { extra: number; note: string } {
  if (roll.miss) return { extra: 0, note: '' }
  if (name === 'Gore' && sheet.effects.some((e) => e.source === 'Fearsome Beast')) {
    sheet.tempHp = Math.max(sheet.tempHp, level)
    return { extra: 0, note: ` Gore: ${level} temp HP.` }
  }
  if (name === 'Sting' && roll.crit) return { extra: level, note: ' Sting crit: 4×LVL acid.' }
  return { extra: 0, note: '' }
}

export function setMalfunction(sheet: NimbleSheet, name: string, on: boolean): string {
  const risk = malfunctionRisks(sheet).find((m) => m.name === name)
  if (!risk) return ''
  const others = sheet.malfunctions.filter((n) => n !== name)
  sheet.malfunctions = on ? [...others, name] : others
  const condition = risk.condition
  if (condition)
    sheet.conditions = on
      ? [...sheet.conditions.filter((c) => c !== condition), condition]
      : sheet.conditions.filter((c) => c !== condition)
  return on ? `${name}: ${risk.label} (${risk.fix}).` : `${name}: working again.`
}

export function clearEffect(sheet: NimbleSheet, condition: string): void {
  sheet.effects = sheet.effects.filter((e) => e.condition !== condition)
}

/** True when using the ability is an attack the hero makes (Homing Missile, Scrapbot Swarm). */
export function isAttackRoll(sheet: NimbleSheet, ability: string): boolean {
  const def = ABILITY_ROLLS.find((r) => r.ability === ability)
  return !!def?.attack && (!def.requires || has(sheet, def.requires))
}

/**
 * Rolls an ability's dice. `disadvantage` (negative: advantage) adds that many
 * dice and keeps the lowest (highest), as for Rushed attacks.
 */
export function abilityRoll(
  sheet: NimbleSheet,
  ability: string,
  rng: Rng = Math.random,
  disadvantage = 0,
  armor: ArmorContext = { armor: 'none' },
): string {
  const def = ABILITY_ROLLS.find((r) => r.ability === ability)
  if (!def || (def.requires && !has(sheet, def.requires))) return ''
  const ups = (def.upgrades ?? []).filter((u) => has(sheet, u.name))
  const base = def.count.reduce<number>(
    (n, c) => n + (typeof c === 'number' ? c : Math.max(0, sheet.stats[c])),
    0,
  )
  const count = base + ups.reduce((n, u) => n + (u.count ?? 0), 0)
  const steps = ups.reduce((n, u) => n + (u.dieSteps ?? 0), 0)
  const at = DIE_STEPS.indexOf(def.die)
  const die = at < 0 ? def.die : (DIE_STEPS[Math.min(at + steps, DIE_STEPS.length - 1)] ?? def.die)
  const mult = ups.reduce((n, u) => n * (u.mult ?? 1), 1)
  const odds = disadvantage - (ups.some((u) => u.advantage) ? 1 : 0)
  const stepsOf = (n: number) => (n > 1 ? `${n}× ` : '')
  const oddsText =
    odds > 0
      ? ` with ${stepsOf(odds)}disadvantage`
      : odds < 0
        ? ` with ${stepsOf(-odds)}advantage`
        : ''
  if (count < 1) return ` ${ability}: no dice to roll (${def.count.join('+')} is 0).`
  if (sheet.ownDice) {
    const dc = (def.dc ?? 0) + ups.reduce((n, u) => n + (u.dc ?? 0), 0)
    const notes = [def.note, ...ups.map((u) => u.note)]
      .filter((n): n is string => !!n)
      .map((n) => n.replace('{dc}', String(dc)))
    const extra = `${oddsText}${mult > 1 ? `, ×${mult}` : ''}`
    return ` ${ability}: roll ${count}d${die}${extra} yourself.${notes.length ? ` ${notes.join(' ')}` : ''}`
  }
  const rolled = Array.from({ length: count + Math.abs(odds) }, () => rollDie(die, rng))
  const rolls = odds
    ? [...rolled].sort((a, b) => (odds > 0 ? a - b : b - a)).slice(0, count)
    : rolled
  const crit = !!def.noMiss && rolls[0] === die
  for (let last = crit ? die : 0; last === die; ) {
    last = rollDie(die, rng)
    rolls.push(last)
  }
  const rolledTotal = rolls.reduce((a, b) => a + b, 0) * mult
  const against = {
    ...armor,
    ignore: armor.ignore || (ignoresArmor(def.note ?? '') ? 'ignores armor' : ''),
  }
  // Each construct of a swarm (`each`) can hit a different target, so armor meets each hit.
  const hit =
    def.kind !== 'damage'
      ? { damage: rolledTotal, note: '' }
      : def.each
        ? {
            damage: rolls.reduce((sum, r) => sum + armorHit(r * mult, 0, against).damage, 0),
            note: armorLabel(against),
          }
        : armorHit(rolledTotal, 0, against, crit)
  const total = hit.damage
  const dc = (def.dc ?? 0) + ups.reduce((n, u) => n + (u.dc ?? 0), 0)
  const notes = [def.note, ...ups.map((u) => u.note)]
    .filter((n): n is string => !!n)
    .map((n) => n.replace('{dc}', String(dc)))
  const word = `${def.kind === 'healing' ? 'HP healed' : 'damage'}${crit ? ' · critical' : ''}`
  const shown = def.each ? `${rolls.join(', ')}` : rolls.join(' + ')
  const times = mult > 1 ? ` ×${mult}` : ''
  return ` ${ability}: ${total} ${word}${hit.note} (${count}d${die}${oddsText}: ${shown}${times}).${notes.length ? ` ${notes.join(' ')}` : ''}`
}
