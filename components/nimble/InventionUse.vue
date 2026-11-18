<script setup lang="ts">
import type { NimbleSheet } from '~/types/sheets'

const props = defineProps<{ name: string }>()

const { draft, canEdit } = useSheet<NimbleSheet>()
const sheet = computed(() => draft.value.sheet)
const { inventions, readied, setReady, resource, operate, left } = useNimbleActions()
const inv = computed(() => inventions.value.find((i) => i.name === props.name))

const modes = [
  { mode: 'tether' as const, label: 'Tether', actions: 1 },
  { mode: 'coil' as const, label: 'Coil', actions: 2 },
]

function modeWhy(actions: number) {
  if (!inv.value) return ''
  if (inv.value.inoperable) return 'Inoperable'
  if (readied.value < inv.value.min) return inv.value.why
  return left.value < actions ? 'Not enough actions' : ''
}
</script>

<template>
  <div v-if="inv" class="use">
    <div class="ready">
      <span>{{ resource?.diceName }} Dice readied</span>
      <button
        type="button"
        class="step step--xs"
        :aria-label="`Ready one fewer ${resource?.diceName} Die`"
        :disabled="!canEdit || readied === 0"
        @click="setReady(readied - 1)"
      >
        −
      </button>
      <strong aria-live="polite">{{ readied }}</strong>
      <button
        type="button"
        class="step step--xs"
        :aria-label="`Ready one more ${resource?.diceName} Die`"
        :disabled="!canEdit || readied >= sheet.resource.count"
        @click="setReady(readied + 1)"
      >
        +
      </button>
      <small class="ready__of">of {{ sheet.resource.count }}</small>
    </div>
    <div v-if="inv.use === 'tether'" class="row" style="gap: 6px; flex-wrap: wrap">
      <button
        v-for="m in modes"
        :key="m.mode"
        type="button"
        class="btn btn--sm"
        :disabled="!canEdit || !!modeWhy(m.actions)"
        :title="modeWhy(m.actions) || undefined"
        @click="operate(inv.name, m.mode)"
      >
        {{ modeWhy(m.actions) || `${m.label} · ${m.actions} action${m.actions === 1 ? '' : 's'}` }}
      </button>
    </div>
    <button
      v-else
      type="button"
      class="btn btn--sm btn--wrap"
      :disabled="!canEdit || !!inv.why"
      :title="inv.why || undefined"
      @click="operate(inv.name)"
    >
      {{ inv.why || inv.label }}
    </button>
  </div>
</template>

<style scoped lang="scss">
.use {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
}

.ready {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--page-soft);

  span {
    margin-right: auto;
  }

  strong {
    min-width: 18px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
}

.ready__of {
  min-width: 34px;
  font-size: 12px;
  color: var(--page-muted);
}
</style>
