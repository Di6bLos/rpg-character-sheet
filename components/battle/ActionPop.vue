<script setup lang="ts">
// A small popover under an action tile (the Opportunity Attack / Help picker, the upcast
// control). Teleported to <body> with a fixed position so the scrolling action list
// doesn't clip it; closes on Escape (focus goes back to the tile), an outside click,
// scrolling or resizing.
const props = defineProps<{ anchor: HTMLElement | null; label: string }>()
const open = defineModel<boolean>({ required: true })

const MARGIN = 8
const GAP = 4

const box = ref<HTMLElement>()
const position = ref({ left: '0px', top: '0px', minWidth: '0px' })

async function place() {
  await nextTick()
  const a = props.anchor?.getBoundingClientRect()
  const b = box.value?.getBoundingClientRect()
  if (!a || !b) return
  const left = Math.max(
    MARGIN,
    Math.min(a.left, document.documentElement.clientWidth - b.width - MARGIN),
  )
  const below = a.bottom + GAP
  const top =
    below + b.height <= window.innerHeight - MARGIN
      ? below
      : Math.max(MARGIN, a.top - GAP - b.height)
  position.value = { left: `${left}px`, top: `${top}px`, minWidth: `${a.width}px` }
  const first =
    box.value?.querySelector<HTMLElement>('button:not([aria-disabled="true"]):not(:disabled)') ??
    box.value?.querySelector<HTMLElement>('button')
  first?.focus()
}

function close(refocus = false) {
  if (!open.value) return
  open.value = false
  if (refocus) props.anchor?.focus()
}

function onOutside(event: Event) {
  const target = event.target as Node
  if (box.value?.contains(target) || props.anchor?.contains(target)) return
  close()
}

function onScroll(event: Event) {
  if (!box.value?.contains(event.target as Node)) close()
}

const onResize = () => close()

function unlisten() {
  document.removeEventListener('pointerdown', onOutside)
  window.removeEventListener('scroll', onScroll, { capture: true })
  window.removeEventListener('resize', onResize)
}

watch(open, (now) => {
  if (!now) return unlisten()
  void place()
  document.addEventListener('pointerdown', onOutside)
  window.addEventListener('scroll', onScroll, { passive: true, capture: true })
  window.addEventListener('resize', onResize)
})
onBeforeUnmount(unlisten)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      ref="box"
      class="pop panel"
      role="group"
      :aria-label="label"
      :style="position"
      @keydown.esc.stop="close(true)"
    >
      <slot :close="close" />
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.pop {
  position: fixed;
  z-index: 55;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: min(320px, calc(100vw - 16px));
  padding: 8px;
  border-color: var(--line-strong);
  box-shadow: var(--shadow-pop);
}
</style>
