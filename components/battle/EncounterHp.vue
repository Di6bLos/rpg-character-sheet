<script setup lang="ts">
// An encounter card's HP: the bar with numbers, then −5 / −N / amount / +N / +5, where N
// is the amount typed (1 when empty). Emits the change; the card decides where it goes.
// The default slot lands at the end of the bar's row (the card's action pips).
// Compact (phone): 44px buttons and field, 8px apart.
const props = defineProps<{
  name: string
  now: number
  max: number
  temp?: number
  slain: boolean
  compact?: boolean
}>()
const emit = defineEmits<{ change: [delta: number] }>()

const fill = computed(() => (props.max > 0 ? Math.min(1, Math.max(0, props.now / props.max)) : 0))
const amount = ref<number | null>(null)
const typed = computed(() => {
  const n = Math.floor(Math.abs(Number(amount.value)))
  return Number.isFinite(n) && n > 0 ? Math.min(999, n) : 0
})

function stepTyped(sign: 1 | -1) {
  emit('change', sign * (typed.value || 1))
  amount.value = null
}
</script>

<template>
  <div class="eh__hp">
    <span class="eh__bar" aria-hidden="true">
      <i :class="{ 'is-low': fill <= 0.5 }" :style="{ width: `${fill * 100}%` }" />
    </span>
    <span class="eh__num"
      >{{ slain ? 'Slain' : `${now}/${max}` }}<small v-if="temp"> +{{ temp }}</small></span
    >
    <!-- The card's action pips sit on this row. -->
    <slot />
  </div>
  <div
    v-if="!slain"
    class="eh__quick"
    :class="{ 'eh__quick--compact': compact }"
    role="group"
    :aria-label="`${name} hit points`"
    @click.stop
  >
    <button type="button" :aria-label="`${name}: lose 5 HP`" @click="emit('change', -5)">−5</button>
    <button type="button" :aria-label="`${name}: lose ${typed || 1} HP`" @click="stepTyped(-1)">
      −{{ typed || 1 }}
    </button>
    <input
      v-model.number="amount"
      type="number"
      min="1"
      max="999"
      placeholder="±"
      :aria-label="`Amount for ${name}`"
    />
    <button type="button" :aria-label="`${name}: gain ${typed || 1} HP`" @click="stepTyped(1)">
      +{{ typed || 1 }}
    </button>
    <button type="button" :aria-label="`${name}: gain 5 HP`" @click="emit('change', 5)">+5</button>
  </div>
</template>

<style scoped lang="scss">
.eh__hp {
  display: flex;
  gap: 8px;
  align-items: center;
}

.eh__bar {
  flex: 1 1 auto;
  min-width: 0;
  height: 8px;
  border-radius: 4px;
  background: var(--track);
  overflow: hidden;

  i {
    display: block;
    height: 100%;
    background: var(--secondary);

    &.is-low {
      background: var(--danger);
    }
  }
}

.eh__num {
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;

  small {
    font-weight: 600;
    color: var(--page-muted);
  }
}

.eh__quick {
  display: flex;
  gap: 4px;
  cursor: default;

  button,
  input {
    min-width: 0;
    height: 26px;
    border: 1px solid var(--line-strong);
    border-radius: 6px;
    font: inherit;
    font-size: 11px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  button {
    flex: 1 1 0;
    padding: 0;
    background: var(--panel-bg);
    color: var(--page-text);

    &:hover {
      border-color: var(--accent);
    }
  }

  input {
    flex: 0 0 48px;
    width: 48px;
    background: var(--field);
    color: var(--page-text);
    text-align: center;
    appearance: textfield;

    &::-webkit-inner-spin-button,
    &::-webkit-outer-spin-button {
      appearance: none;
      margin: 0;
    }
  }
}

.eh__quick--compact {
  gap: 8px;

  button,
  input {
    height: 44px;
    font-size: 14px;
  }

  input {
    flex-basis: 56px;
    width: 56px;
    // 16px keeps iOS from zooming in on focus.
    font-size: 16px;
  }
}
</style>
