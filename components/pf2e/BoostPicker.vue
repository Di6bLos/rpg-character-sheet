<script setup lang="ts">
// One set of PF2e attribute boosts: `count` toggles among the six attributes, each to a
// different one (Player Core p. 19). `locked` are boosts this set already gives (an ancestry's
// listed boosts), shown on and fixed; `allowed` narrows the choice (a background's two).
import type { Pf2eAttr } from '~/types/sheets'
import { PF2E_ATTRS, PF2E_ATTR_NAME } from '~/utils/pf2eBuild'

const props = withDefaults(
  defineProps<{
    label: string
    count: number
    allowed?: Pf2eAttr[]
    locked?: Pf2eAttr[]
    /** Attributes this set can't take (the other boost of a background). */
    taken?: Pf2eAttr[]
    /** Where the locked boosts come from, said on the chip: "from ancestry". */
    lockedLabel?: string
    /** Current modifiers, named on each button for screen readers ("Strength, now +4"). */
    values?: Partial<Record<Pf2eAttr, number>>
    /** Attributes holding a partial boost. */
    partial?: Pf2eAttr[]
  }>(),
  {
    values: () => ({}),
    partial: () => [],
    allowed: () => PF2E_ATTRS,
    locked: () => [],
    taken: () => [],
    lockedLabel: 'given by this choice',
  },
)
const model = defineModel<Pf2eAttr[]>({ required: true })

function toggle(a: Pf2eAttr) {
  if (props.locked.includes(a)) return
  if (model.value.includes(a)) model.value = model.value.filter((x) => x !== a)
  // A single boost moves on the next click instead of needing a clear first.
  else if (props.count === 1) model.value = [a]
  else if (model.value.length < props.count) model.value = [...model.value, a]
}

const signed = (n: number) => (n >= 0 ? `+${n}` : String(n))
/** The button's name: the attribute in full, its value now, a partial boost it holds. */
function spoken(a: Pf2eAttr) {
  const v = props.values[a]
  return [
    PF2E_ATTR_NAME[a],
    v === undefined ? '' : `now ${signed(v)}`,
    props.partial.includes(a) ? 'has a partial boost' : '',
    props.locked.includes(a) ? props.lockedLabel : '',
  ]
    .filter(Boolean)
    .join(', ')
}

const blocked = (a: Pf2eAttr) =>
  props.locked.includes(a) ||
  !props.allowed.includes(a) ||
  props.taken.includes(a) ||
  (props.count > 1 && model.value.length >= props.count && !model.value.includes(a))
</script>

<template>
  <div class="boosts" role="group" :aria-label="`${label}: ${model.length} of ${count}`">
    <span class="boosts__label">
      {{ label }} <span class="muted">{{ model.length }}/{{ count }}</span>
    </span>
    <button
      v-for="a in PF2E_ATTRS"
      :key="a"
      type="button"
      class="boost"
      :aria-pressed="locked.includes(a) || model.includes(a)"
      :disabled="!locked.includes(a) && blocked(a) && !model.includes(a)"
      :aria-disabled="locked.includes(a) || undefined"
      :class="{ 'boost--locked': locked.includes(a) }"
      :title="locked.includes(a) ? lockedLabel : undefined"
      @click="toggle(a)"
    >
      <svg
        v-if="locked.includes(a)"
        class="boost__lock"
        viewBox="0 0 16 16"
        width="11"
        height="11"
        aria-hidden="true"
      >
        <path fill="currentColor" d="M4 7V5a4 4 0 1 1 8 0v2h1v8H3V7h1Zm2 0h4V5a2 2 0 1 0-4 0v2Z" />
      </svg>
      <span aria-hidden="true">{{ a }}</span
      ><span class="sr-only">{{ spoken(a) }}</span>
    </button>
  </div>
</template>

<style scoped lang="scss">
.boosts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.boosts__label {
  min-width: 150px;
  font-size: 13px;
  font-weight: 600;
}

.boost {
  min-width: 52px;
  min-height: 40px;
  border-radius: min(var(--radius-control), 8px);
  border: 1px solid var(--line);
  background: transparent;
  color: var(--page-text);
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 0.04em;

  &[aria-pressed='true'] {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 22%, transparent);
    color: var(--accent-text);
  }

  &:disabled {
    opacity: 0.55;
    border-style: dotted;
    cursor: not-allowed;
  }

  &.boost--locked {
    cursor: default;
    border-style: dashed;
  }

  .boost__lock {
    margin-right: 3px;
    vertical-align: -1px;
  }

  @media (pointer: coarse) {
    min-height: 44px;
  }
}
</style>
