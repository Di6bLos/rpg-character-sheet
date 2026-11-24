<script setup lang="ts">
const props = defineProps<{
  hp: number
  max: number
  temp?: number
  tone: '' | 'accent' | 'danger'
  disabled?: boolean
  /** Warding Bond: a hit takes half; the preview shows what lands. */
  warded?: boolean
}>()
const emit = defineEmits<{ change: [delta: number] }>()

const DRAG_PX = 4

const track = ref<HTMLElement | null>(null)
const preview = ref<number | null>(null)
const dragging = ref(false)
const moved = ref(false)
let startX = 0

const shown = computed(() => preview.value ?? props.hp)
const delta = computed(() => shown.value - props.hp)
const damage = computed(() => Math.max(0, -delta.value))
const taken = computed(() => (props.warded ? Math.floor(damage.value / 2) : damage.value))
const absorbed = computed(() => Math.min(Math.max(0, props.temp ?? 0), taken.value))
const result = computed(() =>
  delta.value < 0 ? props.hp - (taken.value - absorbed.value) : shown.value,
)
const label = computed(() =>
  delta.value < 0
    ? `−${damage.value} damage${props.warded ? ` (Warded: you take ${taken.value})` : ''} → ${result.value} HP${absorbed.value ? ` (${absorbed.value} temp absorbed)` : ''}`
    : `+${delta.value} healing → ${result.value} HP`,
)
const pct = (n: number) => (props.max > 0 ? Math.round((n / props.max) * 100) : 0)

function valueAt(x: number): number {
  const rect = track.value?.getBoundingClientRect()
  if (!rect || rect.width <= 0) return props.hp
  const ratio = Math.max(0, Math.min(1, (x - rect.left) / rect.width))
  return Math.round(ratio * props.max)
}

function start(event: PointerEvent) {
  if (props.disabled) return
  const target = event.currentTarget as HTMLElement
  target.setPointerCapture(event.pointerId)
  startX = event.clientX
  moved.value = false
  dragging.value = true
}

function move(event: PointerEvent) {
  if (!dragging.value) return
  if (!moved.value && Math.abs(event.clientX - startX) < DRAG_PX) return
  moved.value = true
  preview.value = valueAt(event.clientX)
}

function release() {
  if (dragging.value && !moved.value) return cancel()
  apply()
}

function apply() {
  dragging.value = false
  const change = delta.value
  preview.value = null
  if (change) emit('change', change)
}

function cancel() {
  dragging.value = false
  preview.value = null
}

function key(event: KeyboardEvent) {
  if (props.disabled) return
  const step = event.shiftKey ? 5 : 1
  const base = preview.value ?? props.hp
  if (event.key === 'ArrowLeft' || event.key === 'ArrowDown')
    preview.value = Math.max(0, base - step)
  else if (event.key === 'ArrowRight' || event.key === 'ArrowUp')
    preview.value = Math.min(props.max, base + step)
  else if (event.key === 'Enter') return apply()
  else if (event.key === 'Escape') return cancel()
  else return
  event.preventDefault()
}
</script>

<template>
  <div
    class="hpbar"
    :class="{ 'is-dragging': preview !== null, 'is-locked': disabled }"
    role="slider"
    :tabindex="disabled ? -1 : 0"
    aria-label="Hit points: drag or use the arrow keys, then let go or press Enter to apply"
    :aria-valuemin="0"
    :aria-valuemax="max"
    :aria-valuenow="shown"
    :aria-valuetext="delta ? label : `${hp} HP`"
    @pointerdown="start"
    @pointermove="move"
    @pointerup="release"
    @pointercancel="cancel"
    @keydown="key"
    @blur="preview !== null && !dragging && cancel()"
  >
    <div
      ref="track"
      class="meter"
      :class="{ 'meter--accent': tone === 'accent', 'meter--danger': tone === 'danger' }"
    >
      <span :style="{ width: pct(Math.min(result, hp)) + '%' }" />
      <i
        v-if="delta < 0 && result < hp"
        class="hpbar__loss"
        :style="{ left: pct(result) + '%', width: pct(hp - result) + '%' }"
      />
      <i
        v-if="delta > 0"
        class="hpbar__gain"
        :style="{ left: pct(hp) + '%', width: pct(delta) + '%' }"
      />
    </div>
    <b v-if="preview !== null" class="hpbar__thumb" :style="{ left: pct(shown) + '%' }" />
    <span
      v-if="delta"
      class="hpbar__delta"
      :class="delta < 0 ? 'is-loss' : 'is-gain'"
      :style="{ left: Math.min(80, Math.max(20, pct(shown))) + '%' }"
      aria-live="polite"
    >
      {{ label }}
    </span>
  </div>
</template>

<style scoped lang="scss">
.hpbar {
  position: relative;
  margin: -8px 0;
  padding: 8px 0;
  cursor: ew-resize;
  touch-action: pan-y;

  &.is-locked {
    cursor: default;
  }

  &:focus-visible {
    outline: none;

    .meter {
      outline: 2px solid var(--accent);
      outline-offset: 3px;
    }
  }

  .meter {
    position: relative;
  }

  &.is-dragging .meter > span {
    transition: none;
  }
}

.hpbar__loss,
.hpbar__gain {
  position: absolute;
  top: 0;
  bottom: 0;
}

.hpbar__loss {
  background: repeating-linear-gradient(
    135deg,
    color-mix(in srgb, var(--danger) 70%, transparent) 0 6px,
    color-mix(in srgb, var(--danger) 40%, transparent) 6px 12px
  );
}

.hpbar__gain {
  background: color-mix(in srgb, var(--success, #4fbf8c) 65%, transparent);
}

.hpbar__thumb {
  position: absolute;
  top: 50%;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--page-text);
  box-shadow: 0 1px 4px rgb(0 0 0 / 40%);
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.hpbar__delta {
  position: absolute;
  z-index: 2;
  bottom: calc(100% + 2px);
  transform: translateX(-50%);
  box-shadow: 0 2px 8px rgb(0 0 0 / 35%);
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  pointer-events: none;

  &.is-loss {
    background: color-mix(in srgb, var(--danger) 22%, var(--field));
    color: var(--danger);
  }

  &.is-gain {
    background: color-mix(in srgb, var(--success, #4fbf8c) 22%, var(--field));
    color: var(--success, #4fbf8c);
  }
}
</style>
