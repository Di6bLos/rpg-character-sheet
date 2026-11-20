<script setup lang="ts">
// A rich tooltip for the element in the default slot: a title, a subtitle, the text
// and a footer line (`keys`: costs, what a click does). It shows on hover and keyboard
// focus, hides on Escape, blur and pointer leave, and opens below the trigger (above
// when there is no room). It is teleported to <body> with a fixed position, so
// scrolling panels never clip it, and the trigger gets `aria-describedby`.
const props = defineProps<{ text?: string; title?: string; sub?: string; keys?: string }>()

const MARGIN = 8
const GAP = 6

const id = useId()
const root = ref<HTMLElement>()
const tip = ref<HTMLElement>()
const open = ref(false)
const position = ref({ left: '0px', top: '0px' })
const has = computed(() => !!(props.text || props.title || props.sub || props.keys))

/** The trigger: the first element in the slot (the wrapper itself has no box). */
function trigger(): HTMLElement | null {
  return (root.value?.firstElementChild as HTMLElement | null) ?? null
}

async function place() {
  await nextTick()
  const anchor = trigger()?.getBoundingClientRect()
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
  if (!has.value) return
  if (!open.value) listen()
  open.value = true
  void place()
}

function hide() {
  open.value = false
  unlisten()
}

// Scrolling or resizing hides an open tooltip; the listeners exist only while it shows.
function listen() {
  window.addEventListener('scroll', hide, { passive: true, capture: true })
  window.addEventListener('resize', hide)
}

function unlisten() {
  window.removeEventListener('scroll', hide, { capture: true })
  window.removeEventListener('resize', hide)
}

function onOut(event: MouseEvent) {
  if (!root.value?.contains(event.relatedTarget as Node | null)) hide()
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) {
    event.stopPropagation()
    hide()
  }
}

// The trigger is the caller's element, so wire it by hand.
function describe() {
  const el = trigger()
  if (!el) return
  if (has.value) el.setAttribute('aria-describedby', id)
  else el.removeAttribute('aria-describedby')
}

onMounted(describe)
onUpdated(describe)
watch(has, describe)
onBeforeUnmount(unlisten)
</script>

<template>
  <span
    ref="root"
    class="tooltip"
    @mouseover="show"
    @mouseout="onOut"
    @focusin="show"
    @focusout="hide"
    @keydown="onKey"
    @click="hide"
  >
    <slot />
    <Teleport to="body">
      <div v-show="open" :id="id" ref="tip" role="tooltip" class="tooltip__tip" :style="position">
        <strong v-if="title" class="tooltip__title">{{ title }}</strong>
        <span v-if="sub" class="tooltip__sub">{{ sub }}</span>
        <p v-if="text" class="tooltip__text">{{ text }}</p>
        <span v-if="keys" class="tooltip__keys">{{ keys }}</span>
      </div>
    </Teleport>
  </span>
</template>

<style scoped lang="scss">
.tooltip {
  display: contents;
}

// Outside any .panel, so it reads the panel palette directly (Cursed parchment too).
.tooltip__tip {
  position: fixed;
  z-index: 60;
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: max-content;
  max-width: min(300px, calc(100vw - 16px));
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--panel-line-strong);
  background: var(--panel-bg);
  color: var(--panel-text);
  box-shadow: 0 12px 32px rgb(0 0 0 / 45%);
  font-family: var(--font-body, inherit);
  font-size: 12px;
  line-height: 1.45;
  pointer-events: none;
}

.tooltip__title {
  font-size: 13px;
}

.tooltip__sub {
  font-size: 11px;
  color: var(--panel-muted);
}

.tooltip__text {
  margin: 0;
  color: var(--panel-soft);
  white-space: pre-line;
}

.tooltip__keys {
  margin-top: 4px;
  padding-top: 6px;
  border-top: 1px solid var(--panel-line);
  font-size: 11px;
  color: var(--panel-muted);
}
</style>
