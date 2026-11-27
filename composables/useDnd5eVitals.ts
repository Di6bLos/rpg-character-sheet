import type { Dnd5eSheet } from '~/types/sheets'
import { sign } from '~/utils/dice'
import {
  type Dnd5eHit,
  acNow,
  concentrationSave,
  damageAfter,
  deathSave,
  dnd5eHero,
  heal,
  hitDiceLeft,
  initiativeTest,
  isDead,
  isDying,
  isStable,
  longRest,
  resurrect,
  shortRest,
  skillRow,
  speedNow,
  spendHitDie,
  stabilize,
  takeDamage,
} from '~/utils/dnd5ePlay'
import { exhaustionOf } from '~/utils/dnd5eConditions'
import { damageGuards, guardHit, guardPreview, saveDamage } from '~/utils/dnd5eDefense'
import { hpTone as toneFor } from '~/utils/roster'
import type { HpTakes } from '~/utils/hpPreview'

/**
 * The 5e Vitals for the hero in the current sheet editor (SRD 5.2.1 pp. 16–18): HP with Crit,
 * the reactions that cut the next hit (`damageGuards`) and Heavy Armor Master for the next
 * damage, temp HP, AC, death saves, Concentration saves, Hit Point Dice, the Speed /
 * Initiative / Proficiency / Passive Perception tiles, typed damage and damage from a save,
 * Short and Long Rest, Heroic Inspiration. Shared by
 * the sheet's Vitals panel and the battle board's hero column; results show under `vit:`.
 */
export function useDnd5eVitals() {
  const { draft, canEdit, say } = useSheet<Dnd5eSheet>()
  const { claim, resultIn } = useResultOwner()
  const { data } = useDnd5eSheet()
  const sheet = computed(() => draft.value.sheet)
  const level = computed(() => draft.value.level)
  const hero = computed(() => dnd5eHero(sheet.value, level.value))
  const ownDice = computed(() => !!sheet.value.ownDice)

  const dead = computed(() => isDead(sheet.value))
  const dying = computed(() => isDying(sheet.value))
  const stable = computed(() => isStable(sheet.value))
  const hpTone = computed(() => toneFor(sheet.value.hp, sheet.value.hpMax))

  /** The next damage is a Critical Hit; the guards picked cut it (Uncanny Dodge halves it). */
  const crit = ref(false)
  const guarding = ref<string[]>([])
  const guards = computed(() => damageGuards(sheet.value, level.value))

  function toggleGuard(key: string) {
    guarding.value = guarding.value.includes(key)
      ? guarding.value.filter((k) => k !== key)
      : [...guarding.value, key]
  }

  /** Heavy Armor Master (PHB 2024): Bludgeoning, Piercing and Slashing cut by PB in Heavy armor. */
  const heavyArmor = computed(() =>
    sheet.value.inventory.some(
      (i) => i.worn && data.value?.armor.find((a) => a.name === i.name)?.category === 'Heavy',
    ),
  )
  const ham = computed(() => hero.value.feat('heavy-armor-master') && heavyArmor.value)

  function hitOf(amount: number, type = ''): Dnd5eHit {
    const reduce =
      ham.value && /^(bludgeoning|piercing|slashing)$/i.test(type)
        ? [{ label: 'Heavy Armor Master', amount: hero.value.pb }]
        : []
    return {
      amount,
      crit: crit.value,
      level: level.value,
      ...(type ? { type } : {}),
      ...(reduce.length ? { reduce } : {}),
    }
  }

  const takes = computed<HpTakes | undefined>(() => {
    const keys = guarding.value
    if (!keys.length) return undefined
    return (d: number) => {
      const r = damageAfter(sheet.value, hitOf(guardPreview(keys, d)))
      return { taken: r.taken, note: keys.join(', ') }
    }
  })

  /** The Concentration save the last damage asked for. */
  const concDc = ref<number | null>(null)

  function hurt(amount: number, type = '') {
    if (!canEdit.value || amount <= 0) return
    const hit = hitOf(amount, type)
    guardHit(sheet.value, level.value, hit, guarding.value)
    const r = takeDamage(sheet.value, hit)
    concDc.value = r.concentrationDc
    crit.value = false
    guarding.value = []
    claim('vit:hp', () => say(r.line))
  }

  function mend(amount: number) {
    if (canEdit.value && amount > 0) claim('vit:hp', () => say(heal(sheet.value, amount)))
  }

  function changeHp(delta: number) {
    if (delta < 0) hurt(-delta)
    else mend(delta)
  }

  function adjustTemp(delta: number) {
    if (canEdit.value) sheet.value.tempHp = Math.max(0, (sheet.value.tempHp ?? 0) + delta)
  }

  const hpState = computed(() => {
    if (dead.value) return 'Dead'
    if (stable.value) return 'Stable at 0 HP'
    if (dying.value) return 'Unconscious · death saves'
    return 'At 0 HP: Unconscious, death saves'
  })

  const ac = computed(() => acNow(sheet.value, level.value))

  /** A roll waiting for the player's d20 (Manual dice). */
  const typing = ref<'death' | 'conc' | 'hd' | null>(null)

  function rollDeath(values?: number[]) {
    if (!canEdit.value) return
    if (ownDice.value && !values) {
      typing.value = 'death'
      return
    }
    typing.value = null
    claim('vit:hp', () => say(deathSave(sheet.value, level.value, values ? { d20: values } : {})))
  }

  function rollConcentration(values?: number[]) {
    const dc = concDc.value
    if (!canEdit.value || dc === null) return
    if (ownDice.value && !values) {
      typing.value = 'conc'
      return
    }
    typing.value = null
    concDc.value = null
    claim('vit:hp', () =>
      say(concentrationSave(sheet.value, level.value, dc, values ? { d20: values } : {})),
    )
  }

  function hitDie(values?: number[]) {
    if (!canEdit.value) return
    if (ownDice.value && !values) {
      typing.value = 'hd'
      return
    }
    typing.value = null
    const roll = values?.[0]
    claim('vit:rest', () =>
      say(spendHitDie(sheet.value, level.value, roll !== undefined ? { roll } : {})),
    )
  }

  function setSaves(kind: 'successes' | 'failures', n: number) {
    if (!canEdit.value) return
    const saves = (sheet.value.deathSaves ??= { successes: 0, failures: 0 })
    saves[kind] = saves[kind] === n ? n - 1 : n
  }

  const speed = computed(() => speedNow(sheet.value, level.value))
  const init = computed(() => initiativeTest(sheet.value, level.value))
  const perception = computed(() => {
    const r = skillRow(sheet.value, level.value, 'Perception')
    return 10 + r.test.bonus
  })
  const tiles = computed(() => [
    {
      label: 'Speed',
      value: `${speed.value.value} ft`,
      sub: speed.value.others || 'walking',
      changed: speed.value.changed,
      why: speed.value.lines.join('\n'),
    },
    {
      label: 'Initiative',
      value: sign(init.value.bonus),
      sub: init.value.adv.length
        ? 'advantage'
        : init.value.dis.length
          ? 'disadvantage'
          : 'DEX check',
      changed: init.value.bonus !== sheet.value.initMod,
      why: [
        ...init.value.lines,
        ...init.value.adv.map((a) => `Advantage: ${a}`),
        ...init.value.dis.map((d) => `Disadvantage: ${d}`),
      ].join('\n'),
    },
    {
      label: 'Proficiency',
      value: sign(hero.value.pb),
      sub: 'bonus',
      changed: false,
      why: `Proficiency Bonus at level ${level.value} (SRD 5.2.1 p. 23)`,
    },
    {
      label: 'Passive Perception',
      value: String(perception.value),
      sub: '10 + Perception',
      changed: perception.value !== sheet.value.passivePerception,
      why: `10 + Wisdom (Perception)${exhaustionOf(sheet.value) ? ', less Exhaustion' : ''}`,
    },
  ])

  // Typed damage and healing: the type meets resistances and immunities (SRD 5.2.1 p. 16).
  const amount = ref<number | null>(null)
  const dmgType = ref('')

  function typedHurt() {
    if (!amount.value) return
    hurt(amount.value, dmgType.value)
    amount.value = null
  }

  function typedHeal() {
    if (!amount.value || dead.value) return
    mend(amount.value)
    amount.value = null
  }

  // Damage from an effect with a saving throw: the sheet rolls the save against the DC (or the
  // table says how it went), then a success halves it, or Evasion takes none (SRD 5.2.1 p. 9).
  const saveAbility = ref<'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA'>('DEX')
  const saveDc = ref<number | null>(null)
  const saveHalf = ref(true)

  function fromSave(saved?: boolean) {
    if (!canEdit.value || !amount.value) return
    const r = saveDamage(sheet.value, level.value, {
      amount: amount.value,
      ability: saveAbility.value,
      half: saveHalf.value,
      ...(dmgType.value ? { type: dmgType.value } : {}),
      ...(saved !== undefined ? { saved } : saveDc.value ? { dc: saveDc.value } : { saved: false }),
    })
    const hit = { ...hitOf(r.taken, dmgType.value), crit: false }
    const t = r.taken > 0 ? takeDamage(sheet.value, hit) : null
    if (t) concDc.value = t.concentrationDc
    amount.value = null
    claim('vit:hp', () => say(`${r.line}${t ? ` ${t.line}` : ' No damage.'}`))
  }

  function revive() {
    if (canEdit.value) claim('vit:hp', () => say(resurrect(sheet.value)))
  }

  function stable5e() {
    if (canEdit.value) claim('vit:hp', () => say(stabilize(sheet.value)))
  }

  const shortOpen = ref(false)
  const longOpen = ref(false)
  const diceLeft = computed(() => hitDiceLeft(sheet.value, level.value))

  function confirmShort() {
    shortOpen.value = false
    if (canEdit.value) claim('vit:rest', () => say(shortRest(sheet.value, level.value)))
  }

  function confirmLong() {
    longOpen.value = false
    if (canEdit.value) claim('vit:rest', () => say(longRest(sheet.value, level.value)))
  }

  function toggleInspiration() {
    if (canEdit.value) sheet.value.heroicInspiration = !sheet.value.heroicInspiration
  }

  return {
    draft,
    canEdit,
    say,
    claim,
    resultIn,
    data,
    sheet,
    level,
    hero,
    ownDice,
    dead,
    dying,
    stable,
    hpTone,
    crit,
    guarding,
    guards,
    toggleGuard,
    heavyArmor,
    ham,
    hitOf,
    takes,
    concDc,
    hurt,
    mend,
    changeHp,
    adjustTemp,
    hpState,
    ac,
    typing,
    rollDeath,
    rollConcentration,
    hitDie,
    setSaves,
    speed,
    init,
    perception,
    tiles,
    amount,
    dmgType,
    typedHurt,
    typedHeal,
    saveAbility,
    saveDc,
    saveHalf,
    fromSave,
    revive,
    stable5e,
    shortOpen,
    longOpen,
    diceLeft,
    confirmShort,
    confirmLong,
    toggleInspiration,
  }
}
