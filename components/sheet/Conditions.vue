<script setup lang="ts">
// The conditions block of the Nimble and PF2e Vitals panels: chip groups (tap to toggle; PF2e's
// valued ones show their value with −/+ steppers, and those another condition gives are dashed),
// statuses with End, then each active condition with what it does and when it ends, and what
// the conditions do to the numbers. Each system fills it: nimble/SheetConditions from
// useNimbleConditions, pf2e/SheetConditions from usePf2eConditions; the `after-groups` slot
// takes PF2e's ally effects.

export interface ConditionChip {
  name: string
  /** The chip's text when it isn't the name ("Frightened 2"). */
  label?: string
  on: boolean
  title: string
  disabled?: boolean
  /** On because another condition gives it (prone → off-guard): dashed, not filled. */
  implied?: boolean
  /** A valued condition that's on: −/+ steppers. */
  stepper?: boolean
}
export interface ConditionLine {
  name: string
  label: string
  desc: string
  /** The end chosen, or null for no choice (automatic, or from an effect). */
  end: string | null
  /** Said in place of the end choice (PF2e frightened: "Drops by 1 at the end of…"). */
  auto?: string
}

defineProps<{
  groups: { label?: string; chips: ConditionChip[] }[]
  active: ConditionLine[]
  ends: [string, string][]
  effects: string[]
  statuses?: { source: string; label: string; until: string }[]
}>()
const emit = defineEmits<{
  toggle: [name: string]
  step: [name: string, by: number]
  setEnd: [name: string, end: string]
  end: [source: string]
}>()
const { canEdit } = useSheet()
</script>

<template>
  <div class="conditions stack" style="gap: 10px">
    <div class="caps">Conditions</div>
    <div v-for="(g, gi) in groups" :key="gi" class="chips" style="gap: 6px">
      <span v-if="g.label" class="cond-group">{{ g.label }}</span>
      <template v-for="c in g.chips" :key="c.name">
        <span v-if="c.stepper" class="cond-valued">
          <button
            type="button"
            class="chip cond"
            :aria-pressed="c.on"
            :disabled="!canEdit || c.disabled"
            :title="c.title"
            @click="emit('toggle', c.name)"
          >
            {{ c.label ?? c.name }}
          </button>
          <button
            type="button"
            class="step step--xs"
            :aria-label="`Lower ${c.name}`"
            :disabled="!canEdit"
            @click="emit('step', c.name, -1)"
          >
            −
          </button>
          <button
            type="button"
            class="step step--xs"
            :aria-label="`Raise ${c.name}`"
            :disabled="!canEdit"
            @click="emit('step', c.name, 1)"
          >
            +
          </button>
        </span>
        <button
          v-else
          type="button"
          class="chip cond"
          :class="{ 'cond--implied': c.implied }"
          :aria-pressed="c.on"
          :disabled="!canEdit || c.disabled"
          :title="c.title"
          @click="emit('toggle', c.name)"
        >
          {{ c.label ?? c.name }}
        </button>
      </template>
    </div>
    <slot name="after-groups" />
    <ul v-if="statuses?.length" class="statuses">
      <li v-for="st in statuses" :key="st.source">
        <span class="grow"
          ><strong>{{ st.label }}</strong> <small>{{ st.until }}</small></span
        >
        <button
          type="button"
          class="btn btn--quiet btn--sm"
          :disabled="!canEdit"
          :aria-label="`End ${st.label}`"
          @click="emit('end', st.source)"
        >
          End
        </button>
      </li>
    </ul>
    <div v-if="active.length" class="tile active" style="gap: 8px">
      <div v-for="c in active" :key="c.name" class="cond-line">
        <span class="grow"
          ><strong>{{ c.label }}.</strong> {{ c.desc }}</span
        >
        <span v-if="c.auto" class="cond-auto">{{ c.auto }}</span>
        <label v-else-if="c.end !== null" class="cond-end">
          <span class="sr-only">When {{ c.name }} ends</span>
          <select
            class="input"
            :value="c.end"
            :disabled="!canEdit"
            @change="emit('setEnd', c.name, ($event.target as HTMLSelectElement).value)"
          >
            <option v-for="[value, label] in ends" :key="value" :value="value">
              Ends {{ label }}
            </option>
          </select>
        </label>
      </div>
      <ul v-if="effects.length" class="cond-effects">
        <li v-for="e in effects" :key="e">{{ e }}</li>
      </ul>
    </div>
  </div>
</template>

<style scoped lang="scss">
.cond-group {
  align-self: center;
  margin-right: 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--page-muted);
}

.active .cond-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 10px;
}

.cond-end select {
  min-height: 32px;
  padding: 2px 30px 2px 8px;
  font-size: 12px;
}

.cond-auto {
  font-size: 12px;
  color: var(--page-muted);
}

.cond-effects {
  margin: 0;
  padding: 6px 0 0 16px;
  border-top: 1px solid var(--track);
  font-size: 12px;
  color: var(--warn-text);
}

.statuses {
  list-style: none;
  margin: 0;
  padding: 0;

  li {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    border-bottom: 1px solid var(--track);
    font-size: 13px;
  }

  small {
    color: var(--page-muted);
  }
}

.cond {
  min-height: 34px;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 600;

  &[aria-pressed='true'] {
    background: var(--warn-bg);
    color: var(--warn-text);
    border-color: var(--accent);
  }

  // Automatic conditions stay readable while not clickable.
  &:disabled {
    opacity: 1;
    cursor: default;
  }

  // On because another condition gives it (prone → off-guard): outlined, not filled.
  &--implied {
    border-style: dashed;
    border-color: var(--accent);
  }
}

.cond-valued {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding-right: 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}

@media (pointer: coarse) {
  .cond {
    min-height: 44px;
  }
}

.cond-line {
  font-size: 13px;
  line-height: 1.5;
  color: var(--page-soft);

  strong {
    color: var(--page-text);
  }
}
</style>
