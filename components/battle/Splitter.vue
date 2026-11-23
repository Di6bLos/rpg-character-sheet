<script setup lang="ts">
// A drag handle that sits in the gap between two sections. Drag it with the mouse
// or a finger, or focus it and use the arrow keys (Home / End for the limits); a
// click (or Enter / Space) is a `tap`, which the parent gives its own meaning. It reports pixel moves; the parent turns them into
// its own size. `drop` fires when a drag or key press ends, to save.
const props = defineProps<{
  /** `vertical`: a bar between side-by-side sections, dragged sideways. */
  orientation: 'vertical' | 'horizontal'
  label: string
  /** For screen readers: where it is now, 0–100. */
  value: number
  min: number
  max: number
}>()
const emit = defineEmits<{
  move: [delta: number]
  key: [step: 'less' | 'more' | 'min' | 'max']
  drop: []
  /** A click (or Enter / Space) without a drag. */
  tap: []
}>()

const dragging = ref(false)
let last = 0
let travelled = 0

function pos(e: PointerEvent) {
  return props.orientation === 'vertical' ? e.clientX : e.clientY
}

function down(e: PointerEvent) {
  if (e.button !== 0) return
  e.preventDefault()
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  dragging.value = true
  last = pos(e)
  travelled = 0
  document.documentElement.classList.add('is-resizing', `is-resizing--${props.orientation}`)
}

function move(e: PointerEvent) {
  if (!dragging.value) return
  const p = pos(e)
  travelled += Math.abs(p - last)
  if (p !== last) emit('move', p - last)
  last = p
}

function up() {
  if (!dragging.value) return
  dragging.value = false
  document.documentElement.classList.remove('is-resizing', `is-resizing--${props.orientation}`)
  if (travelled < 4) emit('tap')
  emit('drop')
}

function key(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    emit('tap')
    emit('drop')
    return
  }
  const less = props.orientation === 'vertical' ? 'ArrowLeft' : 'ArrowUp'
  const more = props.orientation === 'vertical' ? 'ArrowRight' : 'ArrowDown'
  const step =
    e.key === less
      ? 'less'
      : e.key === more
        ? 'more'
        : e.key === 'Home'
          ? 'min'
          : e.key === 'End'
            ? 'max'
            : null
  if (!step) return
  e.preventDefault()
  emit('key', step)
  emit('drop')
}

onBeforeUnmount(up)
</script>

<template>
  <div
    class="split"
    :class="[`split--${orientation}`, { 'is-dragging': dragging }]"
    role="separator"
    tabindex="0"
    :aria-orientation="orientation"
    :aria-label="label"
    :aria-valuenow="Math.round(value)"
    :aria-valuemin="min"
    :aria-valuemax="max"
    :title="label"
    @pointerdown="down"
    @pointermove="move"
    @pointerup="up"
    @pointercancel="up"
    @lostpointercapture="up"
    @keydown="key"
  >
    <span class="split__grip" aria-hidden="true" />
  </div>
</template>

<style scoped lang="scss">
.split {
  position: relative;
  display: grid;
  place-items: center;
  touch-action: none;
  user-select: none;
  outline: none;

  &--vertical {
    cursor: col-resize;
  }

  &--horizontal {
    cursor: row-resize;
  }
}

// A thin line that shows on hover, focus and while dragging, with a grip in the middle.
.split__grip {
  border-radius: 999px;
  background: var(--line-strong);
  opacity: 0;
  transition: opacity 0.15s;

  .split--vertical & {
    width: 3px;
    height: 36px;
  }

  .split--horizontal & {
    width: 36px;
    height: 3px;
  }

  .split:hover &,
  .split.is-dragging & {
    opacity: 1;
  }

  .split:focus-visible & {
    opacity: 1;
    background: var(--accent);
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .split.is-dragging & {
    background: var(--accent);
  }
}
</style>
