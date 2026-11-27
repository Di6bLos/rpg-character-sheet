import type { Dnd5eSheet, Dnd5eWeapon } from '~/types/sheets'
import { showOutcome } from '~/utils/dice'
import {
  type Dnd5eAttackPlan,
  type Dnd5eGrip,
  WEAPON_PROPERTY_TEXT,
  hitChance,
  rollAttack5e,
  unarmedAttack,
  weaponAttack,
  weaponDef,
} from '~/utils/dnd5eAttacks'
import { costWhy, d20Mode, dnd5eHero, payCost } from '~/utils/dnd5ePlay'

/** A weapon or Unarmed Strike card on the Attacks panel. */
export interface Dnd5eAttackCard {
  key: string
  w: Dnd5eWeapon | null
  plan: Dnd5eAttackPlan
  props: { label: string; title?: string; text?: string }[]
  masteryName: string
  canGrip: { twoHands: boolean; thrown: boolean; offhand: boolean; long: boolean }
}

/**
 * The 5e Attacks for the hero in the current sheet editor (SRD 5.2.1 p. 16): weapon and Unarmed
 * Strike cards with their grips (two hands, thrown, off-hand, long range) and Sneak Attack,
 * the odds against the Target row's AC, Advantage or Disadvantage the table calls, Roll (the
 * attack and its damage, utils/dnd5eAttacks.ts), and the Spells, Abilities and On a hit groups.
 * Shared by the sheet's Attacks panel and the battle board's action tiles; results show under
 * the card's key.
 */
export function useDnd5eAttacks() {
  const { draft, canEdit, say } = useSheet<Dnd5eSheet>()
  const { claim, resultFor } = useResultOwner()
  const { data, columns, entries, target, attackMode } = useDnd5eSheet()
  const casting = useDnd5eCasting()
  const typed = useTypedRoll()
  const sheet = computed(() => draft.value.sheet)
  const level = computed(() => draft.value.level)
  const turnActive = computed(() => !!sheet.value.turn?.active)

  const grips = ref<Record<string, Dnd5eGrip>>({})
  const sneakPick = ref<Record<string, boolean>>({})

  function setGrip(key: string, part: keyof Dnd5eGrip) {
    const now = grips.value[key] ?? {}
    grips.value = { ...grips.value, [key]: { ...now, [part]: !now[part] } }
  }

  const cards = computed<Dnd5eAttackCard[]>(() => {
    const seen = new Set<string>()
    const out: Dnd5eAttackCard[] = []
    const t = target.value
    sheet.value.weapons.forEach((w, i) => {
      const id = `${w.name}|${w.slug ?? ''}`
      if (seen.has(id)) return
      seen.add(id)
      const key = `w:${i}`
      const def = weaponDef(w, data.value?.weapons ?? [])
      const plan = weaponAttack(sheet.value, level.value, w, def, {
        key,
        grip: grips.value[key] ?? {},
        target: t,
        columns: columns.value,
      })
      const props = def
        ? def.propertyText.map((p) => {
            const name = p.replace(/\s*\(.*$/, '')
            return { label: p, title: name, text: WEAPON_PROPERTY_TEXT[name] ?? '' }
          })
        : [{ label: w.range }]
      out.push({
        key,
        w,
        plan,
        props: [{ label: `${def?.category ?? ''} ${def?.type ?? ''}`.trim() || w.type }, ...props],
        masteryName: def?.mastery ?? '',
        canGrip: {
          twoHands: !!def?.properties.includes('Versatile'),
          thrown: !!def?.properties.includes('Thrown') && def.type === 'Melee',
          offhand: !!def?.properties.includes('Light'),
          long: !!def?.range,
        },
      })
    })
    const none = { twoHands: false, thrown: false, offhand: false, long: false }
    out.push({
      key: 'unarmed',
      w: null,
      plan: unarmedAttack(sheet.value, level.value, { target: t, columns: columns.value }),
      props: [{ label: 'Melee, 5 ft' }],
      masteryName: '',
      canGrip: none,
    })
    if (dnd5eHero(sheet.value, level.value).has('Martial Arts'))
      out.push({
        key: 'unarmed:bonus',
        w: null,
        plan: unarmedAttack(sheet.value, level.value, {
          target: t,
          columns: columns.value,
          bonusAction: true,
        }),
        props: [{ label: 'Bonus Action after the Attack action (Martial Arts)' }],
        masteryName: '',
        canGrip: none,
      })
    return out
  })

  const modeOf = (p: Dnd5eAttackPlan) => d20Mode(p.test, attackMode.value)
  const sneakable = (p: Dnd5eAttackPlan) => p.extras.some((x) => x.once === 'sneak')
  function sneakOn(c: Dnd5eAttackCard) {
    if (!sneakable(c.plan)) return false
    const picked = sneakPick.value[c.key]
    if (picked !== undefined) return picked
    return modeOf(c.plan) === 'adv' || (!!target.value.allyNear && modeOf(c.plan) !== 'dis')
  }

  function oddsText(p: Dnd5eAttackPlan) {
    const ac = target.value.ac
    if (ac === null) return ''
    const c = hitChance(p.test.bonus, ac, modeOf(p), p.critOn)
    return `vs AC ${ac}: ${c.hit}% hit · ${c.crit}% crit`
  }

  function oddsWhy(p: Dnd5eAttackPlan) {
    return [
      ...p.test.lines,
      ...p.test.dice.map((d) => `${d.label} ${d.dice}`),
      ...p.test.adv.map((a) => `Advantage: ${a}`),
      ...p.test.dis.map((d) => `Disadvantage: ${d}`),
      ...(attackMode.value !== 'normal'
        ? [`Your call: ${attackMode.value === 'adv' ? 'Advantage' : 'Disadvantage'}`]
        : []),
    ].join('\n')
  }

  const modeLabel = (p: Dnd5eAttackPlan) => {
    const m = modeOf(p)
    return m === 'adv' ? 'Advantage' : m === 'dis' ? 'Disadvantage' : ''
  }

  function attack(c: Dnd5eAttackCard) {
    if (!canEdit.value) return
    const why = costWhy(sheet.value, c.plan.cost)
    if (why) return claim(c.key, () => say(`${c.plan.name}: ${why}.`))
    const sneak = sneakOn(c)
    typed.run(c.key, c.plan.name, () => {
      payCost(sheet.value, level.value, c.plan.cost)
      const r = rollAttack5e(sheet.value, c.plan, {
        mode: attackMode.value,
        target: target.value,
        sneak,
      })
      claim(c.key, () => say(r.line))
      showOutcome({ label: c.plan.name, total: r.damage, detail: r.line })
    })
    attackMode.value = 'normal'
    delete sneakPick.value[c.key]
  }

  const MODES = [
    { key: 'adv', label: 'Advantage' },
    { key: 'dis', label: 'Disadvantage' },
  ] as const
  const chips = computed(() => MODES.map((m) => ({ ...m, on: attackMode.value === m.key })))
  function toggleMode(key: string) {
    attackMode.value = attackMode.value === key ? 'normal' : (key as 'adv' | 'dis')
  }

  const spellAttacks = computed(() =>
    casting.spells.value.filter((r) => {
      const d = casting.defOf(r.slug)
      return d && !r.book && (d.attack || d.damage?.length) && !!casting.damage(r)
    }),
  )
  const abilities = computed(() => entries.value.filter((e) => e.attack))
  const riders = computed(() =>
    entries.value.filter((e) => e.kind === 'option' && !!e.resource && e.cost === 'special'),
  )

  return {
    draft,
    canEdit,
    say,
    claim,
    resultFor,
    data,
    columns,
    entries,
    target,
    attackMode,
    casting,
    typed,
    sheet,
    level,
    turnActive,
    grips,
    sneakPick,
    setGrip,
    cards,
    modeOf,
    sneakable,
    sneakOn,
    oddsText,
    oddsWhy,
    modeLabel,
    attack,
    MODES,
    chips,
    toggleMode,
    spellAttacks,
    abilities,
    riders,
  }
}
