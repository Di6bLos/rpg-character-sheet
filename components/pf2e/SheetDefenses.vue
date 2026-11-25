<script setup lang="ts">
// The PF2e sheet's persistent damage and defenses: each persistent damage condition (Player Core
// p. 445) with its dice, taken by End turn with its DC 15 flat check, an assisted recovery (DC 10
// for particularly apt help, once a round) and End; a form to add one by hand; then the hero's
// immunities, weaknesses and resistances (p. 408), those the player wrote down (removable) and
// those effects give (Raging Resistance by instinct, Superstition's two traditions chosen
// here). Rules in utils/pf2eDamage.ts and
// utils/pf2ePlay.ts.
import type { Pf2eSheet } from '~/types/sheets'
import {
  PF2E_DAMAGE_TYPES,
  SUPERSTITION_KEY,
  SUPERSTITION_PAIRS,
  addPersistent,
  defensesOf,
  instinctOf,
  persistentAmount,
  removePersistent,
  superstitionTraditions,
} from '~/utils/pf2eDamage'
import { assistedRecovery } from '~/utils/pf2ePlay'

const { draft, canEdit, say } = useSheet<Pf2eSheet>()
const sheet = computed(() => draft.value.sheet)

const dice = ref('')
const type = ref('fire')
const apt = ref(false)
const diceOk = computed(() => !!persistentAmount(dice.value))

function add() {
  if (!canEdit.value || !diceOk.value) return
  say(addPersistent(sheet.value, dice.value, type.value))
  dice.value = ''
}

function assist(t: string) {
  if (canEdit.value) say(assistedRecovery(sheet.value, t, apt.value))
}

function end(t: string) {
  if (canEdit.value) say(removePersistent(sheet.value, t))
}

const defenses = computed(() => defensesOf(sheet.value, draft.value.level))

/** Superstition's two traditions for Raging Resistance (Player Core 2 p. 75). */
const superstition = computed(() => instinctOf(sheet.value) === 'Superstition')
const traditions = computed({
  get: () => superstitionTraditions(sheet.value).join(' and '),
  set: (v: string) => {
    if (!canEdit.value) return
    sheet.value.levelChoices = {
      ...sheet.value.levelChoices,
      [SUPERSTITION_KEY]: v ? v.split(' and ') : [],
    }
  },
})

type Kind = 'resistances' | 'weaknesses' | 'immunities'
const kind = ref<Kind>('resistances')
const defType = ref('')
const defValue = ref<number | null>(null)
const defOk = computed(
  () => defType.value.trim() !== '' && (kind.value === 'immunities' || (defValue.value ?? 0) > 0),
)

function addDefense() {
  if (!canEdit.value || !defOk.value) return
  const own = (sheet.value.defenses ??= { resistances: [], weaknesses: [], immunities: [] })
  const what = defType.value.trim().toLowerCase()
  if (kind.value === 'immunities') {
    if (!own.immunities.includes(what)) own.immunities = [...own.immunities, what]
  } else {
    const list = own[kind.value].filter((d) => d.type !== what)
    own[kind.value] = [...list, { type: what, value: Math.floor(defValue.value ?? 0) }]
  }
  defType.value = ''
  defValue.value = null
}

function removeDefense(k: Kind, what: string) {
  const own = sheet.value.defenses
  if (!canEdit.value || !own) return
  if (k === 'immunities') own.immunities = own.immunities.filter((i) => i !== what)
  else own[k] = own[k].filter((d) => d.type !== what)
}

const listed = computed(() => [
  ...defenses.value.immunities.map((t) => ({
    k: 'immunities' as Kind,
    type: t,
    label: `Immune to ${t}`,
    source: 'Sheet',
    note: '',
  })),
  ...defenses.value.weaknesses.map((d) => ({
    k: 'weaknesses' as Kind,
    type: d.type,
    label: `Weakness ${d.value} ${d.type}`,
    source: d.source,
    note: '',
  })),
  ...defenses.value.resistances.map((d) => ({
    k: 'resistances' as Kind,
    type: d.type,
    label: `Resistance ${d.value} ${d.type}`,
    source: d.source,
    note: d.note ?? '',
  })),
])
</script>

<template>
  <div class="stack defs">
    <div class="caps">Persistent damage</div>
    <ul v-if="sheet.persistent?.length" class="defs__list">
      <li v-for="p in sheet.persistent" :key="p.type" class="defs__item">
        <strong>{{ p.dice }} {{ p.type }}</strong>
        <button
          type="button"
          class="btn btn--ghost btn--sm"
          :disabled="!canEdit"
          :title="`Help from you or an ally (usually 2 actions): another flat check now, once a round; DC ${apt ? 10 : 15}`"
          @click="assist(p.type)"
        >
          Assisted recovery
        </button>
        <button
          type="button"
          class="btn btn--ghost btn--sm"
          :disabled="!canEdit"
          :aria-label="`End persistent ${p.type} damage`"
          @click="end(p.type)"
        >
          End
        </button>
      </li>
    </ul>
    <p v-if="sheet.persistent?.length" class="small muted defs__hint">
      End turn rolls it and the DC 15 flat check.
      <label class="check">
        <input v-model="apt" type="checkbox" :disabled="!canEdit" />
        Particularly apt help (DC 10)
      </label>
    </p>
    <form class="defs__form" @submit.prevent="add">
      <label class="sr-only" for="pf-persist-dice">Persistent damage dice</label>
      <input
        id="pf-persist-dice"
        v-model="dice"
        class="input defs__dice"
        placeholder="1d6"
        maxlength="12"
        :disabled="!canEdit"
      />
      <label class="sr-only" for="pf-persist-type">Persistent damage type</label>
      <select id="pf-persist-type" v-model="type" class="input defs__type" :disabled="!canEdit">
        <option v-for="t in PF2E_DAMAGE_TYPES" :key="t" :value="t">{{ t }}</option>
      </select>
      <button type="submit" class="btn btn--ghost btn--sm" :disabled="!canEdit || !diceOk">
        Add persistent
      </button>
    </form>

    <div class="caps">Resistances, weaknesses, immunities</div>
    <ul v-if="listed.length" class="defs__list">
      <li v-for="d in listed" :key="`${d.k}-${d.type}-${d.source}`" class="defs__item">
        <span :title="d.note || undefined"
          >{{ d.label }}
          <small v-if="d.source !== 'Sheet'" class="muted">· {{ d.source }}</small>
          <small v-if="d.note" class="muted">· {{ d.note }}</small></span
        >
        <button
          v-if="d.source === 'Sheet'"
          type="button"
          class="step step--xs"
          :disabled="!canEdit"
          :aria-label="`Remove ${d.label}`"
          @click="removeDefense(d.k, d.type)"
        >
          ×
        </button>
      </li>
    </ul>
    <label v-if="superstition" class="defs__form small">
      Superstition resists spells of
      <select v-model="traditions" class="input defs__type" :disabled="!canEdit">
        <option value="">Choose two traditions</option>
        <option v-for="p in SUPERSTITION_PAIRS" :key="p.join()" :value="p.join(' and ')">
          {{ p.join(' and ') }}
        </option>
      </select>
    </label>
    <form class="defs__form" @submit.prevent="addDefense">
      <label class="sr-only" for="pf-def-kind">Kind</label>
      <select id="pf-def-kind" v-model="kind" class="input defs__type" :disabled="!canEdit">
        <option value="resistances">Resistance</option>
        <option value="weaknesses">Weakness</option>
        <option value="immunities">Immunity</option>
      </select>
      <label class="sr-only" for="pf-def-type">To what</label>
      <input
        id="pf-def-type"
        v-model="defType"
        class="input defs__what"
        list="pf-def-types"
        placeholder="fire, physical, all…"
        maxlength="40"
        :disabled="!canEdit"
      />
      <datalist id="pf-def-types">
        <option
          v-for="t in [...PF2E_DAMAGE_TYPES, 'physical', 'energy', 'all damage', 'spells']"
          :key="t"
          :value="t"
        />
      </datalist>
      <template v-if="kind !== 'immunities'">
        <label class="sr-only" for="pf-def-value">Value</label>
        <input
          id="pf-def-value"
          v-model.number="defValue"
          class="input defs__dice"
          type="number"
          inputmode="numeric"
          min="1"
          placeholder="5"
          :disabled="!canEdit"
        />
      </template>
      <button type="submit" class="btn btn--ghost btn--sm" :disabled="!canEdit || !defOk">
        Add
      </button>
    </form>
  </div>
</template>

<style scoped lang="scss">
.defs {
  gap: 8px;
}

.defs__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.defs__item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  font-size: 14px;

  strong {
    text-transform: capitalize;
  }
}

.defs__hint {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 12px;
  margin: 0;
}

.defs__form {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.defs__dice {
  width: 80px;
}

.defs__type {
  width: auto;
  min-width: 120px;
  text-transform: capitalize;
}

.defs__what {
  width: 170px;
}

.check {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
  min-height: 36px;

  input {
    accent-color: var(--accent);
  }
}
</style>
