// The PF2e sheet's Strikes, shared by the Strikes table and the Actions panel's abilities that
// make one (Sudden Charge, Vicious Swing, Reactive Strike, Double Slice): each Strike's attack
// bonus after conditions and effects, its multiple attack penalty (counted over the turn,
// p. 402), damage with Rage, specialization, sneak attack and the like, the deadly and fatal
// traits on a critical hit (p. 282), two-hand's die and versatile's type as the hero holds the
// weapon (pp. 282–283), property runes' persistent damage and keen's natural 19 (GM Core
// p. 237), a finisher's precise strike dice, and the rolls, which the dice tray shows with
// their total and degree. `providePf2eStrikes` in
// components/sheet/Pf2eSheet.vue, `usePf2eStrikes` in its panels.
import type { InjectionKey } from 'vue'
import { loadPf2e } from '~/data/pf2e'
import type { Pf2eSheet } from '~/types/sheets'
import { parseDice, rollCheck, rollDice, showOutcome, sign } from '~/utils/dice'
import { attacked, mapIndex } from '~/utils/pf2eActions'
import { finisherDice } from '~/utils/pf2eClassActions'
import {
  critDiceFor,
  runeDamageNotes,
  traitDie,
  traitsInHands,
  versatileType,
} from '~/utils/pf2eDamage'
import { strikeItem, strikeRunes } from '~/utils/pf2eInventory'
import { afflictionLine } from '~/utils/pf2eItemUse'
import {
  damageConditions,
  effectMods,
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
  /** A penalty of its own (Double Slice's −2 on a second Strike that isn't agile). */
  penalty?: number
}

export interface Pf2eDamageRoll {
  /** Weapon damage dice added on a hit (Vicious Swing). */
  extraDie?: number
  /** Ability making it, for the log. */
  by?: string
  /** Part of a finisher: precise strike deals its dice instead of its flat bonus (p. 158). */
  finisher?: boolean
  /** Leave out precision and other extra dice (Double Slice adds them to one Strike only). */
  noExtra?: boolean
  /** Return the result instead of saying it (Double Slice says both together). */
  quiet?: boolean
}

const natNote = (n: number | null) => (n === 20 ? ', natural 20' : n === 1 ? ', natural 1' : '')

/**
 * A dice expression with its flat modifier moved by `delta` ("1d8+4", −1 → "1d8+3"), a bigger
 * die, and at least `count` dice (a striking rune's, GM Core p. 236).
 */
function shiftDice(dmg: string, delta: number, die?: number, count = 0) {
  const e = parseDice(dmg)
  if (!e) return dmg
  const sides = die && die > e.sides ? die : e.sides
  const dice = Math.max(e.count, count)
  const mod = e.mod + delta
  if (!delta && sides === e.sides && dice === e.count) return dmg
  return `${dice}d${sides}${mod ? sign(mod) : ''}`
}

function create() {
  const { draft, say } = useSheet<Pf2eSheet>()
  const sheet = computed(() => draft.value.sheet)

  /**
   * Deadly and fatal die sizes for Strikes made before the data kept them (their traits say
   * "Deadly" alone): the weapon's traits by name.
   */
  const sized = ref(new Map<string, string[]>())
  const bare = (traits: string) => /(?:^|,)\s*(?:deadly|fatal)\s*(?:,|$)/i.test(traits)
  onMounted(async () => {
    if (!sheet.value.strikes.some((w) => bare(w.traits))) return
    const weapons = await loadPf2e('weapons')
    sized.value = new Map(weapons.map((w) => [w.name.toLowerCase(), w.traits]))
  })
  /** A Strike's traits with deadly's and fatal's die sizes, from the weapon data if need be. */
  const traitsOf = (w: { name: string; traits: string }) => {
    const own = w.traits
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    if (!bare(w.traits)) return own
    const data = sized.value.get(w.name.toLowerCase()) ?? []
    return own.map((t) => data.find((d) => d.toLowerCase().startsWith(`${t.toLowerCase()} d`)) ?? t)
  }

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
  /**
   * How each Strike is held, by index: in two hands (two-hand's die, fatal aim's fatal) and
   * dealing its versatile type (Player Core pp. 282–283).
   */
  const grip = ref<{ twoHands: number[]; versatile: number[] }>({ twoHands: [], versatile: [] })
  const flip = (list: number[], index: number) =>
    list.includes(index) ? list.filter((i) => i !== index) : [...list, index]
  const toggleTwoHands = (index: number) => {
    grip.value = { ...grip.value, twoHands: flip(grip.value.twoHands, index) }
  }
  const toggleVersatile = (index: number) => {
    grip.value = { ...grip.value, versatile: flip(grip.value.versatile, index) }
  }
  /** The attack the next Strike is this turn (0–2), for the table's highlight. */
  const nextAttack = computed(() => mapIndex(sheet.value))

  const strikes = computed(() =>
    sheet.value.strikes.map((w, index) => {
      const held = traitsOf(w)
      const twoHands = grip.value.twoHands.includes(index)
      const versatile = versatileType(held)
      const type = versatile && grip.value.versatile.includes(index) ? versatile : w.type
      const typeInitial = type ? ` ${type.charAt(0).toUpperCase()}` : ''
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
        weapon: w.name,
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
      // Powerful Fist and the like: a bigger die for the fist; two-hand's die in two hands.
      const hands = twoHands ? traitDie(held, 'two-hand') : undefined
      const fist = w.name === 'Fist' ? fistDie(sheet.value) : undefined
      const die = fist || hands ? Math.max(fist ?? 0, hands ?? 0) : undefined
      // Runes on the weapon (GM Core pp. 236–237): striking's dice, property runes' damage.
      const runes = strikeRunes(sheet.value, w.name)
      const dmg = shiftDice(w.dmg, dmgMods.value, die, runes?.striking ? runes.striking + 1 : 0)
      const extra = [
        ...extraDice(sheet.value, level, w, { ...damageFlags.value, stratagem }),
        ...(runes?.property ?? []).flatMap((p) =>
          p.damage ? [{ dice: p.damage.dice, label: `${p.name} (${p.damage.type})` }] : [],
        ),
      ]
      const critNotes = (runes?.property ?? []).flatMap((p) =>
        p.crit ? [`${p.name}: ${p.crit}`] : [],
      )
      // Persistent damage and damage against some foes only, which the total leaves out.
      const runeNotes = runeDamageNotes(runes?.property ?? [])
      const penalties = mapPenalties(sheet.value, w.agile)
      const shown = traitsInHands(held, twoHands)
      const base = parseDice(dmg)
      const crit = base ? critDiceFor(shown, base) : { sides: 0, after: [] }
      // Precise strike's flat bonus, which a finisher deals as dice instead (p. 158).
      const precise =
        effectMods(sheet.value, {
          kind: 'damage',
          melee: !w.ranged,
          agile: w.agile,
          traits,
          level,
        }).find((m) => m.source === 'Precise Strike')?.value ?? 0
      return {
        index,
        name: w.name,
        ranged: !!w.ranged,
        agile: w.agile || traits.includes('agile'),
        unarmed: traits.includes('unarmed') || w.name === 'Fist',
        traits: shown,
        precise,
        /** What a critical hit adds: "+1d10 fatal d10, +1d8 deadly d8", for the crit button. */
        critNote: crit.after.map((x) => `+${x.count}d${x.sides} ${x.label}`).join(', '),
        dmg: `${dmg}${extra.map((x) => `+${x.dice}`).join('')}${typeInitial}`,
        dmgExpr: dmg,
        extra,
        type,
        twoHandDie: traitDie(held, 'two-hand'),
        twoHands,
        versatile,
        versatileOn: type !== w.type,
        keen: (runes?.property ?? []).some((p) => p.keen),
        runeNotes,
        dmgChanged: dmgMods.changed || extra.length > 0 || runeNotes.length > 0 || dmg !== w.dmg,
        dmgNote: [
          dmgMods.note,
          fist && die === fist ? `d${die} fist` : '',
          hands && die === hands ? `d${die} two hands` : '',
          runes?.striking ? `${runes.striking + 1} dice (striking)` : '',
          ...extra.map((x) => `+${x.dice} ${x.label}`),
          ...runeNotes,
        ]
          .filter(Boolean)
          .join(', '),
        critNotes,
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
    const penalty = (w.atks[step]?.penalty ?? 0) + (o.penalty ?? 0)
    const bonus = w.bonus - penalty
    const r = rollCheck(bonus)
    attacked(sheet.value, o.countAs ?? 1)
    const st = stratagemAttacked(stratagemState(), index, w.intAttack)
    damageFlags.value.stratagem = st.ready
    stratagemStruck.value = st.struck
    const ac = targetAc.value
    const degree = ac ? degreeOf(r.total, r.d20, ac, w.keen) : undefined
    const keen = w.keen && r.d20 === 19 ? ' (keen: a critical hit if it hits)' : ''
    const vs = ac && degree ? ` vs AC ${ac}: ${strikeResult(degree)}` : keen
    const by = o.by && !o.quiet ? `${o.by}: ` : ''
    const own = o.penalty ? `, −${o.penalty}` : ''
    const text = `${by}${w.name} (attack ${step + 1}${own}, ${sign(bonus)}): ${r.total}${natNote(r.natural)}${vs}`
    showOutcome({
      label: `${w.name} attack`,
      total: r.total,
      detail: text,
      ...(degree ? { degree: strikeResult(degree) } : {}),
    })
    if (!o.quiet) say(text)
    return { degree, text }
  }

  /**
   * Rolls a Strike's damage (pp. 401, 407): `extraDie` adds weapon dice (Vicious Swing), a
   * finisher swaps precise strike's flat bonus for its dice. A critical hit doubles it all,
   * precision dice included, then fatal's and deadly's dice are added undoubled (p. 282; fatal
   * also raises the weapon's dice to its size). Returns the total and line.
   */
  function damage(index: number, crit: boolean, o: Pf2eDamageRoll = {}) {
    const w = strikes.value[index]
    if (!w) return
    const expr = parseDice(w.dmgExpr)
    if (!expr) {
      say(`${w.name}: “${w.dmgExpr}” isn’t a dice expression like 1d8+4`)
      return
    }
    const c = crit ? critDiceFor(w.traits, expr) : { sides: expr.sides, after: [] }
    const precise = o.finisher && w.precise ? finisherDice(sheet.value, draft.value.level) : ''
    const flat = precise ? w.precise : 0
    const more = {
      ...expr,
      sides: c.sides,
      count: expr.count + (o.extraDie ?? 0),
      mod: expr.mod - flat,
    }
    const extra = [
      ...(o.noExtra ? [] : w.extra),
      ...(precise ? [{ dice: precise, label: 'precise strike finisher' }] : []),
    ]
    const parts = [rollDice(more).total]
    for (const x of extra) {
      const e = parseDice(x.dice)
      if (e) parts.push(rollDice(e).total)
    }
    const rolled = strikeDamage(parts.reduce((a, b) => a + b, 0))
    const after = c.after.map((x) => rollDice({ count: x.count, sides: x.sides, mod: 0 }).total)
    const afterTotal = after.reduce((a, b) => a + b, 0)
    const total = crit ? strikeDamage(rolled, true) + afterTotal : rolled
    const extras = [
      ...(o.extraDie ? [`+${o.extraDie}d${expr.sides} ${o.by ?? 'extra'}`] : []),
      ...(c.sides !== expr.sides ? [`d${c.sides} fatal`] : []),
      ...extra.map((x) => `+${x.dice} ${x.label}`),
      ...c.after.map((x, k) => `+${after[k]} ${x.label}`),
    ]
    const shown = crit
      ? `${total} (2 × ${rolled}${afterTotal ? ` + ${afterTotal}` : ''})`
      : String(total)
    let text =
      `${w.name} ${crit ? 'critical ' : ''}damage: ${shown} ${w.type.toLowerCase()}${extras.length ? ` (${extras.join(', ')})` : ''}`.trim() +
      // A property rune's critical effect (GM Core pp. 236–237), noted for the table to apply,
      // and its persistent damage or damage against some foes.
      (w.runeNotes.length ? `; also ${w.runeNotes.join(', ')}` : '') +
      (crit && w.critNotes.length ? ` ${w.critNotes.join(' ')}` : '')
    stratagemStruck.value = stratagemDamaged(stratagemState(), index).struck
    // An injury poison on the weapon goes into the target with this hit (GM Core p. 249).
    const weapon = strikeItem(sheet.value, w.name)?.pf2e
    const poison = weapon?.poisoned
    if (weapon && poison) {
      delete weapon.poisoned
      text += ` ${poison.name}: the target is exposed (${afflictionLine({ ...poison, exposure: ['injury'] })}).`
    }
    if (!o.quiet) {
      showOutcome({ label: `${w.name} damage`, total, detail: text })
      say(text)
    }
    return { total, text, type: w.type }
  }

  return {
    targetAc,
    damageFlags,
    conditionsOffered,
    strikes,
    nextAttack,
    attack,
    damage,
    toggleTwoHands,
    toggleVersatile,
  }
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
