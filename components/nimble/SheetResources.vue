<script setup lang="ts">
// Mana, the class resource (Rage, Combat Dice, Bursts of Speed…) and Concentration.
import { classBySlug } from '~/data/nimble/classes'
import type { NimbleSheet } from '~/types/sheets'
import {
  abilityBaseName,
  keyStatValue,
  knownSpells,
  knownUtilitySpells,
  sheetResource,
} from '~/utils/nimbleBuild'
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
const hasSpells = computed(
  () => knownSpells(sheet.value).length > 0 || knownUtilitySpells(sheet.value).length > 0,
)

// --- Mana ---------------------------------------------------------------
// Spellblade has no mana pool, only INT mana gained on Initiative.
const combatMana = computed(() => encounterMana(sheet.value))
const hasMana = computed(() => sheet.value.mana.max > 0 || combatMana.value > 0)
const manaFormula = computed(() => {
  if (cls.value?.mana && sheet.value.mana.max > 0)
    return `${cls.value.mana.label} = ${sheet.value.mana.max}`
  return combatMana.value > 0 ? `${combatMana.value} on Initiative` : ''
})
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
const upgradeAliases = computed(() => {
  const r = resource.value
  if (!r) return []
  return [
    r.name,
    `${r.diceName} Die`,
    `${r.diceName} Dice`,
    ...r.moves.filter((m) => m.src === 'Maneuver').map((m) => m.name),
  ]
})
const shownElsewhere = computed(() => [
  ...(resource.value?.moves ?? []).map((m) => abilityBaseName(m.name)),
  ...linkedOptions.value.map((o) => o.ability),
])
const statValue = computed(() => resource.value?.max ?? 0)
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
</script>

<template>
  <div class="stack" style="gap: 24px; min-width: 0">
    <section v-if="hasMana && !hasSpells" class="panel stack mana" aria-labelledby="mana-h">
      <UiFold name="Mana" />
      <div class="panel-title" style="margin: 0">
        <h2 id="mana-h">Mana</h2>
        <span v-if="manaFormula" class="badge badge--outline">{{ manaFormula }}</span>
      </div>
      <NimbleSpellPool part="mana" />
    </section>

    <section
      v-if="
        resource &&
        !(resource.kind === 'uses' && hasSpells && !moves.length && !linkedOptions.length)
      "
      class="panel stack"
      :class="{ 'is-raging': resource.kind === 'rage' && res.active }"
      aria-labelledby="res-h"
    >
      <UiFold :name="resource.name" />
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
        <div v-if="resource.kind === 'power' && inventions.length" class="stack" style="gap: 6px">
          <NimbleInventionCard v-for="inv in inventions" :key="inv.name" :name="inv.name" />
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

      <NimbleSpellPool v-else-if="resource.kind === 'uses'" part="uses" />
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
      <NimbleModifiers
        v-if="resource.ability"
        :target="resource.ability"
        :aliases="upgradeAliases"
        :skip="shownElsewhere"
      />
    </section>

    <section v-if="!hasSpells" class="panel stack" aria-labelledby="conc-h">
      <UiFold name="Concentration" />
      <div class="title-help">
        <h2 id="conc-h">Concentration</h2>
        <UiHelp
          label="About concentration"
          text="If you are hit by a crit, make a DC 10 STR save or lose concentration. Dropping to 0 HP ends it."
        />
      </div>
      <NimbleSpellPool part="concentration" />
    </section>
  </div>
</template>

<style scoped lang="scss">
.mana {
  border-color: color-mix(in srgb, var(--secondary) 45%, var(--panel-line));
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
</style>
