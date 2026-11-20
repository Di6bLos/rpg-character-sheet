<script setup lang="ts">
// Desktop battle board frame (Nimble, 1200px+): the one-line bar, the initiative
// strip and three columns that fill the viewport under the app nav. Only the
// columns scroll; the page itself never does. For players the left and centre
// columns share the seated hero's sheet editor (HeroScope).
import type { useInitiative } from '~/composables/useInitiative'
import { RIGHT_WIDTH } from '~/composables/useBattleRight'

defineProps<{
  init: ReturnType<typeof useInitiative>
  /** Whose turn it is (a hero's character id), for the player's automatic turn steps. */
  turnCharacterId: string | null
  round: number | null
  downSummons: string[]
}>()
/** `hero`: the left and centre slots are inside the player's sheet editor (HeroScope). */
defineSlots<{
  strip?: () => unknown
  left?: (props: { hero: boolean }) => unknown
  centre?: (props: { hero: boolean }) => unknown
  right?: () => unknown
}>()

const { gmControls } = useCampaignBoard()
const right = useBattleRight()

// The right column's width: dragged on its left edge, all the way to closed (the
// rail) and back. It never squeezes the centre column below CENTRE_MIN; the CSS caps
// it the same way when the window shrinks. The handle stays one element while the
// column opens and closes, so a drag carries on through the snap.
const CENTRE_MIN = 460
const cols = ref<HTMLElement | null>(null)
const rightEl = ref<HTMLElement | null>(null)
const open = computed(() => right.state.value.column)
let dragWidth: number | null = null

function currentWidth() {
  return open.value ? (rightEl.value?.getBoundingClientRect().width ?? right.state.value.width) : 0
}
function widthLimit() {
  const centre = cols.value?.querySelector<HTMLElement>('.battle__col--centre')
  const centreNow = centre?.getBoundingClientRect().width ?? CENTRE_MIN
  const rightNow = rightEl.value?.getBoundingClientRect().width ?? 0
  return Math.min(RIGHT_WIDTH.max, rightNow + centreNow - CENTRE_MIN)
}
/** Narrower than the close point: closed; otherwise open at that width (at least the minimum). */
function applyWidth(px: number, save: boolean) {
  if (px < RIGHT_WIDTH.close) right.setColumn(false, save)
  else right.setWidth(Math.min(px, widthLimit()), save)
}
/** Dragging the closed rail left this far opens the column at its minimum width. */
const OPEN_PULL = 24
// Whether this drag began on the closed rail: only then does a short pull open it
// (a drag that closes the column mid-way must stay closed while it carries on).
let fromRail = false
/** The width the drag began at, kept for reopening when the drag closes the column. */
let startWidth = 0
function onWidthMove(delta: number) {
  if (dragWidth === null) {
    fromRail = !open.value
    dragWidth = currentWidth()
    startWidth = open.value ? right.state.value.width : 0
  }
  dragWidth -= delta
  if (fromRail && !open.value) {
    if (dragWidth < OPEN_PULL) return
    dragWidth = RIGHT_WIDTH.min
  }
  applyWidth(dragWidth, false)
}
/** A click on the handle opens or closes the column (it reopens at its last width). */
function onWidthTap() {
  if (open.value) right.closeAt(right.state.value.width)
  else right.setWidth(right.state.value.width)
}
function onWidthKey(step: 'less' | 'more' | 'min' | 'max') {
  const now = currentWidth()
  // The handle is on the column's left edge: Left widens it, Right narrows it; End closes it.
  if (step === 'max') return right.setColumn(false, false)
  if (step === 'min') return applyWidth(RIGHT_WIDTH.max, false)
  if (!open.value) return step === 'less' ? applyWidth(right.state.value.width, false) : undefined
  applyWidth(step === 'less' ? now + 24 : Math.max(now - 24, RIGHT_WIDTH.close - 1), false)
}
function onWidthDrop() {
  // Dragged shut: a click reopens it at the width it had before.
  if (!open.value && startWidth) right.closeAt(startWidth)
  else right.save()
  dragWidth = null
  fromRail = false
  startWidth = 0
}
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
    :class="{ 'battle--gm': gmControls, 'battle--rail': !open }"
    :style="{
      ...(top ? { '--battle-top': `${top}px` } : {}),
      '--battle-right': `${right.state.value.width}px`,
    }"
  >
    <BattleBar :init="init" />
    <div v-if="$slots.strip" class="battle__strip">
      <slot name="strip" />
    </div>
    <div ref="cols" class="battle__cols">
      <BattleHeroScope
        v-slot="{ hero }"
        :turn-character-id="turnCharacterId"
        :round="round"
        :down-summons="downSummons"
      >
        <div class="battle__col battle__col--left"><slot name="left" :hero="hero" /></div>
        <div class="battle__col battle__col--centre"><slot name="centre" :hero="hero" /></div>
      </BattleHeroScope>
      <!-- One element open or closed: the chat keeps its draft and live updates, and the
           handle keeps the pointer through a drag that opens or closes the column. -->
      <div ref="rightEl" class="battle__right" :class="{ 'is-closed': !open }">
        <BattleSplitter
          class="battle__split"
          orientation="vertical"
          :label="
            open
              ? 'Resize party and chat: drag, or click to close'
              : 'Party and chat are closed: click or drag left to open'
          "
          :value="open ? right.state.value.width : 0"
          :min="0"
          :max="RIGHT_WIDTH.max"
          @move="onWidthMove"
          @key="onWidthKey"
          @drop="onWidthDrop"
          @tap="onWidthTap"
        />
        <BattleRightRail v-if="!open" />
        <div v-show="open" class="battle__col battle__col--right">
          <slot name="right" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.battle {
  --battle-left: 320px;
  height: calc(100dvh - var(--battle-top, 69px));
  display: flex;
  flex-direction: column;
  overflow: hidden;

  &--gm {
    --battle-left: 340px;
  }
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
  // The right column is as wide as dragged, but never leaves the centre under 460px.
  grid-template-columns:
    var(--battle-left) minmax(0, 1fr)
    min(var(--battle-right), max(260px, calc(100% - var(--battle-left) - 28px - 460px)));

  .battle--rail & {
    grid-template-columns: var(--battle-left) minmax(0, 1fr) 22px;
  }
  grid-template-rows: minmax(0, 1fr);
  gap: 14px;
  padding: 14px 20px 20px;
  min-height: 0;
}

.battle__right {
  position: relative;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;

  > .battle__col {
    flex: 1 1 0;
  }
}

// Open: the handle fills the gap left of the column. Closed: the whole rail is the
// handle, drawn as a slim panel edge.
.battle__split {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -14px;
  width: 14px;
  z-index: 1;

  .is-closed > & {
    left: 0;
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
