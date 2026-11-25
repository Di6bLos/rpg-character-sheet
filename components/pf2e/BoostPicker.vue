<script setup lang="ts">
// One set of PF2e attribute boosts: `count` toggles among the six attributes, each to a
// different one (Player Core p. 19). `locked` are boosts this set already gives (an ancestry's
// listed boosts), shown on and fixed; `allowed` narrows the choice (a background's two).
import type { Pf2eAttr } from '~/types/sheets'
import { PF2E_ATTRS } from '~/utils/pf2eBuild'

const props = withDefaults(
  defineProps<{
    label: string
    count: number
    allowed?: Pf2eAttr[]
    locked?: Pf2eAttr[]
    /** Attributes this set can't take (the other boost of a background). */
    taken?: Pf2eAttr[]
  }>(),
  { allowed: () => PF2E_ATTRS, locked: () => [], taken: () => [] },
)
const model = defineModel<Pf2eAttr[]>({ required: true })

function toggle(a: Pf2eAttr) {
  if (props.locked.includes(a)) return
  if (model.value.includes(a)) model.value = model.value.filter((x) => x !== a)
  // A single boost moves on the next click instead of needing a clear first.
  else if (props.count === 1) model.value = [a]
  else if (model.value.length < props.count) model.value = [...model.value, a]
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
      :title="locked.includes(a) ? 'Given by this choice' : undefined"
      @click="toggle(a)"
    >
      {{ a }}
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
    opacity: 0.4;
    cursor: not-allowed;
  }

  &.boost--locked {
    cursor: default;
    border-style: dashed;
  }

  @media (pointer: coarse) {
    min-height: 44px;
  }
}
</style>
