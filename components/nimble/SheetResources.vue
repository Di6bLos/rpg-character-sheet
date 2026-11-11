<script setup lang="ts">
// Mana, the class resource (Rage, Combat Dice, Bursts of Speed…) and Concentration.
import { classBySlug } from '~/data/nimble/classes'
import type { NimbleSheet } from '~/types/sheets'
import { abilityBaseName, keyStatValue, sheetResource } from '~/utils/nimbleBuild'
import { MAX_RAGE_DICE, encounterMana, spendActions } from '~/utils/nimblePlay'

const MAX_COUNT = 12

const { draft, canEdit, say } = useSheet<NimbleSheet>()
const sheet = computed(() => draft.value.sheet)
const cls = computed(() => classBySlug(sheet.value.classSlug))
const keyValue = computed(() => keyStatValue(sheet.value))

// --- Mana ---------------------------------------------------------------
// Spellblade has no mana pool, only INT mana gained on Initiative.
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

function setMana(value: number) {
  if (!canEdit.value) return
  const m = sheet.value.mana
  m.current = Math.max(0, Math.min(m.max, value))
}

function adjustTempMana(delta: number) {
  if (!canEdit.value) return
  sheet.value.mana.temp = Math.max(0, sheet.value.mana.temp + delta)
}

function gainSurge() {
  if (!canEdit.value) return
  const gain = Math.max(0, sheet.value.stats.WIL)
  sheet.value.mana.temp = gain
  say(`Elemental Surge: ${gain} temporary mana (add any dice it grants by hand).`)
}

// --- Class resource -------------------------------------------------------
const resource = computed(() => sheetResource(sheet.value, draft.value.level))
const res = computed(() => sheet.value.resource)
const statValue = computed(() => {
  const stat = resource.value?.stat
  return stat ? Math.max(0, sheet.value.stats[stat]) + (resource.value?.bonus ?? 0) : 0
})
const usesLeft = computed(() => statValue.value - res.value.count)
const badge = computed(() => {
  const r = resource.value
  if (!r) return ''
  if (r.kind === 'uses') return `${statValue.value} uses · ${r.stat}`
  const die = r.kind === 'dice' || r.kind === 'rage' ? `d${r.die}` : ''
  const stat = r.bonus ? `${r.stat}+${r.bonus}` : r.stat
  const from = r.stat ? `${stat} (${statValue.value}) on Initiative` : ''
  return [die, from].filter(Boolean).join(' · ')
})

function adjustCount(delta: number) {
  if (!canEdit.value) return
  res.value.count = Math.max(0, Math.min(MAX_COUNT, res.value.count + delta))
}

function adjustRageDice(delta: number) {
  if (!canEdit.value) return
  res.value.dice = Math.max(0, Math.min(MAX_RAGE_DICE, res.value.dice + delta))
}

function toggleRage() {
  if (!canEdit.value || !resource.value) return
  const name = resource.value.name
  if (res.value.active) {
    res.value.active = false
    say(`${name} ended.`)
    return
  }
  res.value.active = true
  spendActions(sheet.value)
  say(`${name}! ${resource.value.diceName || 'Bonus'} dice add to your melee damage.`)
}

function useMove(name: string) {
  if (!canEdit.value || res.value.count < 1) return
  res.value.count -= 1
  say(`${name}: spent 1 ${resource.value?.diceName.toLowerCase() || 'charge'}.`)
}

function endConcentration() {
  if (canEdit.value) sheet.value.concentration = ''
}
</script>

<template>
  <div class="stack" style="gap: 24px; min-width: 0">
    <section v-if="hasMana" class="panel stack mana" aria-labelledby="mana-h">
      <div class="panel-title" style="margin: 0">
        <h2 id="mana-h">Mana</h2>
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
            ><strong>Elemental Surge</strong>: temporary mana when you roll Initiative</template
          >
          <template v-else-if="combatMana > 0"
            ><strong>Encounter mana</strong>: gained on New encounter, lost when combat
            ends</template
          >
          <template v-else>Temporary mana (spent first, lost when combat ends)</template>
        </span>
        <div class="row" style="gap: 6px; margin-left: auto">
          <button
            v-if="surge"
            type="button"
            class="btn btn--ghost btn--sm"
            :disabled="!canEdit"
            @click="gainSurge"
          >
            Gain
          </button>
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
    </section>

    <section
      v-if="resource"
      class="panel stack"
      :class="{ 'is-raging': resource.kind === 'rage' && res.active }"
      aria-labelledby="res-h"
    >
      <div class="panel-title" style="margin: 0">
        <h2 id="res-h">{{ resource.name }}</h2>
        <span v-if="badge" class="badge badge--outline">{{ badge }}</span>
      </div>
      <p v-if="resource.desc" class="res-desc">
        <NimbleRulesText :text="resource.desc" :key-value="keyValue" />
      </p>

      <div v-if="resource.kind === 'rage'" class="row" style="gap: 10px">
        <button
          type="button"
          class="btn"
          :class="{ 'btn--ghost': !res.active }"
          :aria-pressed="res.active"
          :disabled="!canEdit"
          @click="toggleRage"
        >
          {{ res.active ? `${resource.name} active` : `${resource.name} · 1 action` }}
        </button>
        <div class="row" style="gap: 8px; margin-left: auto">
          <button
            type="button"
            class="step step--sm"
            :aria-label="`Spend a ${resource.diceName || 'bonus'} die`"
            :disabled="!canEdit"
            @click="adjustRageDice(-1)"
          >
            −
          </button>
          <span class="res-dice" aria-live="polite">{{ res.dice }}d{{ resource.die }}</span>
          <button
            type="button"
            class="step step--sm"
            :aria-label="`Gain a ${resource.diceName || 'bonus'} die`"
            :disabled="!canEdit"
            @click="adjustRageDice(1)"
          >
            +
          </button>
        </div>
      </div>

      <template v-else-if="resource.kind === 'dice' || resource.kind === 'counter'">
        <div class="row" style="gap: 12px">
          <div class="row" style="gap: 6px" aria-live="polite">
            <span v-for="n in res.count" :key="n" class="res-pip">
              {{ resource.kind === 'dice' ? `d${resource.die}` : n }}
            </span>
            <span v-if="res.count === 0" class="small muted" style="font-size: 13px">None</span>
            <span class="sr-only">{{ res.count }} {{ resource.name }}</span>
          </div>
          <div class="row" style="gap: 8px; margin-left: auto">
            <button
              type="button"
              class="step step--sm"
              aria-label="Spend one"
              :disabled="!canEdit || res.count === 0"
              @click="adjustCount(-1)"
            >
              −
            </button>
            <button
              type="button"
              class="step step--sm"
              aria-label="Gain one"
              :disabled="!canEdit"
              @click="adjustCount(1)"
            >
              +
            </button>
          </div>
        </div>
        <div v-if="resource.moves.length" class="moves">
          <button
            v-for="m in resource.moves"
            :key="m.name"
            type="button"
            :disabled="!canEdit || res.count === 0"
            @click="useMove(m.name)"
          >
            <strong>{{ m.name }}</strong>
            <span><NimbleRulesText :text="m.desc" :key-value="keyValue" /></span>
          </button>
        </div>
      </template>

      <template v-else-if="resource.kind === 'uses'">
        <div class="row" style="gap: 10px">
          <span
            v-for="n in statValue"
            :key="n"
            class="use-pip"
            :class="{ on: n <= usesLeft }"
            aria-hidden="true"
            >{{ n }}</span
          >
          <span class="small" style="font-size: 14px" aria-live="polite">
            {{
              usesLeft > 0
                ? `${usesLeft} of ${statValue} left this Safe Rest`
                : 'No uses left before your patron notices'
            }}
          </span>
          <div class="row" style="gap: 8px; margin-left: auto">
            <button
              type="button"
              class="step step--sm"
              aria-label="Regain a use"
              :disabled="!canEdit || res.count === 0"
              @click="adjustCount(-1)"
            >
              −
            </button>
            <button
              type="button"
              class="step step--sm"
              aria-label="Spend a use"
              :disabled="!canEdit"
              @click="adjustCount(1)"
            >
              +
            </button>
          </div>
        </div>
        <div v-if="usesLeft < 0" class="notice notice--error" role="alert">
          Over the limit {{ -usesLeft }} time{{ usesLeft === -1 ? '' : 's' }}: each one costs you
          {{ Math.floor(sheet.hpMax / 2) }} HP.
        </div>
      </template>
    </section>

    <section class="panel stack conc" aria-labelledby="conc-h">
      <div class="title-help">
        <h2 id="conc-h">Concentration</h2>
        <UiHelp
          label="About concentration"
          text="If you are hit by a crit, make a DC 10 STR save or lose concentration. Dropping to 0 HP ends it."
        />
      </div>
      <div class="row" style="gap: 8px; flex-wrap: nowrap">
        <label for="nb-conc" class="sr-only">Concentrating on</label>
        <input
          id="nb-conc"
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
    </section>
  </div>
</template>

<style scoped lang="scss">
.mana {
  border-color: color-mix(in srgb, var(--secondary) 45%, var(--panel-line));
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

.is-raging {
  border: 1.5px solid var(--accent);
}

.res-desc {
  font-size: 14px;
  line-height: 1.55;
  color: var(--page-soft);
  // Upgrades append "Level N: …" on new lines.
  white-space: pre-line;
}

.res-dice {
  min-width: 56px;
  text-align: center;
  font-size: 18px;
  font-weight: 700;
  color: var(--accent-text);
}

.res-pip {
  min-width: 34px;
  height: 34px;
  padding: 0 6px;
  border-radius: min(var(--radius-control), 8px);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  background: var(--warn-bg);
  color: var(--warn-text);
  border: 1px solid var(--accent);
}

.moves {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr));
  gap: 8px;

  button {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
    padding: 10px 12px;
    border-radius: min(var(--radius-panel), 10px);
    border: 1px solid var(--line);
    background: var(--field);
    color: var(--page-text);
    text-align: left;

    strong {
      font-size: 14px;
    }

    span {
      font-size: 12px;
      line-height: 1.4;
      color: var(--page-muted);
    }
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

.conc {
  .input {
    flex: 1 1 auto;
    min-width: 0;
  }

  .is-on {
    border-color: var(--secondary);
  }
}
</style>
