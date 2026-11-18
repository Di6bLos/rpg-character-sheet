<script setup lang="ts">
const props = defineProps<{
  hp: number
  max: number
  tone: '' | 'accent' | 'danger'
  disabled?: boolean
}>()
const emit = defineEmits<{ change: [delta: number] }>()

const track = ref<HTMLElement | null>(null)
const preview = ref<number | null>(null)
const dragging = ref(false)

const shown = computed(() => preview.value ?? props.hp)
const delta = computed(() => shown.value - props.hp)
const pct = (n: number) => (props.max > 0 ? Math.round((n / props.max) * 100) : 0)

function valueAt(x: number): number {
  const rect = track.value?.getBoundingClientRect()
  if (!rect || rect.width <= 0) return props.hp
  const ratio = Math.max(0, Math.min(1, (x - rect.left) / rect.width))
  return Math.round(ratio * props.max)
}

function start(event: PointerEvent) {
  if (props.disabled) return
  dragging.value = true
  track.value?.setPointerCapture(event.pointerId)
  preview.value = valueAt(event.clientX)
}

function move(event: PointerEvent) {
  if (dragging.value) preview.value = valueAt(event.clientX)
}

function commit() {
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
  else if (event.key === 'Enter') return commit()
  else if (event.key === 'Escape') return cancel()
  else return
  event.preventDefault()
}
</script>

<template>
  <div class="hpbar">
    <div
      ref="track"
      class="meter hpbar__track"
      :class="{
        'meter--accent': tone === 'accent',
        'meter--danger': tone === 'danger',
        'is-dragging': preview !== null,
        'is-locked': disabled,
      }"
      role="slider"
      :tabindex="disabled ? -1 : 0"
      aria-label="Hit points: drag or use the arrow keys, then let go or press Enter to apply"
      :aria-valuemin="0"
      :aria-valuemax="max"
      :aria-valuenow="shown"
      :aria-valuetext="delta ? `${shown} HP (${delta > 0 ? '+' : ''}${delta})` : `${shown} HP`"
      @pointerdown="start"
      @pointermove="move"
      @pointerup="commit"
      @pointercancel="cancel"
      @keydown="key"
      @blur="preview !== null && !dragging && cancel()"
    >
      <span :style="{ width: pct(Math.min(shown, hp)) + '%' }" />
      <i
        v-if="delta < 0"
        class="hpbar__loss"
        :style="{ left: pct(shown) + '%', width: pct(-delta) + '%' }"
      />
      <i
        v-if="delta > 0"
        class="hpbar__gain"
        :style="{ left: pct(hp) + '%', width: pct(delta) + '%' }"
      />
      <b v-if="preview !== null" class="hpbar__thumb" :style="{ left: pct(shown) + '%' }" />
    </div>
    <span
      v-if="delta"
      class="hpbar__delta"
      :class="delta < 0 ? 'is-loss' : 'is-gain'"
      :style="{ left: Math.min(80, Math.max(20, pct(shown))) + '%' }"
      aria-live="polite"
    >
      {{ delta < 0 ? `−${-delta} damage` : `+${delta} healing` }} → {{ shown }}
    </span>
  </div>
</template>

<style scoped lang="scss">
.hpbar {
  position: relative;
}

.hpbar__track {
  position: relative;
  height: 14px;
  cursor: ew-resize;
  touch-action: none;
  overflow: visible;

  &.is-locked {
    cursor: default;
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
  }

  > span {
    transition: width 0.15s ease;
  }

  &.is-dragging > span {
    transition: none;
  }
}

.hpbar__loss,
.hpbar__gain {
  position: absolute;
  top: 0;
  bottom: 0;
  border-radius: inherit;
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
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--page-text);
  box-shadow: 0 1px 4px rgb(0 0 0 / 40%);
  transform: translate(-50%, -50%);
}

.hpbar__delta {
  position: absolute;
  z-index: 2;
  bottom: calc(100% + 8px);
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
