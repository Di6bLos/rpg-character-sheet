<script setup lang="ts">
// A creature's or hero's conditions, as the hero column has them: the active ones as
// chips (hover for what they do, click to remove) and + Add, which opens a picker of
// Nimble's conditions and spell statuses (tap to toggle) with what each active one does.
// Bloodied, Dying and Wounded are left out: HP shows those. The caller applies each
// toggle: the stat block writes the combatant, the hero vitals send it to the hero's sheet.
import { AUTO_CONDITIONS, CONDITIONS } from '~/data/nimble/core'
import { SPELL_STATUSES } from '~/utils/nimbleConditions'

const props = defineProps<{
  /** Whose conditions, for labels. */
  name: string
  /** Changes when another creature is shown; the open picker closes. */
  subject: string
  conditions: string[]
  /** The line under the picker: what happens to a condition set here. */
  note: string
}>()
const emit = defineEmits<{ toggle: [name: string, on: boolean] }>()

const SPELL_NAMES = new Set(SPELL_STATUSES.map((s) => s.name))
const OPTIONS = [...CONDITIONS, ...SPELL_STATUSES]
  .filter((x) => !AUTO_CONDITIONS.includes(x.name) && x.name !== 'Helped')
  .map((x) => ({ ...x, spell: SPELL_NAMES.has(x.name) }))
const DESC = new Map(OPTIONS.map((x) => [x.name, x.desc]))

const options = computed(() =>
  OPTIONS.map((x) => ({ ...x, on: props.conditions.includes(x.name) })),
)
/** Active conditions with what they do; a custom name typed elsewhere has none. */
const active = computed(() => props.conditions.map((n) => ({ name: n, desc: DESC.get(n) ?? '' })))

function toggle(name: string) {
  emit('toggle', name, !props.conditions.includes(name))
}

const addOpen = ref(false)
// The picker is for one creature: close it when another is shown.
watch(
  () => props.subject,
  () => (addOpen.value = false),
)
</script>

<template>
  <div class="cond">
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
    <div v-if="active.length" class="cond__chips">
      <button
        v-for="a in active"
        :key="a.name"
        type="button"
        class="cond__chip"
        :title="`${a.desc ? `${a.desc} ` : ''}Click to remove.`"
        :aria-label="`Remove ${a.name}`"
        @click="toggle(a.name)"
      >
        {{ a.name }} <span aria-hidden="true">×</span>
      </button>
    </div>
    <p v-else class="cond__none">None</p>

    <UiDialog v-model="addOpen" :title="`Conditions · ${name}`" width="560px">
      <div class="pick">
        <div class="pick__chips">
          <button
            v-for="o in options.filter((x) => !x.spell)"
            :key="o.name"
            type="button"
            class="chip pick__chip"
            :aria-pressed="o.on"
            :title="o.desc"
            @click="toggle(o.name)"
          >
            {{ o.name }}
          </button>
        </div>
        <div class="pick__chips">
          <span class="pick__group">Spell and ally statuses</span>
          <button
            v-for="o in options.filter((x) => x.spell)"
            :key="o.name"
            type="button"
            class="chip pick__chip"
            :aria-pressed="o.on"
            :title="o.desc"
            @click="toggle(o.name)"
          >
            {{ o.name }}
          </button>
        </div>
        <div v-if="active.length" class="tile pick__active">
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
</style>
