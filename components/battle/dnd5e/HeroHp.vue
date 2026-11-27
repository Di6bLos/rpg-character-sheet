<script setup lang="ts">
// A 5e hero's HP in the battle board's hero column, the Nimble HeroHp's twin: the draggable
// bar with temp HP, an amount with − (damage) and + (healing), Crit and the reactions that cut
// the next damage (Uncanny Dodge, Deflect Attacks, Parry…, utils/dnd5eDefense.ts), temp HP, then at 0 HP the death saves (Death save, Stabilize) and after
// damage the Concentration save. Same rules and state as the sheet's Vitals
// (useDnd5eVitals, SRD 5.2.1 pp. 16–18); the last of those results shows beneath.
const {
  canEdit,
  sheet,
  dead,
  dying,
  stable,
  hpTone,
  crit,
  guarding,
  guards,
  toggleGuard,
  takes,
  concDc,
  changeHp,
  adjustTemp,
  hpState,
  typing,
  rollDeath,
  rollConcentration,
  setSaves,
  revive,
  stable5e,
  resultIn,
} = useDnd5eVitals()

const uid = useId()
const amount = ref<number | null>(null)

/** What − and + apply: the amount typed, whole (1 when empty). */
const step = computed(() => Math.max(1, Math.floor(Number(amount.value) || 1)))

/** − deals the amount as damage, + heals it; an empty field means 1. */
function apply(by: 1 | -1) {
  changeHp(by * step.value)
  amount.value = null
}

const saves = computed(() => sheet.value.deathSaves ?? { successes: 0, failures: 0 })
const showSaves = computed(
  () => dying.value || stable.value || saves.value.successes > 0 || saves.value.failures > 0,
)
const last = computed(() => resultIn('vit:hp'))
</script>

<template>
  <div class="hp">
    <div v-if="dead" class="notice notice--error hp__notice" role="alert">
      <strong>Your hero has died.</strong>
      <button type="button" class="btn btn--sm" :disabled="!canEdit" @click="revive">
        Resurrect
      </button>
    </div>
    <div v-else-if="dying" class="notice notice--error hp__notice" role="alert">
      <strong>Unconscious at 0 HP.</strong> Roll a death save at the start of each turn; any healing
      brings you back.
    </div>

    <div class="hp__head">
      <span class="sect">Hit points</span>
      <span class="hp__value" aria-live="polite">
        {{ sheet.hp }}<span> / {{ sheet.hpMax }}</span>
        <b v-if="sheet.tempHp" class="hp__temp">+{{ sheet.tempHp }} temp</b>
      </span>
    </div>
    <SheetHpBar
      :hp="sheet.hp"
      :max="sheet.hpMax"
      :temp="sheet.tempHp"
      :tone="hpTone"
      :disabled="!canEdit || dead"
      :takes="takes"
      @change="changeHp"
    />
    <div class="hp__ctl">
      <button
        type="button"
        class="step step--xs"
        :aria-label="`Take ${step} damage`"
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
        :aria-label="`Heal ${step}`"
        :disabled="!canEdit || dead"
        @click="apply(1)"
      >
        +
      </button>
      <button
        type="button"
        class="btn btn--ghost btn--sm hp__crit"
        :aria-pressed="crit"
        title="Your next damage is from a Critical Hit (two death save failures at 0 HP)"
        :disabled="!canEdit"
        @click="crit = !crit"
      >
        Crit
      </button>
    </div>
    <div v-if="guards.length" class="hp__react">
      <button
        v-for="g in guards"
        :key="g.guard.key"
        type="button"
        class="btn btn--ghost btn--sm hp__crit"
        :aria-pressed="guarding.includes(g.guard.key)"
        :title="g.why || g.guard.note"
        :disabled="!canEdit || (!!g.why && !guarding.includes(g.guard.key))"
        @click="toggleGuard(g.guard.key)"
      >
        {{ g.guard.name }}
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
        <span class="hp__num">{{ sheet.tempHp ?? 0 }}</span>
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

    <div v-if="showSaves" class="hp__saves">
      <div class="hp__row">
        <span class="sect">Death saves</span>
        <span class="hp__hint">{{ stable ? 'Stable' : dying ? 'Dying' : 'Not needed' }}</span>
      </div>
      <div class="hp__row">
        <span class="hp__hint">Successes</span>
        <span class="hp__pips" role="group" aria-label="Death save successes">
          <button
            v-for="n in 3"
            :key="n"
            type="button"
            class="save save--ok"
            :aria-label="`Success ${n}`"
            :aria-pressed="saves.successes >= n"
            :disabled="!canEdit"
            @click="setSaves('successes', n)"
          />
        </span>
      </div>
      <div class="hp__row">
        <span class="hp__hint">Failures</span>
        <span class="hp__pips" role="group" aria-label="Death save failures">
          <button
            v-for="n in 3"
            :key="n"
            type="button"
            class="save"
            :aria-label="`Failure ${n}`"
            :aria-pressed="saves.failures >= n"
            :disabled="!canEdit"
            @click="setSaves('failures', n)"
          />
        </span>
      </div>
      <div v-if="dying" class="hp__btns">
        <button type="button" class="btn btn--sm" :disabled="!canEdit" @click="rollDeath()">
          Death save
        </button>
        <button
          type="button"
          class="btn btn--ghost btn--sm"
          :disabled="!canEdit"
          title="An ally's DC 10 Wisdom (Medicine) check or Spare the Dying"
          @click="stable5e"
        >
          Stabilize
        </button>
      </div>
      <NimbleDiceEntry
        v-if="typing === 'death'"
        label="d20 you rolled for the death save"
        action="Death save"
        :disabled="!canEdit"
        @submit="rollDeath"
      />
    </div>

    <div v-if="concDc !== null && sheet.concentration" class="notice hp__notice" role="status">
      <span
        >Concentration on <strong>{{ sheet.concentration.name }}</strong
        >: CON save DC {{ concDc }}.</span
      >
      <span class="hp__btns">
        <button type="button" class="btn btn--sm" :disabled="!canEdit" @click="rollConcentration()">
          Roll the save
        </button>
        <button type="button" class="btn btn--quiet btn--sm" @click="concDc = null">Skip</button>
      </span>
    </div>
    <NimbleDiceEntry
      v-if="typing === 'conc'"
      label="d20 you rolled for Concentration"
      action="Save"
      :disabled="!canEdit"
      @submit="rollConcentration"
    />
    <p v-if="last" class="hp__last" role="status">{{ last }}</p>
  </div>
</template>

<style scoped lang="scss">
@use '../../../assets/styles/battle-hp';

.hp__react,
.hp__btns {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.hp__saves {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.hp__pips {
  display: inline-flex;
  gap: 6px;
}

.save {
  width: 16px;
  height: 16px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid var(--line-strong);
  background: transparent;

  &[aria-pressed='true'] {
    background: var(--danger);
    border-color: var(--danger);
  }

  &--ok[aria-pressed='true'] {
    background: var(--secondary);
    border-color: var(--secondary);
  }
}

.hp__last {
  margin: 0;
  font-size: 12px;
  color: var(--page-soft);
}

@media (pointer: coarse) {
  .hp__pips {
    gap: 8px;
  }

  .save {
    position: relative;
    width: 44px;
    height: 44px;
    border: 0;
    background: transparent;

    &::before {
      content: '';
      position: absolute;
      inset: 13px;
      border-radius: 50%;
      border: 1px solid var(--line-strong);
    }

    &[aria-pressed='true'] {
      background: transparent;

      &::before {
        background: var(--danger);
        border-color: var(--danger);
      }
    }

    &--ok[aria-pressed='true']::before {
      background: var(--secondary);
      border-color: var(--secondary);
    }
  }

  .hp__react .btn,
  .hp__btns .btn {
    min-height: 44px;
  }
}
</style>
