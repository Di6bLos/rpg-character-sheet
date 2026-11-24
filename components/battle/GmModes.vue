<script setup lang="ts">
// The initiative rules toggle (Nimble / Classic) in the GM's ⋯ menus: the desktop turn
// bar's and the phone bar's. The picked one has a check and the accent edge. Compact
// (phone): 44px rows.
import type { InitiativeMode } from '~/types'
import { INITIATIVE_MODES } from '~/composables/useGmEncounterTools'

defineProps<{ mode: InitiativeMode; disabled?: boolean; compact?: boolean }>()
const emit = defineEmits<{ pick: [mode: InitiativeMode] }>()

const headId = useId()
</script>

<template>
  <div
    class="gm-modes"
    :class="{ 'gm-modes--compact': compact }"
    role="group"
    :aria-labelledby="headId"
  >
    <span :id="headId" class="gm-modes__h">Initiative rules</span>
    <button
      v-for="m in INITIATIVE_MODES"
      :key="m.mode"
      type="button"
      class="gm-modes__item"
      :aria-pressed="mode === m.mode"
      :disabled="disabled"
      @click="emit('pick', m.mode)"
    >
      {{ m.label }}
      <small>{{ m.note }}</small>
    </button>
  </div>
</template>

<style scoped lang="scss">
.gm-modes {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 4px;
  padding-top: 6px;
  border-top: 1px solid var(--line);
}

.gm-modes__h {
  padding: 0 10px 2px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--page-muted);
}

// The picked rules: a check before the name and the accent edge.
.gm-modes__item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 8px 10px 8px 28px;
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--page-text);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  text-align: left;

  small {
    font-size: 11px;
    font-weight: 400;
    color: var(--page-muted);
  }

  &:hover:not(:disabled) {
    background: var(--accent-tint);
  }

  &:disabled {
    opacity: 0.5;
  }

  &[aria-pressed='true'] {
    background: var(--accent-tint);
    box-shadow: inset 2px 0 0 var(--accent);

    &::before {
      content: '✓';
      position: absolute;
      left: 10px;
      top: 8px;
      color: var(--accent-text);
    }
  }
}

.gm-modes--compact {
  .gm-modes__item {
    min-height: 44px;
    justify-content: center;
    font-size: 14px;

    small {
      font-size: 12px;
    }

    &[aria-pressed='true']::before {
      top: 50%;
      transform: translateY(-50%);
    }
  }
}
</style>
