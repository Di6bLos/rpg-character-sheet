<script setup lang="ts">
import { classBySlug } from '~/data/nimble/classes'
import type { NimbleSheet } from '~/types/sheets'
import { abilityBaseName, keyStatValue, sheetResource } from '~/utils/nimbleBuild'
import { endEffects } from '~/utils/nimbleEffects'
import { encounterMana, isHollowOne } from '~/utils/nimblePlay'

const props = defineProps<{ part?: 'mana' | 'uses' | 'concentration' }>()

const { draft, canEdit } = useSheet<NimbleSheet>()
const sheet = computed(() => draft.value.sheet)
const cls = computed(() => classBySlug(sheet.value.classSlug))
const keyValue = computed(() => keyStatValue(sheet.value))

const concId = useId()
const combatMana = computed(() => encounterMana(sheet.value))
const hasMana = computed(() => sheet.value.mana.max > 0 || combatMana.value > 0)
const manaFormula = computed(() => {
  if (cls.value?.mana && sheet.value.mana.max > 0)
    return `${cls.value.mana.label} = ${sheet.value.mana.max}`
  return combatMana.value > 0 ? `${combatMana.value} on Initiative` : ''
})
const surge = computed(() =>
  sheet.value.abilities.find((a) => abilityBaseName(a.name) === 'Elemental Surge'),
)

const uses = computed(() => {
  const r = sheetResource(sheet.value, draft.value.level)
  return r?.kind === 'uses' && !isHollowOne(sheet.value) ? r : null
})
const usesLeft = computed(() => (uses.value?.max ?? 0) - sheet.value.resource.count)

const showMana = computed(() => hasMana.value && (!props.part || props.part === 'mana'))
const showUses = computed(() => !!uses.value && (!props.part || props.part === 'uses'))
const showConcentration = computed(() => !props.part || props.part === 'concentration')

function endConcentration() {
  if (!canEdit.value) return
  sheet.value.concentration = ''
  endEffects(sheet.value, 'concentration')
}

function setMana(value: number) {
  if (!canEdit.value) return
  const m = sheet.value.mana
  m.current = Math.max(0, Math.min(m.max, value))
}

function adjustTempMana(delta: number) {
  if (!canEdit.value) return
  sheet.value.mana.temp = Math.max(0, sheet.value.mana.temp + delta)
}

function adjustUses(delta: number) {
  if (!canEdit.value || !uses.value) return
  const res = sheet.value.resource
  const max = uses.value.refill ? uses.value.max : 12
  res.count = Math.max(0, Math.min(max, res.count + delta))
}
</script>

<template>
  <div v-if="showMana" class="stack pool" style="gap: 12px">
    <div v-if="!part" class="pool__title">
      <span class="caps">Mana</span>
      <span v-if="manaFormula" class="badge badge--outline">{{ manaFormula }}</span>
    </div>
    <div class="row" style="gap: 16px">
      <div class="mana__value" aria-live="polite">
        <strong>{{ sheet.mana.current }}</strong>
        <span>/ {{ sheet.mana.max }}</span>
      </div>
      <span v-if="sheet.mana.temp > 0" class="mana__temp">+{{ sheet.mana.temp }} temp</span>
      <div class="row" style="gap: 8px; margin-left: auto">
        <button
          type="button"
          class="step"
          aria-label="Spend 1 mana"
          :disabled="!canEdit"
          @click="setMana(sheet.mana.current - 1)"
        >
          −
        </button>
        <button
          type="button"
          class="step"
          aria-label="Regain 1 mana"
          :disabled="!canEdit"
          @click="setMana(sheet.mana.current + 1)"
        >
          +
        </button>
      </div>
    </div>
    <div class="mana__pips" role="group" aria-label="Mana pool">
      <button
        v-for="n in sheet.mana.max"
        :key="n"
        type="button"
        :aria-label="`Set mana to ${n}`"
        :disabled="!canEdit"
        @click="setMana(n === sheet.mana.current ? n - 1 : n)"
      >
        <i :class="{ on: n <= sheet.mana.current }" />
      </button>
      <span v-for="n in sheet.mana.temp" :key="`t${n}`" class="mana__pip-temp" aria-hidden="true">
        <i />
      </span>
    </div>
    <div class="facts">
      <span
        >Highest tier <strong>{{ sheet.spells.tier || 'cantrips' }}</strong></span
      >
      <span v-if="keyValue"
        >Save DC <strong>{{ 10 + keyValue.value }}</strong></span
      >
      <span>Refills on a Safe Rest</span>
    </div>
    <div class="row temp-row">
      <span class="small" style="font-size: 13px">
        <template v-if="surge"
          ><strong>Elemental Surge</strong>: rolled on New encounter, lost when combat
          ends</template
        >
        <template v-else-if="combatMana > 0"
          ><strong>Encounter mana</strong>: gained on New encounter, lost when combat ends</template
        >
        <template v-else>Temporary mana (spent first, lost when combat ends)</template>
      </span>
      <div class="row" style="gap: 6px; margin-left: auto">
        <button
          type="button"
          class="step step--xs"
          aria-label="Lower temporary mana"
          :disabled="!canEdit"
          @click="adjustTempMana(-1)"
        >
          −
        </button>
        <button
          type="button"
          class="step step--xs"
          aria-label="Raise temporary mana"
          :disabled="!canEdit"
          @click="adjustTempMana(1)"
        >
          +
        </button>
      </div>
    </div>
  </div>

  <div v-if="showUses && uses" class="stack pool" style="gap: 10px">
    <div v-if="!part" class="pool__title">
      <span class="caps">{{ uses.name }}</span>
      <span class="badge badge--outline">{{ uses.max }} uses · {{ uses.stat }}</span>
    </div>
    <div class="row" style="gap: 10px">
      <span
        v-for="n in uses.max"
        :key="n"
        class="use-pip"
        :class="{ on: n <= usesLeft }"
        aria-hidden="true"
        >{{ n }}</span
      >
      <span class="small" style="font-size: 14px" aria-live="polite">
        {{
          usesLeft > 0
            ? `${usesLeft} of ${uses.max} left this Safe Rest`
            : 'No uses left before your patron notices'
        }}
      </span>
      <div class="row" style="gap: 8px; margin-left: auto">
        <button
          type="button"
          class="step step--sm"
          aria-label="Regain a use"
          :disabled="!canEdit || sheet.resource.count === 0"
          @click="adjustUses(-1)"
        >
          −
        </button>
        <button
          type="button"
          class="step step--sm"
          aria-label="Spend a use"
          :disabled="!canEdit"
          @click="adjustUses(1)"
        >
          +
        </button>
      </div>
    </div>
    <div v-if="usesLeft < 0" class="notice notice--error" role="alert">
      Over the limit {{ -usesLeft }} time{{ usesLeft === -1 ? '' : 's' }}: each one costs you
      {{ Math.floor(sheet.hpMax / 2) }} HP.
    </div>
  </div>

  <div v-if="showConcentration" class="stack pool conc" style="gap: 8px">
    <div v-if="!part" class="pool__title">
      <span class="caps">Concentration</span>
      <UiHelp
        label="About concentration"
        text="If you are hit by a crit, make a DC 10 STR save or lose concentration. Dropping to 0 HP ends it."
      />
    </div>
    <div class="row" style="gap: 8px; flex-wrap: nowrap">
      <label :for="concId" class="sr-only">Concentrating on</label>
      <input
        :id="concId"
        v-model="sheet.concentration"
        class="input"
        :class="{ 'is-on': sheet.concentration.trim() }"
        placeholder="Not concentrating"
        maxlength="80"
        :readonly="!canEdit"
      />
      <button
        type="button"
        class="btn btn--ghost"
        :disabled="!canEdit || !sheet.concentration"
        @click="endConcentration"
      >
        End
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.pool__title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.mana__value {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-family: var(--font-heading);

  strong {
    font-size: 52px;
    font-weight: 700;
    line-height: 0.9;
    color: color-mix(in srgb, var(--secondary) 70%, var(--page-text));
  }

  span {
    font-size: 22px;
    color: var(--page-muted);
  }
}

.mana__temp {
  font-size: 14px;
  font-weight: 700;
  padding: 6px 12px;
  border-radius: 999px;
  background: var(--warn-bg);
  color: var(--warn-text);
}

.mana__pips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;

  button,
  .mana__pip-temp {
    width: 26px;
    height: 26px;
    padding: 0;
    border: 0;
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  i {
    width: 16px;
    height: 16px;
    transform: rotate(45deg);
    border-radius: 3px;
    box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--secondary) 45%, var(--line));

    &.on {
      background: var(--secondary);
      box-shadow: 0 0 6px color-mix(in srgb, var(--secondary) 40%, transparent);
    }
  }

  .mana__pip-temp i {
    background: var(--accent);
    box-shadow: 0 0 6px color-mix(in srgb, var(--accent) 50%, transparent);
  }
}

.facts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  font-size: 13px;
  color: var(--page-muted);

  strong {
    color: var(--page-text);
  }
}

.temp-row {
  gap: 10px;
  color: var(--page-soft);

  strong {
    color: var(--page-text);
  }
}

.conc {
  .input {
    flex: 1 1 auto;
    min-width: 0;
  }

  .is-on {
    border-color: var(--secondary);
  }
}

.use-pip {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  color: var(--page-muted);
  border: 1.5px dashed var(--line-strong);

  &.on {
    background: var(--secondary);
    color: var(--on-secondary);
    border: 1.5px solid var(--secondary);
  }
}
</style>
