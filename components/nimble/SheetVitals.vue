<script setup lang="ts">
// Vitals panel of the Nimble sheet: HP and temp HP, Wounds, Hit Dice with the Field
// Rest (catch breath, or make camp for each die's maximum), the headline numbers and Safe Rest.
import type { NimbleSheet } from '~/types/sheets'
import { sign } from '~/utils/dice'
import { keyStatValue } from '~/utils/nimbleBuild'

const { draft, canEdit } = useSheet<NimbleSheet>()
const sheet = computed(() => draft.value.sheet)
const {
  woundsMax,
  dead,
  dying,
  dyingRules,
  hpState,
  hpTone,
  diceLeft,
  speed,
  armor,
  crit,
  revive,
  damage,
  changeHp,
  takes,
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
} = useNimbleVitals()

const key = computed(() => keyStatValue(sheet.value))

const tiles = computed(() => [
  {
    label: 'Speed',
    value: speed.value.value,
    sub: speed.value.note || 'spaces',
    changed: speed.value.changed,
  },
  { label: 'Initiative', value: sign(sheet.value.initMod), sub: 'added to the roll' },
  {
    label: 'Save DC',
    value: key.value ? String(10 + key.value.value) : '—',
    sub: '10+KEY',
  },
])

const restOpen = ref(false)

function confirmRest() {
  takeSafeRest()
  restOpen.value = false
}
</script>

<template>
  <section class="panel stack" aria-labelledby="vit-h">
    <UiFold name="Vitals" />
    <h2 id="vit-h">Vitals</h2>

    <div v-if="dead" class="notice notice--error dead-notice" role="alert">
      <strong>{{ woundsMax }} Wounds: your hero has died.</strong>
      <button type="button" class="btn btn--sm" :disabled="!canEdit" @click="revive">
        Resurrect
      </button>
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
          <div class="row hp-steps" style="gap: 8px">
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
        <SheetHpBar
          :hp="sheet.hp"
          :max="sheet.hpMax"
          :temp="sheet.tempHp"
          :tone="hpTone"
          :disabled="!canEdit"
          :takes="takes"
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
      <div class="tile armor" :title="armor.title">
        <span class="armor__badge">
          <svg class="armor__shield" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2.5 4 5.5v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10v-6Z" />
          </svg>
          <span class="armor__value" :class="{ 'is-changed': armor.changed }">{{
            armor.value
          }}</span>
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
        <NimbleDiceEntry
          v-if="ownRestRolls"
          :label="`Hit Dice rolled, e.g. ${Math.ceil(sheet.hitDie / 2)}, ${sheet.hitDie}`"
          action="Catch Breath"
          :title="fieldRestTitle"
          :disabled="!canFieldRest"
          @submit="rest"
        />
        <div v-else class="row" style="gap: 6px">
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
            @click="rest()"
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
@use '../../assets/styles/sheet-vitals';
</style>
