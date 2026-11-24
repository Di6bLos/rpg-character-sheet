<script setup lang="ts">
// The hero column's HP: the draggable bar with temp HP, an amount with − (damage) and
// + (healing), the Crit toggle for the next damage, temp HP and Wounds. Same rules as
// the sheet's Vitals (useNimbleVitals).
import type { NimbleSheet } from '~/types/sheets'

const { draft, canEdit } = useSheet<NimbleSheet>()
const sheet = computed(() => draft.value.sheet)
const {
  woundsMax,
  dead,
  dying,
  dyingRules,
  hpState,
  hpTone,
  crit,
  revive,
  changeHp,
  warded,
  adjustTemp,
  setWounds,
} = useNimbleVitals()

const uid = useId()
const amount = ref<number | null>(null)

/** − deals the amount as damage, + heals it; an empty field means 1. */
function apply(sign: 1 | -1) {
  const n = Math.max(1, Math.floor(Number(amount.value) || 1))
  changeHp(sign * n)
  amount.value = null
}
</script>

<template>
  <div class="hp">
    <div v-if="dead" class="notice notice--error hp__notice" role="alert">
      <strong>{{ woundsMax }} Wounds: your hero has died.</strong>
      <button type="button" class="btn btn--sm" :disabled="!canEdit" @click="revive">
        Resurrect
      </button>
    </div>
    <div v-else-if="dying" class="notice notice--error hp__notice" role="alert">
      <strong>Dying.</strong> {{ dyingRules }} Damage: 2 Wounds (crit 3).
    </div>

    <div class="hp__head">
      <span class="sect">Hit points</span>
      <span class="hp__value" aria-live="polite">
        {{ sheet.hp }}<span> / {{ sheet.hpMax }}</span>
        <b v-if="sheet.tempHp" class="hp__temp">+{{ sheet.tempHp }} temp</b>
      </span>
    </div>
    <NimbleHpBar
      :hp="sheet.hp"
      :max="sheet.hpMax"
      :temp="sheet.tempHp"
      :tone="hpTone"
      :disabled="!canEdit"
      :warded="warded"
      @change="changeHp"
    />
    <div class="hp__ctl">
      <button
        type="button"
        class="step step--xs"
        :aria-label="`Take ${amount || 1} damage`"
        :disabled="!canEdit"
        @click="apply(-1)"
      >
        −
      </button>
      <label class="sr-only" :for="`${uid}-amt`">HP amount</label>
      <input
        :id="`${uid}-amt`"
        v-model.number="amount"
        class="input hp__amt"
        type="number"
        min="1"
        inputmode="numeric"
        placeholder="amount"
        :disabled="!canEdit"
      />
      <button
        type="button"
        class="step step--xs"
        :aria-label="`Heal ${amount || 1}`"
        :disabled="!canEdit"
        @click="apply(1)"
      >
        +
      </button>
      <button
        type="button"
        class="btn btn--ghost btn--sm hp__crit"
        :aria-pressed="crit"
        title="Your next damage is from a critical hit"
        :disabled="!canEdit"
        @click="crit = !crit"
      >
        Crit
      </button>
    </div>
    <div class="hp__row">
      <span class="hp__hint">{{ hpState }}</span>
      <span class="hp__tempctl">
        <span class="hp__hint">Temp</span>
        <button
          type="button"
          class="step hp__mini"
          aria-label="Lower temp HP"
          :disabled="!canEdit || !sheet.tempHp"
          @click="adjustTemp(-1)"
        >
          −
        </button>
        <span class="hp__num">{{ sheet.tempHp }}</span>
        <button
          type="button"
          class="step hp__mini"
          aria-label="Raise temp HP"
          :disabled="!canEdit"
          @click="adjustTemp(1)"
        >
          +
        </button>
      </span>
    </div>
    <div class="hp__row">
      <span class="sect">Wounds</span>
      <span class="hp__wounds">
        <button
          v-for="n in woundsMax"
          :key="n"
          type="button"
          class="wound"
          :aria-label="`Wound ${n}`"
          :aria-pressed="sheet.wounds >= n"
          :disabled="!canEdit"
          @click="setWounds(n)"
        />
        <span class="hp__hint">{{ sheet.wounds }} / {{ woundsMax }}</span>
      </span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.hp {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.hp__notice {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 10px;
  justify-content: space-between;
  padding: 8px 10px;
  font-size: 12px;
}

.hp__head,
.hp__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.hp__value {
  font-family: var(--font-heading);
  font-size: 18px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;

  span {
    font-size: 13px;
    color: var(--page-muted);
  }
}

.hp__temp {
  margin-left: 4px;
  font-family: var(--font-body);
  font-size: 12px;
  color: var(--secondary);
}

.hp__ctl {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  gap: 6px;
  align-items: center;
}

.hp__amt {
  min-height: 32px;
  padding: 4px 8px;
  text-align: center;
}

.hp__crit[aria-pressed='true'] {
  background: var(--danger-bg);
  color: var(--danger-text);
  border-color: var(--danger);
}

.hp__hint {
  font-size: 11px;
  color: var(--page-muted);
}

.hp__tempctl,
.hp__wounds {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.hp__mini {
  width: 24px;
  height: 24px;
  font-size: 14px;

  // Fading the whole button lost the glyph on Cursed parchment; mute the glyph instead.
  &:disabled {
    opacity: 1;
    color: var(--page-muted);
  }
}

.hp__num {
  min-width: 18px;
  text-align: center;
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.wound {
  width: 14px;
  height: 14px;
  padding: 0;
  margin: 0 2px;
  transform: rotate(45deg);
  border: 1px solid var(--line-strong);
  border-radius: 2px;
  background: transparent;

  &[aria-pressed='true'] {
    background: var(--danger);
    border-color: var(--danger);
  }
}
</style>
