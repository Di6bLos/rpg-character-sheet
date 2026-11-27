<script setup lang="ts">
// The riders an attack card offers (utils/dnd5eRiders.ts): a chip each, pressed when picked,
// with its numbers and rules on hover; one that can't apply now is greyed with why; a rider
// with a choice of damage type gets a small select once picked. The card rolls the picks.
import type { Dnd5eRiderOption, Dnd5eRiderPick } from '~/utils/dnd5eRiders'

const props = defineProps<{
  options: Dnd5eRiderOption[]
  picks: Dnd5eRiderPick[]
  disabled?: boolean
}>()
const emit = defineEmits<{ 'update:picks': [Dnd5eRiderPick[]] }>()

const shown = computed(() => props.options.filter((o) => o.fits))
const picked = (key: string) => props.picks.find((p) => p.key === key)

function toggle(o: Dnd5eRiderOption) {
  const was = picked(o.def.key)
  emit(
    'update:picks',
    was
      ? props.picks.filter((p) => p.key !== o.def.key)
      : [...props.picks, { key: o.def.key, ...(o.types.length > 1 ? { type: o.types[0] } : {}) }],
  )
}

function setType(key: string, type: string) {
  emit(
    'update:picks',
    props.picks.map((p) => (p.key === key ? { ...p, type } : p)),
  )
}
</script>

<template>
  <div v-if="shown.length" class="riders" role="group" aria-label="Add to this attack">
    <template v-for="o in shown" :key="o.def.key">
      <button
        type="button"
        class="chip rider"
        :aria-pressed="!!picked(o.def.key)"
        :disabled="disabled || (!!o.why && !picked(o.def.key))"
        :title="o.why ? `${o.why}\n${o.title}` : o.title"
        @click="toggle(o)"
      >
        {{ o.def.name }}
      </button>
      <select
        v-if="picked(o.def.key) && o.types.length > 1"
        class="input input--sm rider__type"
        :aria-label="`${o.def.name} damage type`"
        :value="picked(o.def.key)?.type ?? o.types[0]"
        :disabled="disabled"
        @change="setType(o.def.key, ($event.target as HTMLSelectElement).value)"
      >
        <option v-for="t in o.types" :key="t" :value="t">{{ t }}</option>
      </select>
    </template>
  </div>
</template>

<style scoped lang="scss">
.riders {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.rider {
  min-height: 30px;
  padding: 0 10px;
  font-size: 12px;

  &[aria-pressed='true'] {
    border-color: var(--secondary);
    background: color-mix(in srgb, var(--secondary) 18%, transparent);
    color: var(--page-text);
  }

  &:disabled {
    opacity: 0.55;
  }
}

.rider__type {
  width: auto;
  min-height: 30px;
  font-size: 12px;
}

@media (pointer: coarse) {
  .rider,
  .rider__type {
    min-height: 44px;
  }
}
</style>
