<script setup lang="ts">
// Tablet battle board frame (Nimble, portrait, 768–1023px): the bar (tablet variant, with
// buttons for Party, Chat and Scribe), the full-size initiative strip and two columns
// under the app nav: the hero column for players or the GM's stat block on the left
// (290px), and the turn bar above the actions or the encounter grid in the centre. Party,
// Chat and Scribe open in a drawer from the right (Drawer, `drawer` slot) over the
// actions. Only the columns scroll; the page itself never does. It sits inside HeroScope
// (in View, above the frame switch), so a rotation to or from the desktop board keeps
// the hero's sheet editor.
import type { useInitiative } from '~/composables/useInitiative'
import type { DrawerTab } from '~/composables/useBattleRight'

defineProps<{
  init: ReturnType<typeof useInitiative>
  /** The board is inside the player's sheet editor (HeroScope). */
  hero: boolean
}>()
/** `hero`: the left, turn and centre slots may use the player's sheet editor (HeroScope). */
defineSlots<{
  strip?: () => unknown
  left?: (props: { hero: boolean }) => unknown
  /** The top of the centre column, which stays put while the rest scrolls. */
  turn?: (props: { hero: boolean }) => unknown
  centre?: (props: { hero: boolean }) => unknown
  drawer?: (props: { tab: DrawerTab }) => unknown
}>()

const right = useBattleRight()
const scribe = useLoreAvailable()
const tabs = computed<DrawerTab[]>(() => [
  'party',
  'chat',
  ...(scribe.value ? ['scribe' as const] : []),
])
const drawer = computed({
  get: () =>
    right.drawer.value && tabs.value.includes(right.drawer.value) ? right.drawer.value : null,
  set: (tab: DrawerTab | null) => right.openDrawer(tab),
})
// Rotating to a wider layout leaves no drawer open to come back to.
onBeforeUnmount(() => right.openDrawer(null))

// The board starts under the app nav (and any banner above it), as the desktop board:
// measure where so its height is exactly what is left of the viewport.
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
    class="tablet"
    data-track-area="Tablet board"
    :style="top ? { '--battle-top': `${top}px` } : undefined"
  >
    <BattleBar :init="init" variant="tablet" :scribe="scribe" />
    <div v-if="$slots.strip" class="tablet__strip">
      <slot name="strip" />
    </div>
    <div class="tablet__cols">
      <div class="tablet__col tablet__col--left">
        <slot name="left" :hero="hero" />
      </div>
      <div class="tablet__centre">
        <div v-if="$slots.turn" class="tablet__turn">
          <slot name="turn" :hero="hero" />
        </div>
        <div class="tablet__col tablet__col--centre">
          <slot name="centre" :hero="hero" />
        </div>
      </div>
    </div>
    <BattleDrawer v-model="drawer" :tabs="tabs">
      <template #default="{ tab }">
        <slot name="drawer" :tab="tab" />
      </template>
    </BattleDrawer>
  </div>
</template>

<style scoped lang="scss">
.tablet {
  height: calc(100dvh - var(--battle-top, 69px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.tablet__strip {
  padding: 10px 16px 0;
  min-width: 0;
}

.tablet__cols {
  flex: 1 1 0;
  display: grid;
  grid-template-columns: 290px minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  gap: 12px;
  padding: 12px 16px 16px;
  min-height: 0;
}

.tablet__centre {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tablet__turn {
  flex: none;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

// The GM's turn bar is the phone's one-row bar (New round, Next ▶), drawn there as an edge
// above the tabs; here it heads the column, so it gets the panel's own frame back.
.tablet__turn > :deep(.panel) {
  border-width: 1px;
  border-radius: var(--radius-panel);
}

.tablet__col {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--line-strong) transparent;
}

.tablet__col--centre {
  flex: 1 1 0;
}
</style>
