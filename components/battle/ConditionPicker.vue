<script setup lang="ts">
// A creature's or hero's conditions, as the hero column has them: the active ones as
// chips (hover for what they do, click to remove) and + Add, which opens a picker of the
// campaign system's conditions (`conditionNames`; tap to toggle). Nimble's adds its spell
// statuses as a second group and says what each active one does; 5e lists names only,
// PF2e its conditions with their effect on hover (Player Core pp. 442–447), the valued ones
// with their value ("Frightened 2"). Nimble leaves out Bloodied, Dying and Wounded: HP shows
// those; PF2e leaves out Dying, Wounded and Doomed, numbers on the sheet. PF2e's Persistent
// damage takes an amount and a type (Player Core p. 445): it emits `persistent`, and a hero's
// (`persistent` given) show as chips that end it. The caller applies each toggle: the stat
// block writes the combatant, the hero vitals send it to the hero's sheet.
import { CONDITIONS } from '~/data/nimble/core'
import { conditionNames } from '~/utils/battleFeatures'
import { SPELL_STATUSES } from '~/utils/nimbleConditions'
import { PF2E_DAMAGE_TYPES, persistentAmount } from '~/utils/pf2eDamage'
import { PF2E_CONDITION_DEFS } from '~/utils/pf2ePlay'
import { conditionLabels } from '~/utils/roster'

const props = defineProps<{
  /** Whose conditions, for labels. */
  name: string
  /** Changes when another creature is shown; the open picker closes. */
  subject: string
  conditions: string[]
  /** The line under the picker: what happens to a condition set here. */
  note: string
  /** PF2e values of valued conditions (frightened 2), shown on their chips. */
  values?: Record<string, number> | null
  /** A PF2e hero's persistent damage, one per type, each a chip that ends it. */
  persistent?: { dice: string; type: string }[]
}>()
const emit = defineEmits<{
  toggle: [name: string, on: boolean]
  /** PF2e persistent damage of a type: its amount, or null to end it. */
  persistent: [type: string, dice: string | null]
}>()

const system = useBattleSystem()
const SPELL_NAMES = new Set(SPELL_STATUSES.map((s) => s.name))
const NIMBLE_NAMES = new Set(conditionNames('nimble'))
/** What each Nimble condition the picker lists does; 5e and PF2e names have none here. */
const NIMBLE_DESC = new Map(
  [...CONDITIONS, ...SPELL_STATUSES]
    .filter((x) => NIMBLE_NAMES.has(x.name))
    .map((x) => [x.name, x.desc]),
)
const PF2E_DESC = new Map(PF2E_CONDITION_DEFS.map((d) => [d.name, d.effect]))
const nimble = computed(() => system.value === 'nimble')
const pf2e = computed(() => system.value === 'pf2e')
/** What a condition does, for its chip's title: Nimble's and PF2e's; 5e's have none here. */
const descOf = (name: string) =>
  nimble.value ? (NIMBLE_DESC.get(name) ?? '') : pf2e.value ? (PF2E_DESC.get(name) ?? '') : ''
const choices = computed(() =>
  conditionNames(system.value).map((name) => ({
    name,
    desc: descOf(name),
    spell: nimble.value && SPELL_NAMES.has(name),
  })),
)

const options = computed(() =>
  choices.value.map((x) => ({ ...x, on: props.conditions.includes(x.name) })),
)
/** Active conditions with what they do; a custom name typed elsewhere has none. */
const active = computed(() =>
  props.conditions.map((n) => ({
    name: n,
    label: conditionLabels([n], system.value, props.values)[0] ?? n,
    desc: descOf(n),
  })),
)

// --- PF2e persistent damage -----------------------------------------------------------
const pDice = ref('')
const pType = ref('fire')
const pAmount = computed(() => persistentAmount(pDice.value))
function addPersistent() {
  if (!pAmount.value) return
  emit('persistent', pType.value, pAmount.value)
  pDice.value = ''
}

function toggle(name: string) {
  emit('toggle', name, !props.conditions.includes(name))
}

const addOpen = ref(false)
// On touch "+ Add" and the chips are 44px targets, 8px apart.
const { touch } = useBoardLayout()
// The picker is for one creature: close it when another is shown.
watch(
  () => props.subject,
  () => {
    addOpen.value = false
    pDice.value = ''
  },
)
</script>

<template>
  <div class="cond" :class="{ 'cond--touch': touch }">
    <div class="cond__head">
      <span class="cond__label">Conditions</span>
      <button
        type="button"
        class="btn btn--ghost btn--sm cond__add"
        :aria-label="`Add a condition to ${name}`"
        @click="addOpen = true"
      >
        + Add
      </button>
    </div>
    <div v-if="active.length || persistent?.length" class="cond__chips">
      <button
        v-for="a in active"
        :key="a.name"
        type="button"
        class="cond__chip"
        :title="`${a.desc ? `${a.desc} ` : ''}Click to remove.`"
        :aria-label="`Remove ${a.name}`"
        @click="toggle(a.name)"
      >
        {{ a.label }} <span aria-hidden="true">×</span>
      </button>
      <button
        v-for="p in persistent ?? []"
        :key="`persistent-${p.type}`"
        type="button"
        class="cond__chip"
        :title="`${p.dice} persistent ${p.type} damage at the end of each turn. Click to end it.`"
        :aria-label="`End ${p.dice} persistent ${p.type} damage`"
        @click="emit('persistent', p.type, null)"
      >
        {{ p.dice }} persistent {{ p.type }} <span aria-hidden="true">×</span>
      </button>
    </div>
    <p v-else class="cond__none">No conditions</p>

    <UiDialog v-model="addOpen" :title="`Conditions · ${name}`" width="560px">
      <div class="pick">
        <div class="pick__chips">
          <button
            v-for="o in options.filter((x) => !x.spell)"
            :key="o.name"
            type="button"
            class="chip pick__chip"
            :aria-pressed="o.on"
            :title="o.desc || undefined"
            @click="toggle(o.name)"
          >
            {{ o.name }}
          </button>
        </div>
        <div v-if="nimble" class="pick__chips">
          <span class="pick__group">Spell and ally statuses</span>
          <button
            v-for="o in options.filter((x) => x.spell)"
            :key="o.name"
            type="button"
            class="chip pick__chip"
            :aria-pressed="o.on"
            :title="o.desc || undefined"
            @click="toggle(o.name)"
          >
            {{ o.name }}
          </button>
        </div>
        <form v-if="pf2e" class="pick__persist" @submit.prevent="addPersistent">
          <span class="pick__group">Persistent damage</span>
          <label class="sr-only" :for="`persist-dice-${subject}`">Amount</label>
          <input
            :id="`persist-dice-${subject}`"
            v-model="pDice"
            class="input pick__dice"
            placeholder="1d6"
            autocomplete="off"
          />
          <label class="sr-only" :for="`persist-type-${subject}`">Damage type</label>
          <select :id="`persist-type-${subject}`" v-model="pType" class="input pick__ptype">
            <option v-for="t in PF2E_DAMAGE_TYPES" :key="t" :value="t">{{ t }}</option>
          </select>
          <button type="submit" class="btn btn--sm" :disabled="!pAmount">Add</button>
        </form>
        <div v-if="nimble && active.length" class="tile pick__active">
          <p v-for="a in active" :key="a.name" class="pick__line">
            <strong>{{ a.name }}.</strong> {{ a.desc }}
          </p>
        </div>
        <p class="pick__note">{{ note }}</p>
      </div>
    </UiDialog>
  </div>
</template>

<style scoped lang="scss">
.cond {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cond__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.cond__label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--page-muted);
}

.cond__add {
  min-height: 26px;
  padding: 0 8px;
  font-size: 12px;
}

.cond__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.cond__chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 24px;
  padding: 0 9px;
  border-radius: 999px;
  border: 1px solid var(--accent);
  background: var(--warn-bg);
  color: var(--warn-text);
  font-size: 12px;
  font-weight: 600;
}

.cond__none {
  margin: 0;
  font-size: 12.5px;
  color: var(--page-muted);
}

.pick {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pick__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pick__group {
  align-self: center;
  margin-right: 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--page-muted);
}

.pick__chip {
  min-height: 34px;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 600;

  &[aria-pressed='true'] {
    background: var(--warn-bg);
    color: var(--warn-text);
    border-color: var(--accent);
  }
}

@media (pointer: coarse) {
  .pick__chip {
    min-height: 44px;
  }
}

.pick__active {
  gap: 8px;
}

.pick__persist {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.pick__dice {
  width: 80px;
}

.pick__ptype {
  flex: 1 1 120px;
  min-width: 0;
  text-transform: capitalize;
}

.pick__line {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--page-soft);

  strong {
    color: var(--page-text);
  }
}

.pick__note {
  margin: 0;
  font-size: 12px;
  color: var(--page-muted);
}

// --- Touch -----------------------------------------------------------------------------
.cond--touch {
  .cond__head,
  .cond__chips {
    gap: 8px;
  }

  .cond__add,
  .cond__chip {
    min-height: 44px;
    padding: 0 14px;
  }
}
</style>
