<script setup lang="ts">
// Vitals panel of the Nimble sheet: HP and temp HP, Wounds, Hit Dice with the Field
// Rest (catch breath, or make camp for each die's maximum), the headline numbers and Safe Rest.
import type { NimbleSheet } from '~/types/sheets'
import { sign } from '~/utils/dice'
import { keyStatValue } from '~/utils/nimbleBuild'
import { conditionMods } from '~/utils/nimbleConditions'
import {
  dyingAttackSave,
  fieldRest,
  fieldRestDice,
  heal,
  hitDiceLeft,
  isBloodied,
  isDead,
  safeRest,
  takeDamage,
  turnActions,
  woundCharges,
} from '~/utils/nimblePlay'

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

const diceLeft = computed(() => hitDiceLeft(sheet.value))
const key = computed(() => keyStatValue(sheet.value))

const cond = computed(() => conditionMods(sheet.value))
const tiles = computed(() => [
  {
    label: 'Speed',
    value: cond.value.speed ?? sheet.value.speed,
    sub: cond.value.speedNote || 'spaces',
    changed: cond.value.speed !== null,
  },
  { label: 'Initiative', value: sign(sheet.value.initMod), sub: 'added to the roll' },
  {
    label: 'Save DC',
    value: key.value ? String(10 + key.value.value) : '—',
    sub: '10+KEY',
  },
])

const restOpen = ref(false)

const crit = ref(false)

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
const fieldRestTitle = computed(() => {
  if (diceLeft.value === 0) return 'No Hit Dice left: they come back on a Safe Rest'
  if (fullHp.value) return 'Already at full HP'
  return camp.value
    ? '8 hours with food and sleep: each Hit Die gives its maximum plus STR'
    : '10 minutes: roll each Hit Die and add STR'
})

watch(camp, () => (diceChosen.value = null))

function adjustRestDice(delta: number) {
  diceChosen.value = Math.min(diceLeft.value, Math.max(1, restDice.value + delta))
}

function rest() {
  if (!canFieldRest.value) return
  const message = fieldRest(sheet.value, { dice: restDice.value, camp: camp.value })
  if (message) say(message)
  diceChosen.value = null
}

function confirmRest() {
  if (!canEdit.value) return
  say(safeRest(sheet.value, draft.value.level))
  restOpen.value = false
}
</script>

<template>
  <section class="panel stack" aria-labelledby="vit-h">
    <UiFold name="Vitals" />
    <h2 id="vit-h">Vitals</h2>

    <div v-if="dead" class="notice notice--error" role="alert">
      <strong>{{ woundsMax }} Wounds: your hero has died.</strong>
    </div>
    <div v-else-if="dying" class="notice notice--error" role="alert">
      <strong>Dying.</strong> {{ dyingRules }} Damage: 2 Wounds (crit 3).
    </div>

    <div class="vit-top">
      <div class="tile vit-block">
        <div class="vit-row">
          <div class="row" style="gap: 10px">
            <div class="caps">Hit points</div>
            <label class="crit" title="Your next damage is from a critical hit">
              <input v-model="crit" type="checkbox" :disabled="!canEdit" />
              Crit
            </label>
          </div>
          <div class="row" style="gap: 8px">
            <button
              type="button"
              class="step"
              aria-label="Take 1 damage"
              :disabled="!canEdit"
              @click="damage(1)"
            >
              −
            </button>
            <div class="hp-value" aria-live="polite">
              {{ sheet.hp }}<span> / {{ sheet.hpMax }}</span>
            </div>
            <button
              type="button"
              class="step"
              aria-label="Heal 1"
              :disabled="!canEdit"
              @click="healOne"
            >
              +
            </button>
          </div>
        </div>
        <NimbleHpBar
          :hp="sheet.hp"
          :max="sheet.hpMax"
          :temp="sheet.tempHp"
          :tone="sheet.hp === 0 ? 'danger' : bloodied ? 'accent' : ''"
          :disabled="!canEdit"
          @change="changeHp"
        />
        <div class="vit-row">
          <span class="hint">{{ hpState }}</span>
          <div class="row" style="gap: 6px">
            <span class="temp-label">Temp HP</span>
            <button
              type="button"
              class="step step--xs"
              aria-label="Lower temp HP"
              :disabled="!canEdit"
              @click="adjustTemp(-1)"
            >
              −
            </button>
            <span class="temp-value" aria-live="polite">{{ sheet.tempHp }}</span>
            <button
              type="button"
              class="step step--xs"
              aria-label="Raise temp HP"
              :disabled="!canEdit"
              @click="adjustTemp(1)"
            >
              +
            </button>
          </div>
        </div>
      </div>
      <div class="tile armor" :title="`Defend reduces a hit by your Armor (${sheet.ac})`">
        <span class="armor__badge">
          <svg class="armor__shield" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2.5 4 5.5v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10v-6Z" />
          </svg>
          <span class="armor__value">{{ sheet.ac }}</span>
        </span>
        <span class="armor__label">Armor</span>
      </div>
    </div>

    <div class="tile vit-pair">
      <div class="vit-col vit-col--wounds">
        <div class="vit-head">
          <span class="caps">Wounds</span>
          <span class="hint">{{ sheet.wounds }} / {{ woundsMax }}</span>
        </div>
        <div class="row" style="gap: 6px">
          <button
            v-for="n in woundsMax"
            :key="n"
            type="button"
            class="wound"
            :aria-label="`Wound ${n}`"
            :aria-pressed="sheet.wounds >= n"
            :disabled="!canEdit"
            @click="setWounds(n)"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.4"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </div>
      <div class="vit-col">
        <div class="vit-head">
          <span class="caps">Hit Dice</span>
          <span class="hint">{{ diceLeft }} / {{ sheet.hitDice }} d{{ sheet.hitDie }}</span>
        </div>
        <div class="row" style="gap: 5px" aria-hidden="true">
          <i v-for="n in sheet.hitDice" :key="n" class="hd" :class="{ on: n <= diceLeft }" />
        </div>
        <UiSwitch v-model="camp" label="Made camp (8h, food & sleep)" :disabled="!canEdit" />
        <div class="row" style="gap: 6px">
          <div class="row rest-count" style="gap: 4px">
            <button
              type="button"
              class="step step--xs"
              aria-label="Spend one fewer Hit Die"
              :disabled="!canFieldRest || restDice <= 1"
              @click="adjustRestDice(-1)"
            >
              −
            </button>
            <span class="temp-value" aria-live="polite">{{ restDice }}</span>
            <button
              type="button"
              class="step step--xs"
              aria-label="Spend one more Hit Die"
              :disabled="!canFieldRest || restDice >= diceLeft"
              @click="adjustRestDice(1)"
            >
              +
            </button>
          </div>
          <button
            type="button"
            class="btn btn--ghost btn--sm rest-btn"
            :disabled="!canFieldRest"
            :title="fieldRestTitle"
            @click="rest"
          >
            {{ camp ? 'Make Camp' : 'Catch Breath' }}
          </button>
        </div>
      </div>
    </div>

    <div class="vitals">
      <div v-for="v in tiles" :key="v.label" class="tile">
        <div class="tile__label">{{ v.label }}</div>
        <div class="tile__value" :class="{ 'is-changed': 'changed' in v && v.changed }">
          {{ v.value }}
        </div>
        <div class="hint" style="font-size: 11px">{{ v.sub }}</div>
      </div>
    </div>

    <NimbleSheetConditions />

    <button type="button" class="btn btn--ghost" :disabled="!canEdit" @click="restOpen = true">
      Safe Rest
    </button>

    <UiDialog v-model="restOpen" title="Take a Safe Rest?" width="460px">
      <p>
        HP, Hit Dice, mana and limited uses are restored, 1 Wound is healed, and temp HP and class
        dice are cleared.
      </p>
      <template #actions>
        <button type="button" class="btn btn--ghost" @click="restOpen = false">Not yet</button>
        <button type="button" class="btn" @click="confirmRest">Safe Rest</button>
      </template>
    </UiDialog>
  </section>
</template>

<style scoped lang="scss">
.is-changed {
  color: var(--warn-text);
}

.crit {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 700;
  color: var(--page-muted);
  cursor: pointer;

  input {
    accent-color: var(--danger);
  }
}

.vit-top {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: stretch;
}

.armor {
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 96px;
  padding: 10px 14px;
  border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
}

.armor__badge {
  position: relative;
  display: grid;
  place-items: center;
  width: 72px;
  height: 72px;
}

.armor__shield {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  fill: color-mix(in srgb, var(--accent) 12%, transparent);
  stroke: color-mix(in srgb, var(--accent) 55%, transparent);
  stroke-width: 1.2;
}

.armor__value {
  position: relative;
  margin-top: -4px;
  font-family: var(--font-heading);
  font-size: 32px;
  font-weight: 700;
  font-variant-numeric: lining-nums tabular-nums;
  line-height: 1;
  color: var(--accent-text);
}

.armor__label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--page-soft);
}

.vit-block {
  gap: 10px;
  padding: 14px;
}

.vit-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.hint {
  font-size: 12px;
  color: var(--page-muted);
}

.hp-value {
  font-family: var(--font-heading);
  font-size: 26px;
  font-weight: 700;
  min-width: 90px;
  text-align: center;

  span {
    font-size: 16px;
    color: var(--page-muted);
  }
}

.meter--danger > span {
  background: var(--danger);
}

.temp-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--page-soft);
}

.temp-value {
  min-width: 26px;
  text-align: center;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.vit-pair {
  flex-direction: row;
  flex-wrap: wrap;
  gap: 14px;
  padding: 14px;
}

.vit-col {
  flex: 1 1 220px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

// Room for six Wound pips on one line.
.vit-col--wounds {
  flex-basis: 250px;
}

.vit-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}

.wound {
  width: 36px;
  height: 36px;
  border-radius: min(var(--radius-control), 8px);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--panel-bg);
  color: var(--line);
  border: 1px solid var(--line);

  &[aria-pressed='true'] {
    background: var(--warn-bg);
    color: var(--warn-text);
    border: 1.5px solid var(--accent);
  }
}

.hd {
  width: 20px;
  height: 20px;
  border-radius: min(var(--radius-control), 5px);
  box-shadow: inset 0 0 0 1.5px var(--line-strong);

  &.on {
    background: var(--accent);
    box-shadow: none;
  }
}

.rest-btn {
  flex: 1 1 100px;
}

.rest-count {
  flex: none;
}

.vitals {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 10px;
}

@media (pointer: coarse) {
  .wound {
    width: 44px;
    height: 44px;
  }
}
</style>
