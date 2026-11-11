<script setup lang="ts">
// A "?" button beside a section title that shows its help text as a tooltip:
// on hover or keyboard focus, and pinned open by a tap or click.
const props = defineProps<{ text: string; label: string }>()

const MARGIN = 12
const GAP = 6
/** Time to cross the gap between the button and the tooltip before it closes. */
const HIDE_DELAY = 200

const id = useId()
const root = ref<HTMLElement>()
const button = ref<HTMLButtonElement>()
const tip = ref<HTMLElement>()
const open = ref(false)
const pinned = ref(false)
const position = ref({ left: '0px', top: '0px' })

/** Keeps the tooltip under the button and inside the viewport. */
async function place() {
  await nextTick()
  const anchor = button.value?.getBoundingClientRect()
  const box = tip.value?.getBoundingClientRect()
  if (!anchor || !box) return
  const left = Math.max(
    MARGIN,
    Math.min(anchor.left, document.documentElement.clientWidth - box.width - MARGIN),
  )
  const below = anchor.bottom + GAP
  const fits = below + box.height <= window.innerHeight - MARGIN
  const top = fits ? below : Math.max(MARGIN, anchor.top - GAP - box.height)
  position.value = { left: `${left}px`, top: `${top}px` }
}

function show() {
  open.value = true
  place()
}

let hideTimer: ReturnType<typeof setTimeout> | undefined

function hide() {
  clearTimeout(hideTimer)
  open.value = false
  pinned.value = false
}

// Hover covers the button and the tooltip, so the text can be reached and read.
function onEnter() {
  clearTimeout(hideTimer)
  show()
}

function onLeave() {
  if (pinned.value) return
  clearTimeout(hideTimer)
  hideTimer = setTimeout(hide, HIDE_DELAY)
}

function toggle() {
  pinned.value = !pinned.value
  if (pinned.value) show()
  else open.value = false
}

function onOutside(event: Event) {
  if (open.value && !root.value?.contains(event.target as Node)) hide()
}

onMounted(() => {
  document.addEventListener('pointerdown', onOutside)
  window.addEventListener('scroll', hide, { passive: true })
  window.addEventListener('resize', hide)
})
onBeforeUnmount(() => {
  clearTimeout(hideTimer)
  document.removeEventListener('pointerdown', onOutside)
  window.removeEventListener('scroll', hide)
  window.removeEventListener('resize', hide)
})
</script>

<template>
  <span ref="root" class="help" @mouseenter="onEnter" @mouseleave="onLeave">
    <button
      ref="button"
      type="button"
      class="help__btn"
      :aria-label="props.label"
      :aria-describedby="open ? id : undefined"
      :aria-expanded="open"
      @click="toggle"
      @focus="show"
      @blur="hide"
      @keydown.esc="hide"
    >
      ?
    </button>
    <span v-show="open" :id="id" ref="tip" role="tooltip" class="help__tip" :style="position">
      {{ props.text }}
    </span>
  </span>
</template>

<style scoped lang="scss">
.help {
  display: inline-flex;
}

.help__btn {
  position: relative;
  display: inline-grid;
  place-items: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid var(--line-strong);
  background: transparent;
  color: var(--page-muted);
  font-family: var(--font-body, inherit);
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  cursor: help;

  &:hover,
  &[aria-expanded='true'] {
    color: var(--accent-text);
    border-color: var(--accent);
  }

  // A 44px touch target around the small circle.
  @media (pointer: coarse) {
    &::after {
      content: '';
      position: absolute;
      inset: -12px;
    }
  }
}

.help__tip {
  position: fixed;
  z-index: 40;
  width: max-content;
  max-width: min(320px, calc(100vw - 24px));
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--line-strong);
  background: var(--panel-bg);
  color: var(--page-text);
  box-shadow: 0 8px 24px rgb(0 0 0 / 35%);
  font-family: var(--font-body, inherit);
  font-size: 13px;
  font-weight: 400;
  line-height: 1.5;
  letter-spacing: normal;
  text-transform: none;
}
</style>
