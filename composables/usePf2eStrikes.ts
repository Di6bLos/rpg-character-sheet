// The PF2e sheet's Strikes, shared by the Strikes table and the Actions panel's abilities that
// make one (Sudden Charge, Vicious Swing, Reactive Strike): each Strike's attack bonus after
// conditions and effects, its multiple attack penalty (counted over the turn, p. 402), damage
// with Rage, specialization, sneak attack and the like, and the rolls. `providePf2eStrikes` in
// components/sheet/Pf2eSheet.vue, `usePf2eStrikes` in its panels.
import type { InjectionKey } from 'vue'
import type { Pf2eSheet } from '~/types/sheets'
import { parseDice, rollAttack, rollDice, sign } from '~/utils/dice'
import { attacked, mapIndex } from '~/utils/pf2eActions'
import {
  damageConditions,
  extraDice,
  fistDie,
  mapPenalties,
  stratagemAttacked,
  stratagemDamaged,
  stratagemUsesInt,
} from '~/utils/pf2eEffects'
import { type Pf2eDegree, adjusted, degreeOf, strikeDamage, strikeResult } from '~/utils/pf2ePlay'

export interface Pf2eStrikeRoll {
  /** Which attack it is for the multiple attack penalty (0–2); the turn's count when absent. */
  map?: number
  /** Attacks it counts as (Vicious Swing 2, Reactive Strike 0). */
  countAs?: number
  /** Ability making it, for the log. */
  by?: string
  /** Return the line instead of saying it (the caller says it with more). */
  quiet?: boolean
}

const natNote = (n: number | null) => (n === 20 ? ', natural 20' : n === 1 ? ', natural 1' : '')

/** A dice expression with its flat modifier moved by `delta` ("1d8+4", −1 → "1d8+3"). */
function shiftDice(dmg: string, delta: number, die?: number) {
  const e = parseDice(dmg)
  if (!e) return dmg
  const sides = die && die > e.sides ? die : e.sides
  const mod = e.mod + delta
  if (!delta && sides === e.sides) return dmg
  return `${e.count}d${sides}${mod ? sign(mod) : ''}`
}

function create() {
  const { draft, say } = useSheet<Pf2eSheet>()
  const sheet = computed(() => draft.value.sheet)

  /** The target's AC, for Strike results; blank rolls without one. */
  const targetAc = ref<number | null>(null)
  /** Situations that add damage dice the hero's abilities give (sneak attack, precision). */
  const damageFlags = ref({ offGuard: false, huntedPrey: false, stratagem: false })
  /** The Strike whose attack used Devise a Stratagem, until its damage is rolled. */
  const stratagemStruck = ref<number>()
  const conditionsOffered = computed(() => damageConditions(sheet.value))
  const stratagemState = () => ({
    ready: damageFlags.value.stratagem,
    struck: stratagemStruck.value,
  })
  /** The attack the next Strike is this turn (0–2), for the table's highlight. */
  const nextAttack = computed(() => mapIndex(sheet.value))

  const strikes = computed(() =>
    sheet.value.strikes.map((w, index) => {
      const typeInitial = w.type ? ` ${w.type.charAt(0).toUpperCase()}` : ''
      const attr = w.attr ?? 'STR'
      const traits = w.traits.split(',').map((t) => t.trim().toLowerCase())
      const level = draft.value.level
      // Devise a Stratagem: the next Strike's attack can use INT (Player Core 2 p. 103), and
      // strategic strike's dice go with it; the Strike that did keeps them for its damage.
      const intAttack = damageFlags.value.stratagem && stratagemUsesInt(sheet.value, w)
      const stratagem = intAttack || stratagemStruck.value === index
      const attackBase = intAttack
        ? w.bonus - sheet.value.attrs[attr] + sheet.value.attrs.INT
        : w.bonus
      const attack = adjusted(sheet.value, attackBase, {
        kind: 'attack',
        attr: intAttack ? 'INT' : attr,
        traits,
        level,
        ...(w.rank ? { rank: w.rank } : {}),
      })
      // Melee damage adds STR, so enfeebled lowers it (p. 443); effects like Rage and
      // Courageous Anthem add theirs (Rage only to melee, halved for agile).
      const dmgMods = adjusted(sheet.value, 0, {
        kind: 'damage',
        attr: w.ranged ? undefined : 'STR',
        melee: !w.ranged,
        agile: w.agile,
        traits,
        rank: w.rank,
        level,
      })
      // Powerful Fist and the like: a bigger die for the fist.
      const die = w.name === 'Fist' ? fistDie(sheet.value) : undefined
      const dmg = shiftDice(w.dmg, dmgMods.value, die)
      const extra = extraDice(sheet.value, level, w, { ...damageFlags.value, stratagem })
      const penalties = mapPenalties(sheet.value, w.agile)
      return {
        index,
        name: w.name,
        ranged: !!w.ranged,
        traits: w.traits
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        dmg: `${dmg}${extra.map((x) => `+${x.dice}`).join('')}${typeInitial}`,
        dmgExpr: dmg,
        extra,
        type: w.type,
        dmgChanged: dmgMods.changed || extra.length > 0 || dmg !== w.dmg,
        dmgNote: [
          dmgMods.note,
          die ? `d${die} fist` : '',
          ...extra.map((x) => `+${x.dice} ${x.label}`),
        ]
          .filter(Boolean)
          .join(', '),
        changed: attack.changed,
        note: attack.note,
        intAttack,
        bonus: attack.value,
        atks: penalties.map((penalty, i) => ({
          text: sign(attack.value - penalty),
          label: `${w.name} attack ${i + 1}`,
          penalty,
        })),
      }
    }),
  )

  /**
   * Rolls a Strike's attack at a multiple attack penalty step and counts it for the turn;
   * returns the degree when the target's AC is set.
   */
  function attack(index: number, o: Pf2eStrikeRoll = {}): { degree?: Pf2eDegree; text: string } {
    const w = strikes.value[index]
    if (!w) return { text: '' }
    const step = o.map ?? nextAttack.value
    const penalty = w.atks[step]?.penalty ?? 0
    const bonus = w.bonus - penalty
    const r = rollAttack(bonus)
    attacked(sheet.value, o.countAs ?? 1)
    const st = stratagemAttacked(stratagemState(), index, w.intAttack)
    damageFlags.value.stratagem = st.ready
    stratagemStruck.value = st.struck
    const ac = targetAc.value
    const degree = ac ? degreeOf(r.total, r.d20, ac) : undefined
    const vs = ac && degree ? ` vs AC ${ac}: ${strikeResult(degree)}` : ''
    const by = o.by && !o.quiet ? `${o.by}: ` : ''
    const text = `${by}${w.name} (attack ${step + 1}, ${sign(bonus)}): ${r.total}${natNote(r.natural)}${vs}`
    if (!o.quiet) say(text)
    return { degree, text }
  }

  /** Rolls a Strike's damage; `extraDie` adds weapon dice (Vicious Swing). */
  function damage(index: number, crit: boolean, o: { extraDie?: number; by?: string } = {}) {
    const w = strikes.value[index]
    if (!w) return
    const expr = parseDice(w.dmgExpr)
    if (!expr) return say(`${w.name}: “${w.dmgExpr}” isn’t a dice expression like 1d8+4`)
    const more = o.extraDie ? { ...expr, count: expr.count + o.extraDie } : expr
    const parts = [rollDice(more).total]
    for (const x of w.extra) {
      const e = parseDice(x.dice)
      if (e) parts.push(rollDice(e).total)
    }
    const total = strikeDamage(parts.reduce((a, b) => a + b, 0))
    const extras = [
      ...(o.extraDie ? [`+${o.extraDie}d${expr.sides} ${o.by ?? 'extra'}`] : []),
      ...w.extra.map((x) => `+${x.dice} ${x.label}`),
    ]
    const shown = crit ? `${strikeDamage(total, true)} (2 × ${total})` : String(total)
    // A critical hit doubles all of it, precision dice included (p. 401); deadly and fatal
    // dice are added by hand.
    say(
      `${w.name} ${crit ? 'critical ' : ''}damage: ${shown} ${w.type.toLowerCase()}${extras.length ? ` (${extras.join(', ')})` : ''}`.trim(),
    )
    stratagemStruck.value = stratagemDamaged(stratagemState(), index).struck
  }

  return { targetAc, damageFlags, conditionsOffered, strikes, nextAttack, attack, damage }
}

export type Pf2eStrikes = ReturnType<typeof create>
const KEY: InjectionKey<Pf2eStrikes> = Symbol('pf2e-strikes')

export function providePf2eStrikes(): Pf2eStrikes {
  const strikes = create()
  provide(KEY, strikes)
  return strikes
}

export function usePf2eStrikes(): Pf2eStrikes {
  const strikes = inject(KEY)
  if (!strikes) throw new Error('usePf2eStrikes() must be used inside the PF2e sheet')
  return strikes
}
