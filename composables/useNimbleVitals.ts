import type { NimbleSheet } from '~/types/sheets'
import { sheetResource } from '~/utils/nimbleBuild'
import { conditionMods } from '~/utils/nimbleConditions'
import {
  dyingAttackSave,
  encounterMana,
  fieldRest,
  fieldRestDice,
  heal,
  hitDiceLeft,
  isBloodied,
  isDead,
  isHollowOne,
  resurrect,
  safeRest,
  takeDamage,
  turnActions,
  woundCharges,
} from '~/utils/nimblePlay'

/**
 * HP, temp HP, Wounds, Hit Dice and rests for the Nimble hero in the current sheet
 * editor: shared by the sheet's Vitals panel and the battle board's hero column.
 */
export function useNimbleVitals() {
  const { draft, canEdit, say } = useSheet<NimbleSheet>()
  const sheet = computed(() => draft.value.sheet)

  const woundsMax = computed(() => Math.max(1, sheet.value.woundsMax || 6))
  const dead = computed(() => isDead(sheet.value))
  const dying = computed(() => sheet.value.dying && sheet.value.hp === 0 && !dead.value)
  const bloodied = computed(() => isBloodied(sheet.value))
  // Enduring Rage and Windborne change what Dying allows.
  const dyingRules = computed(() => {
    const n = turnActions(sheet.value)
    const save = dyingAttackSave(sheet.value) ? 'Attacking or casting' : 'Casting'
    return `${n} action${n === 1 ? '' : 's'} per turn. ${save}: DC 10 STR save or 1 Wound.`
  })
  const hpState = computed(() => {
    if (sheet.value.hp === 0) return 'At 0 HP'
    return bloodied.value
      ? 'Bloodied: at or below half HP'
      : `Bloodied at ${Math.floor(sheet.value.hpMax / 2)} HP`
  })
  const hpTone = computed(() =>
    sheet.value.hp === 0
      ? ('danger' as const)
      : bloodied.value
        ? ('accent' as const)
        : ('' as const),
  )

  const diceLeft = computed(() => hitDiceLeft(sheet.value))

  /** Speed after conditions (Slowed halves it, Grappled zeroes it). */
  const speed = computed(() => {
    const cond = conditionMods(sheet.value)
    return {
      value: cond.speed ?? sheet.value.speed,
      note: cond.speedNote,
      changed: cond.speed !== null,
    }
  })

  /** The next damage is from a critical hit. */
  const crit = ref(false)

  function revive() {
    if (canEdit.value) say(resurrect(sheet.value))
  }

  function damage(amount = 1) {
    if (!canEdit.value) return
    const message = takeDamage(sheet.value, amount, draft.value.level, crit.value)
    const was = crit.value ? ' (crit)' : ''
    crit.value = false
    say(
      `Took ${amount} damage${was}: ${sheet.value.hp}/${sheet.value.hpMax} HP.${message ? ` ${message}` : ''}`,
    )
  }

  function changeHp(delta: number) {
    if (!canEdit.value) return
    if (delta < 0) return damage(-delta)
    heal(sheet.value, delta)
    say(`Healed ${delta}: ${sheet.value.hp}/${sheet.value.hpMax} HP.`)
  }

  function healOne() {
    if (canEdit.value) heal(sheet.value, 1)
  }

  function adjustTemp(delta: number) {
    if (!canEdit.value) return
    sheet.value.tempHp = Math.max(0, sheet.value.tempHp + delta)
  }

  function setWounds(n: number) {
    if (!canEdit.value) return
    const before = sheet.value.wounds
    sheet.value.wounds = before === n ? n - 1 : n
    const charges = woundCharges(sheet.value, sheet.value.wounds - before).trim()
    if (charges) say(charges)
  }

  // Field Rest: the dice count follows the HP missing until the player sets it.
  const camp = ref(false)
  const diceChosen = ref<number | null>(null)
  const fullHp = computed(() => sheet.value.hp >= sheet.value.hpMax)
  const restDice = computed(() => {
    const suggested = fieldRestDice(sheet.value, camp.value)
    const chosen = diceChosen.value ?? suggested
    return Math.min(diceLeft.value, Math.max(fullHp.value ? 0 : 1, chosen))
  })
  const canFieldRest = computed(
    () => canEdit.value && !fullHp.value && diceLeft.value > 0 && restDice.value > 0,
  )
  /** Catch Breath with Manual dice: the player rolls the Hit Dice and enters each one. */
  const ownRestRolls = computed(() => sheet.value.ownDice && !camp.value)
  const fieldRestTitle = computed(() => {
    if (diceLeft.value === 0) return 'No Hit Dice left: they come back on a Safe Rest'
    if (fullHp.value) return 'Already at full HP'
    if (camp.value) return '8 hours with food and sleep: each Hit Die gives its maximum plus STR'
    return ownRestRolls.value
      ? `10 minutes: roll your Hit Dice (d${sheet.value.hitDie}, up to ${diceLeft.value}) and enter each one; STR is added to each`
      : '10 minutes: roll each Hit Die and add STR'
  })

  watch(camp, () => (diceChosen.value = null))

  function adjustRestDice(delta: number) {
    diceChosen.value = Math.min(diceLeft.value, Math.max(1, restDice.value + delta))
  }

  /** `rolls`: the player's own Hit Die rolls, required for Catch Breath with Manual dice. */
  function rest(rolls?: number[]) {
    if (!canFieldRest.value) return
    if (ownRestRolls.value && !rolls?.length) return
    const message = fieldRest(sheet.value, {
      dice: restDice.value,
      camp: camp.value,
      rolls: ownRestRolls.value ? rolls : undefined,
    })
    if (message) say(message)
    diceChosen.value = null
  }

  function takeSafeRest() {
    if (canEdit.value) say(safeRest(sheet.value, draft.value.level))
  }

  return {
    woundsMax,
    dead,
    dying,
    bloodied,
    dyingRules,
    hpState,
    hpTone,
    diceLeft,
    speed,
    crit,
    revive,
    damage,
    changeHp,
    healOne,
    adjustTemp,
    setWounds,
    camp,
    restDice,
    canFieldRest,
    ownRestRolls,
    fieldRestTitle,
    adjustRestDice,
    rest,
    takeSafeRest,
  }
}

/**
 * Mana or the class resource of the Nimble hero in the current sheet editor, as the battle
 * board shows it: `hasMana`, the resource to show instead (none for info-only ones and a
 * Hollow One's uses), its full reading for the hero column (`resourceValue`) and a short
 * one for small tiles (`resourceShort`, the phone's hero strip).
 */
export function useNimbleResource() {
  const { draft } = useSheet<NimbleSheet>()
  const sheet = computed(() => draft.value.sheet)

  const hasMana = computed(() => sheet.value.mana.max > 0 || encounterMana(sheet.value) > 0)

  const resource = computed(() => {
    const r = sheetResource(sheet.value, draft.value.level)
    return !r || r.kind === 'info' || (r.kind === 'uses' && isHollowOne(sheet.value)) ? null : r
  })

  const resourceValue = computed(() => {
    const r = resource.value
    const res = sheet.value.resource
    if (!r) return ''
    const total = res.rolls.reduce((a, b) => a + b, 0)
    if (r.kind === 'uses') return `${r.max - res.count} / ${r.max} left`
    if (r.kind === 'judgment') return res.rolls.length ? `+${total} held` : 'None held'
    if (r.kind === 'crit') return res.count ? 'Used this turn' : 'Ready'
    if (r.kind === 'rage') return res.active ? `Raging · +${total}` : 'Not raging'
    return r.max ? `${res.count} / ${r.max}` : String(res.count)
  })

  const resourceShort = computed(() => {
    const r = resource.value
    const res = sheet.value.resource
    if (!r) return ''
    const total = res.rolls.reduce((a, b) => a + b, 0)
    if (r.kind === 'uses') return String(r.max - res.count)
    if (r.kind === 'judgment') return `+${total}`
    if (r.kind === 'crit') return res.count ? '–' : '✓'
    if (r.kind === 'rage') return res.active ? `+${total}` : '–'
    return String(res.count)
  })

  return { hasMana, resource, resourceValue, resourceShort }
}
