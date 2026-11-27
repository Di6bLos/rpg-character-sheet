// Wild Shape (SRD 5.2.1 p. 44, 2024 rules): the Beast forms a Druid knows (4, 6 at level 4, 8 at
// level 8), their highest Challenge Rating (1/4, 1/2, then 1; a Circle of the Moon druid's is
// its Druid level ÷ 3, p. 46) and no Fly Speed before level 8; taking a form (a Bonus Action and
// a use: temporary HP of the Druid level, three times it with Circle Forms) and leaving it; and
// the form's attacks as attack plans the Attacks panel rolls. The data has no monster stat
// blocks yet, so each form's AC, Speed and attacks are typed in by the player
// (`sheet.beastForms`). Pure; tests/dnd5eWildShape.test.ts.
import type { Dnd5eBeastForm, Dnd5eSheet } from '~/types/sheets'
import type { Dnd5eAttackPlan, Dnd5eTarget } from '~/utils/dnd5eAttacks'
import { adjustAttackTest } from '~/utils/dnd5eAttacks'
import { addEffect, hasEffect, removeEffect } from '~/utils/dnd5eEffects'
import {
  costWhy,
  d20Test,
  dnd5eHero,
  gainTempHp,
  payCost,
  spendUses,
  usesLeft,
} from '~/utils/dnd5ePlay'
import { sign } from '~/utils/dice'

/** A Challenge Rating as a number ("1/4" → 0.25). */
export function crValue(cr: string): number {
  const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(cr)
  if (m) return Number(m[1]) / Number(m[2])
  const n = Number(cr)
  return Number.isFinite(n) ? n : Infinity
}

/** The Beast Shapes table at the hero's Druid level (SRD 5.2.1 p. 44), and Circle Forms' CR. */
export function beastShapes(
  s: Dnd5eSheet,
  heroLevel: number,
): { known: number; maxCr: number; maxCrText: string; fly: boolean } {
  const hero = dnd5eHero(s, heroLevel)
  const level = hero.levelOf('Wild Shape')
  const known = level >= 8 ? 8 : level >= 4 ? 6 : 4
  const moon = hero.has('Circle Forms')
  const base = level >= 8 ? 1 : level >= 4 ? 0.5 : 0.25
  const maxCr = moon ? Math.max(base, Math.floor(level / 3)) : base
  const maxCrText = maxCr === 0.25 ? '1/4' : maxCr === 0.5 ? '1/2' : String(maxCr)
  return { known, maxCr, maxCrText, fly: level >= 8 }
}

/** Why a form can't be one of the hero's known forms, or ''. */
export function formWhy(s: Dnd5eSheet, level: number, f: Dnd5eBeastForm): string {
  const b = beastShapes(s, level)
  if (crValue(f.cr) > b.maxCr) return `CR ${f.cr} is above ${b.maxCrText}`
  if (f.fly && !b.fly) return 'No Fly Speed before Druid level 8'
  return ''
}

/** Adds a known form (no more than the table allows; a form of that name is replaced). */
export function learnForm(s: Dnd5eSheet, level: number, f: Dnd5eBeastForm): string {
  const why = formWhy(s, level, f)
  if (why) return `${f.name}: ${why}.`
  const others = (s.beastForms ?? []).filter((x) => x.name !== f.name)
  if (others.length >= beastShapes(s, level).known)
    return `You know ${others.length} forms already; forget one first.`
  s.beastForms = [...others, f]
  return `${f.name} is a known form.`
}

export function forgetForm(s: Dnd5eSheet, name: string) {
  s.beastForms = (s.beastForms ?? []).filter((x) => x.name !== name)
  if (s.beastForm === name) leaveForm(s)
}

/** The form the hero is in now, while Wild Shape lasts. */
export function activeForm(s: Dnd5eSheet): Dnd5eBeastForm | null {
  if (!hasEffect(s, 'wild-shape') || !s.beastForm) return null
  return s.beastForms?.find((f) => f.name === s.beastForm) ?? null
}

/** Why the hero can't take a form now, or ''. */
export function shapeWhy(s: Dnd5eSheet): string {
  const turn = costWhy(s, 'bonus')
  if (turn) return turn
  return usesLeft(s, 'Wild Shape') < 1 ? 'No Wild Shape uses left' : ''
}

/**
 * Takes a known form (SRD 5.2.1 p. 44): a Bonus Action and a Wild Shape use, temporary HP of
 * the Druid level (three times it with Circle Forms), and its AC, Speed and attacks.
 */
export function assumeForm(s: Dnd5eSheet, level: number, name: string): string {
  const f = s.beastForms?.find((x) => x.name === name)
  if (!f) return ''
  const why = shapeWhy(s)
  if (why) return `Wild Shape: ${why}.`
  payCost(s, level, 'bonus')
  spendUses(s, 'Wild Shape')
  s.beastForm = f.name
  addEffect(s, 'wild-shape', { name: `Wild Shape: ${f.name}` })
  const hero = dnd5eHero(s, level)
  const moon = hero.has('Circle Forms')
  const druid = hero.levelOf('Wild Shape')
  const temp = gainTempHp(s, moon ? 3 * druid : druid, moon ? 'Circle Forms' : 'Wild Shape')
  return `Wild Shape: you become a ${f.name} (AC ${f.ac}, ${f.speed}). ${temp}`
}

/** Leaves the form (a Bonus Action on your turn, or when it ends on its own). */
export function leaveForm(s: Dnd5eSheet, level = 0): string {
  const was = s.beastForm
  if (level && s.turn?.active && !costWhy(s, 'bonus')) payCost(s, level, 'bonus')
  removeEffect(s, 'wild-shape')
  delete s.beastForm
  return was ? `You leave the ${was} form.` : ''
}

/** "1d6+2" → dice and modifier. */
function splitDamage(d: string): { dice: string; mod: number } {
  const m = /^\s*(\d*d\d+)\s*([+-]\s*\d+)?\s*$/i.exec(d)
  if (m) return { dice: m[1]!, mod: m[2] ? Number(m[2].replace(/\s+/g, '')) : 0 }
  const n = Number(d)
  return { dice: '', mod: Number.isFinite(n) ? n : 0 }
}

/** A form's attack as an attack plan: the stat block's bonus and damage, with the hero's riders. */
export function beastAttack(
  s: Dnd5eSheet,
  level: number,
  f: Dnd5eBeastForm,
  i: number,
  o: { target?: Dnd5eTarget } = {},
): Dnd5eAttackPlan {
  const a = f.attacks[i]!
  const hero = dnd5eHero(s, level)
  const t = d20Test(s, level, {
    label: a.name,
    kind: 'attack',
    ability: 'STR',
    bonus: a.bonus,
    lines: [`${f.name}’s ${a.name} ${sign(a.bonus)}`],
  })
  adjustAttackTest(s, t, { melee: true, strength: true, ...(o.target ? { target: o.target } : {}) })
  const { dice, mod } = splitDamage(a.damage)
  return {
    key: `beast:${i}`,
    name: `${a.name} (${f.name})`,
    ability: 'STR',
    melee: true,
    test: t,
    dice,
    mod,
    type: a.type || 'Bludgeoning',
    flat: [],
    extras: [],
    critOn: 20,
    gwf: false,
    savage: false,
    mastery: null,
    cost: 'attack',
    nick: false,
    notes: hero.has('Improved Circle Forms') ? ['Improved Circle Forms: it can deal Radiant'] : [],
    masteryDc: 0,
    kind: 'beast',
  }
}
