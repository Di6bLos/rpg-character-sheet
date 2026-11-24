<script setup lang="ts">
// Desktop battle board frame (Nimble, 1024px+): the one-line bar, the initiative
// strip and three columns that fill the viewport under the app nav. On tablet-wide
// (1024–1199px) it is tighter: side columns 270px and 290px by default, lower drag
// minimums and a 400px centre (useBattleLeft / useBattleRight, utils/battleColumns). Only the
// columns scroll; the page itself never does. For players the whole board sits inside
// the seated hero's sheet editor (HeroScope, in View, above the frame switch).
import type { useInitiative } from '~/composables/useInitiative'
import { CENTRE_MIN } from '~/utils/battleColumns'

defineProps<{
  init: ReturnType<typeof useInitiative>
  /** The board is inside the player's sheet editor (HeroScope). */
  hero: boolean
}>()
/** `hero`: the left and centre slots may use the player's sheet editor (HeroScope). */
defineSlots<{
  strip?: () => unknown
  left?: (props: { hero: boolean }) => unknown
  centre?: (props: { hero: boolean }) => unknown
  right?: () => unknown
}>()

const { gmControls } = useCampaignBoard()
// On touch the columns have no splitters or rail: both stay open, at their saved widths on
// a desktop and at the fixed 270px / 290px on tablet-wide.
const { layout, touch } = useBoardLayout()
const wide = computed(() => layout.value === 'tablet-wide')
const left = useBattleLeft()
const right = useBattleRight()

// Both side columns are dragged on their inner edge, all the way to closed (a rail) and
// back (`useColumnHandle`). Neither squeezes the centre column below its minimum (460px,
// 400px on tablet-wide); the CSS caps them the same way when the window shrinks. Each
// handle stays one element while its column opens and closes, so a drag carries on
// through the snap.
const centreMin = computed(() => (wide.value ? CENTRE_MIN.wide : CENTRE_MIN.desktop))
const cols = ref<HTMLElement | null>(null)
const leftEl = ref<HTMLElement | null>(null)
const rightEl = ref<HTMLElement | null>(null)
const leftOpen = computed(() => touch.value || left.state.value.column)
const open = computed(() => touch.value || right.state.value.column)
const leftWidth = computed(() => left.widthFor(gmControls.value))

/** How wide `el` may grow now: its width plus what the centre has beyond its minimum. */
function growLimit(el: HTMLElement | null, max: number) {
  const centre = cols.value?.querySelector<HTMLElement>('.battle__col--centre')
  const centreNow = centre?.getBoundingClientRect().width ?? centreMin.value
  const now = el?.getBoundingClientRect().width ?? 0
  return Math.min(max, now + centreNow - centreMin.value)
}

const leftHandle = useColumnHandle({
  side: 'left',
  bounds: left.bounds,
  open: () => leftOpen.value,
  width: () => leftWidth.value,
  measure: () => leftEl.value?.getBoundingClientRect().width ?? leftWidth.value,
  limit: () => growLimit(leftEl.value, left.bounds.value.max),
  setOpen: left.setColumn,
  setWidth: left.setWidth,
  closeAt: left.closeAt,
  save: left.save,
})

const rightHandle = useColumnHandle({
  side: 'right',
  bounds: right.bounds,
  open: () => open.value,
  width: () => right.width.value,
  measure: () => rightEl.value?.getBoundingClientRect().width ?? right.width.value,
  limit: () => growLimit(rightEl.value, right.bounds.value.max),
  setOpen: right.setColumn,
  setWidth: right.setWidth,
  closeAt: right.closeAt,
  save: right.save,
})

// The board starts under the app nav (and any banner above it): measure where
// so its height is exactly what is left of the viewport.
const el = ref<HTMLElement | null>(null)
const top = ref(0)
function measure() {
  if (el.value) top.value = Math.max(0, el.value.getBoundingClientRect().top + window.scrollY)
}
onMounted(() => {
  measure()
  window.addEventListener('resize', measure)
})
onBeforeUnmount(() => window.removeEventListener('resize', measure))
</script>

<template>
  <div
    ref="el"
    class="battle"
    :style="{
      ...(top ? { '--battle-top': `${top}px` } : {}),
      '--battle-left': leftOpen ? `${leftWidth}px` : 'var(--battle-rail)',
      '--battle-right': open ? `${right.width.value}px` : 'var(--battle-rail)',
      ...(wide
        ? {
            '--battle-left-min': `${left.bounds.value.min}px`,
            '--battle-right-min': `${right.bounds.value.min}px`,
            '--battle-centre-min': `${centreMin}px`,
          }
        : {}),
    }"
  >
    <BattleBar :init="init" :compact="wide" />
    <div v-if="$slots.strip" class="battle__strip">
      <slot name="strip" />
    </div>
    <div ref="cols" class="battle__cols">
      <!-- Kept mounted while closed, like the right column. -->
      <div ref="leftEl" class="battle__side battle__side--left" :class="{ 'is-closed': !leftOpen }">
        <BattleSplitter
          v-if="!touch"
          class="battle__split"
          orientation="vertical"
          :label="
            leftOpen
              ? `Resize the ${gmControls ? 'stat block' : 'hero'} column: drag, or click to close`
              : `The ${gmControls ? 'stat block' : 'hero'} column is closed: click or drag right to open`
          "
          :value="leftOpen ? leftWidth : 0"
          :min="0"
          :max="left.bounds.value.max"
          @move="leftHandle.onMove"
          @key="leftHandle.onKey"
          @drop="leftHandle.onDrop"
          @tap="leftHandle.onTap"
        />
        <div v-show="leftOpen" class="battle__col battle__col--left">
          <slot name="left" :hero="hero" />
        </div>
      </div>
      <div class="battle__col battle__col--centre"><slot name="centre" :hero="hero" /></div>
      <!-- One element open or closed: the chat keeps its draft and live updates, and the
           handle keeps the pointer through a drag that opens or closes the column. -->
      <div ref="rightEl" class="battle__side battle__side--right" :class="{ 'is-closed': !open }">
        <BattleSplitter
          v-if="!touch"
          class="battle__split"
          orientation="vertical"
          :label="
            open
              ? 'Resize party and chat: drag, or click to close'
              : 'Party and chat are closed: click or drag left to open'
          "
          :value="open ? right.width.value : 0"
          :min="0"
          :max="right.bounds.value.max"
          @move="rightHandle.onMove"
          @key="rightHandle.onKey"
          @drop="rightHandle.onDrop"
          @tap="rightHandle.onTap"
        />
        <BattleRightRail v-if="!open && !touch" />
        <div v-show="open" class="battle__col battle__col--right">
          <slot name="right" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.battle {
  // A closed side column's rail.
  --battle-rail: 22px;
  height: calc(100dvh - var(--battle-top, 69px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.battle__strip {
  padding: 12px 20px 0;
  min-width: 0;

  @media (max-height: 820px) {
    padding-top: 6px;
  }
}

.battle__cols {
  flex: 1 1 0;
  display: grid;
  // Each side column is as wide as dragged (or the rail), but never leaves the centre
  // under 460px (tablet-wide: 400px and lower minimums, set inline): 28px is the two gaps.
  grid-template-columns:
    min(
      var(--battle-left),
      max(
        var(--battle-left-min, 240px),
        calc(100% - var(--battle-right) - 28px - var(--battle-centre-min, 460px))
      )
    )
    minmax(0, 1fr)
    min(
      var(--battle-right),
      max(
        var(--battle-right-min, 260px),
        calc(100% - var(--battle-left) - 28px - var(--battle-centre-min, 460px))
      )
    );
  grid-template-rows: minmax(0, 1fr);
  gap: 14px;
  padding: 14px 20px 20px;
  min-height: 0;
}

.battle__side {
  position: relative;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;

  > .battle__col {
    flex: 1 1 0;
  }
}

// Open: the handle fills the gap beside the column (right of the left one, left of the
// right one). Closed: the whole rail is the handle, drawn as a slim panel edge.
.battle__split {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 14px;
  z-index: 1;

  .battle__side--left > & {
    right: -14px;
  }

  .battle__side--right > & {
    left: -14px;
  }

  .is-closed > & {
    left: 0;
    right: auto;
    width: 100%;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--panel-bg);

    &:hover {
      border-color: var(--accent);
    }

    :deep(.split__grip) {
      opacity: 1;
    }
  }
}

.battle__col {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--line-strong) transparent;
}
</style>
