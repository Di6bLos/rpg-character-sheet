<script setup lang="ts">
// Mana, the class resource (Rage, Combat Dice, Bursts of Speed…) and Concentration.
import { classBySlug } from '~/data/nimble/classes'
import type { NimbleSheet } from '~/types/sheets'
import { abilityBaseName, keyStatValue, sheetResource } from '~/utils/nimbleBuild'
import { endEffects } from '~/utils/nimbleEffects'
import {
  costLabel,
  costShort,
  counterCost,
  encounterMana,
  freeMove,
  furyMax,
  isHollowOne,
} from '~/utils/nimblePlay'

const MAX_COUNT = 12

const { draft, canEdit } = useSheet<NimbleSheet>()
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

// --- Class resource -------------------------------------------------------
const resource = computed(() => {
  const r = sheetResource(sheet.value, draft.value.level)
  return r?.kind === 'uses' && isHollowOne(sheet.value) ? null : r
})
const res = computed(() => sheet.value.resource)
const {
  readied,
  held,
  setReady,
  rollPower,
  rollJudgment,
  expendJudgment,
  useMove,
  toggleCrit,
  inventions,
  operate,
  rage,
  left,
  addFury,
  endRage,
  spendFury,
  linkedOptions,
} = useNimbleActions()
const moves = computed(() =>
  (resource.value?.moves ?? []).map((m) => {
    const cost = counterCost(m.desc)
    return { ...m, cost: costLabel(cost), short: costShort(sheet.value, cost) }
  }),
)
const statValue = computed(() => resource.value?.max ?? 0)
const usesLeft = computed(() => statValue.value - res.value.count)
const badge = computed(() => {
  const r = resource.value
  if (!r) return ''
  if (r.kind === 'uses') return `${statValue.value} uses · ${r.stat}`
  if (r.kind === 'judgment') return `${r.roll}d${r.die}${r.advantage ? ' · advantage' : ''}`
  if (r.kind === 'crit') return `${r.roll}d${r.die} · 1/turn on a crit`
  const die = ['dice', 'rage', 'power'].includes(r.kind) ? `d${r.die}` : ''
  const stat = r.bonus ? `${r.stat}+${r.bonus}` : r.stat
  const when = r.refill === 'turn' ? 'recharges at end of turn' : 'on Initiative'
  const from = r.stat ? `${stat} (${statValue.value}) ${when}` : ''
  return [die, from].filter(Boolean).join(' · ')
})

function adjustCount(delta: number) {
  if (!canEdit.value) return
  const max = resource.value?.refill ? statValue.value : MAX_COUNT
  res.value.count = Math.max(0, Math.min(max, res.value.count + delta))
}

function endConcentration() {
  if (!canEdit.value) return
  sheet.value.concentration = ''
  endEffects(sheet.value, 'concentration')
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
            ><strong>Elemental Surge</strong>: rolled on New encounter, lost when combat
            ends</template
          >
          <template v-else-if="combatMana > 0"
            ><strong>Encounter mana</strong>: gained on New encounter, lost when combat
            ends</template
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
    </section>

    <section
      v-if="resource"
      class="panel stack"
      :class="{ 'is-raging': resource.kind === 'rage' && res.active }"
      aria-labelledby="res-h"
    >
      <div class="panel-title" style="margin: 0">
        <span class="title-help">
          <h2 id="res-h">{{ resource.name }}</h2>
          <UiHelp v-if="resource.desc" :label="`About ${resource.name}`" :text="resource.desc" />
        </span>
        <span v-if="badge" class="badge badge--outline">{{ badge }}</span>
      </div>

      <template v-if="resource.kind === 'rage'">
        <div class="row" style="gap: 10px; flex-wrap: wrap">
          <button
            v-if="!sheet.ownDice"
            type="button"
            class="btn"
            :class="{ 'btn--ghost': res.active }"
            :disabled="!canEdit || !!sheet.uses['Rage@turn']?.used || left === 0"
            @click="rage()"
          >
            {{ res.active ? `${resource.name} again` : resource.name }} · 1 action
          </button>
          <button
            v-if="res.active"
            type="button"
            class="btn btn--ghost btn--sm"
            :disabled="!canEdit"
            @click="endRage"
          >
            End {{ resource.name }}
          </button>
          <span class="small muted" style="font-size: 13px; margin-left: auto">
            {{ res.rolls.length }} / {{ furyMax(sheet) }} {{ resource.diceName }} Dice · +{{
              res.rolls.reduce((a, b) => a + b, 0)
            }}
            on STR attacks
          </span>
        </div>
        <NimbleDiceEntry
          v-if="sheet.ownDice"
          :label="`Fury Dice you rolled (d${resource.die})`"
          :action="`${res.active ? 'Rage again' : resource.name} · 1 action`"
          alt="Add as free dice"
          :disabled="!canEdit"
          @submit="rage"
          @alt="addFury"
        />
        <div v-if="res.rolls.length" class="row" style="gap: 6px" aria-live="polite">
          <button
            v-for="(v, i) in res.rolls"
            :key="i"
            type="button"
            class="res-pip"
            :disabled="!canEdit"
            :aria-label="`Spend the ${v} ${resource.diceName} Die: That all you got?!`"
            title="Spend it: That all you got?! (−STR+DEX damage when attacked)"
            @click="spendFury(i)"
          >
            {{ v }}
          </button>
        </div>
      </template>

      <template v-else-if="['dice', 'counter', 'power'].includes(resource.kind)">
        <div class="row" style="gap: 12px">
          <div class="row" style="gap: 6px" aria-live="polite">
            <span v-for="n in res.count" :key="n" class="res-pip">
              {{ resource.kind === 'counter' ? n : `d${resource.die}` }}
            </span>
            <span v-if="res.count === 0" class="small muted" style="font-size: 13px">None</span>
            <span v-if="resource.refill" class="small muted" style="font-size: 13px">
              of {{ resource.max }}
            </span>
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
              :disabled="!canEdit || (!!resource.refill && res.count >= resource.max)"
              @click="adjustCount(1)"
            >
              +
            </button>
          </div>
        </div>
        <div v-if="resource.kind === 'power'" class="row" style="gap: 8px">
          <span class="small" style="font-size: 14px">Ready to spend</span>
          <button
            type="button"
            class="step step--sm"
            :aria-label="`Ready one fewer ${resource.diceName} Die`"
            :disabled="!canEdit || readied === 0"
            @click="setReady(readied - 1)"
          >
            −
          </button>
          <span class="res-dice" aria-live="polite">{{ readied }}d{{ resource.die }}</span>
          <button
            type="button"
            class="step step--sm"
            :aria-label="`Ready one more ${resource.diceName} Die`"
            :disabled="!canEdit || readied >= res.count"
            @click="setReady(readied + 1)"
          >
            +
          </button>
          <button
            type="button"
            class="btn btn--ghost btn--sm"
            style="margin-left: auto"
            :disabled="!canEdit || readied === 0"
            @click="rollPower"
          >
            Roll {{ readied }}d{{ resource.die }}
          </button>
        </div>
        <div
          v-if="resource.kind === 'power' && inventions.length"
          class="row"
          style="gap: 6px; flex-wrap: wrap"
        >
          <button
            v-for="inv in inventions"
            :key="inv.name"
            type="button"
            class="btn btn--sm"
            :disabled="!canEdit || inv.inoperable || readied < inv.min || inv.noActions"
            :class="{ 'inv--broken': inv.inoperable }"
            :aria-label="inv.inoperable ? `${inv.name}, inoperable` : undefined"
            :title="
              inv.inoperable
                ? 'Inoperable: repair it first (flip its switch under All abilities)'
                : readied < inv.min
                  ? `Ready at least ${inv.min} ${resource.diceName} Die first`
                  : inv.noActions
                    ? 'Not enough actions left'
                    : `Use with ${readied}d${resource.die}`
            "
            @click="operate(inv.name)"
          >
            <NimbleBrokenIcon v-if="inv.inoperable" />
            {{ inv.name }}
          </button>
        </div>
        <p v-if="resource.kind === 'power'" class="small muted" style="font-size: 13px">
          Readied dice go on your next powered-weapon attack or Roll, then reset. Mishap if any die
          rolls {{ readied || 'the number spent' }} or less.
        </p>
      </template>

      <template v-else-if="resource.kind === 'judgment'">
        <div class="row" style="gap: 12px">
          <div class="row" style="gap: 6px" aria-live="polite">
            <span v-for="(v, i) in res.rolls" :key="i" class="res-pip">{{ v }}</span>
            <span v-if="!res.rolls.length" class="small muted" style="font-size: 13px">
              None held
            </span>
          </div>
          <div class="row" style="gap: 8px; margin-left: auto">
            <button
              v-if="!sheet.ownDice"
              type="button"
              class="btn btn--ghost btn--sm"
              :disabled="!canEdit || res.rolls.length > 0"
              @click="rollJudgment()"
            >
              Roll {{ resource.roll }}d{{ resource.die }}
            </button>
            <button
              type="button"
              class="btn btn--ghost btn--sm"
              :disabled="!canEdit || !res.rolls.length"
              @click="expendJudgment"
            >
              Expend
            </button>
          </div>
        </div>
        <NimbleDiceEntry
          v-if="sheet.ownDice && !res.rolls.length"
          :label="`Judgment Dice you rolled (${resource.roll}d${resource.die})`"
          action="Hold them"
          :disabled="!canEdit"
          @submit="rollJudgment"
        />
        <p v-if="held" class="small" style="font-size: 13px">
          +{{ held }} radiant on your next melee hit; spent whether it hits or misses.
        </p>
      </template>

      <div v-else-if="resource.kind === 'crit'" class="row" style="gap: 12px">
        <span class="small" style="font-size: 14px" aria-live="polite">
          {{
            res.count
              ? 'Used this turn'
              : `Ready: +${resource.roll}d${resource.die} on your next crit`
          }}
        </span>
        <button
          type="button"
          class="btn btn--ghost btn--sm"
          style="margin-left: auto"
          :disabled="!canEdit"
          :aria-pressed="res.count > 0"
          @click="toggleCrit"
        >
          {{ res.count ? 'Mark ready' : 'Mark used' }}
        </button>
      </div>

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
      <div v-if="moves.length || linkedOptions.length" class="moves">
        <button
          v-for="m in moves"
          :key="m.name"
          type="button"
          :disabled="!canEdit || (res.count === 0 && !freeMove(m.desc)) || m.short"
          :title="m.short ? 'Not enough actions left' : undefined"
          @click="useMove(m.name)"
        >
          <strong>{{ m.name }}</strong>
          <span><NimbleRulesText :text="m.desc" :key-value="keyValue" /></span>
          <em v-if="m.cost">{{ m.cost }}</em>
        </button>
        <div v-for="o in linkedOptions" :key="o.key" class="opt">
          <button
            type="button"
            :disabled="!canEdit || o.off"
            :title="o.why || undefined"
            @click="o.use()"
          >
            <strong>{{ o.name }}</strong>
            <span><NimbleRulesText :text="o.text" :key-value="keyValue" /></span>
            <em
              >{{ o.uses }}<template v-if="o.costText"> · {{ o.costText }}</template></em
            >
          </button>
          <button
            v-if="o.used"
            type="button"
            class="opt__undo"
            :disabled="!canEdit"
            :aria-label="`Undo ${o.name}`"
            @click="o.undo()"
          >
            Undo
          </button>
        </div>
      </div>
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

.inv--broken {
  gap: 6px;
  opacity: 1;
  background: var(--danger-bg);
  color: var(--danger-text);
  border: 1px dashed var(--danger);
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

    em {
      font-size: 11px;
      font-style: normal;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: var(--accent-text);
    }
  }
}

.opt {
  position: relative;
  display: flex;

  > button:first-child {
    flex: 1;
    min-width: 0;
  }

  .opt__undo {
    position: absolute;
    top: 6px;
    right: 6px;
    padding: 2px 8px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    color: var(--page-soft);
    background: var(--panel-bg);
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
