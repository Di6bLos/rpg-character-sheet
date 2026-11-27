<script setup lang="ts">
// The draggable HP bar of the Nimble and PF2e sheets and the battle board: a drag of 4px or
// more, or the arrow keys, previews the change (temp HP and the system's `takes` rule
// included, utils/hpPreview.ts); release or Enter applies it, Esc cancels, a tap does nothing.
import { type HpTakes, hpPreview } from '~/utils/hpPreview'

const props = defineProps<{
  hp: number
  max: number
  temp?: number
  tone: '' | 'accent' | 'danger'
  disabled?: boolean
  /** What a hit lands (Nimble's Warded half, PF2e's Shield Block); the preview shows it. */
  takes?: HpTakes
}>()
const emit = defineEmits<{ change: [delta: number] }>()

const DRAG_PX = 4

const track = ref<HTMLElement | null>(null)
const preview = ref<number | null>(null)
const dragging = ref(false)
const moved = ref(false)
let startX = 0

const shown = computed(() => preview.value ?? props.hp)
const view = computed(() =>
  hpPreview({ hp: props.hp, shown: shown.value, temp: props.temp, takes: props.takes }),
)
const delta = computed(() => view.value.delta)
const result = computed(() => view.value.result)
const label = computed(() => view.value.label)
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

  // A 44px tall strip to grab on touch screens.
  @media (pointer: coarse) {
    margin: -4px 0;
    padding: 18px 0;
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
