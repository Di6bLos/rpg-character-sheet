<script setup lang="ts">
// Phone battle board frame (below 768px): the whole screen (100dvh, the app nav
// steps aside), top to bottom: the bar, the initiative strip, the player's hero strip
// (every tab but Hero), the active tab's content (the only part that scrolls), the last
// result, the turn bar and the bottom tabs. Watchers (no seated hero, or a GM on the
// player board) get no hero strip, result bar or turn bar; the GM gets the turn bar (their
// own, from the `turn` slot) but no hero strip or result bar. A seated player in a system
// without the hero editor (PF2e: `hero` false) is still a player, with the turn bar
// but no hero strip or result bar (both read the editor). The turn bar steps aside
// while the on-screen keyboard is open and on Chat and Scribe. With the keyboard open
// the frame shrinks to what the keyboard leaves and keeps only the bar, the content and
// the result, so the focused input stays in view with room to read (a 360×640 phone has
// about 380px left).
// It sits inside HeroScope (in View, above the frame switch), so `hero` slots can use
// the player's sheet editor and a rotation to the tablet frame keeps it.
import type { useInitiative } from '~/composables/useInitiative'
import { phoneRole, phoneTabs, type PhoneTab } from '~/utils/boardLayout'

const props = defineProps<{
  init: ReturnType<typeof useInitiative>
  /** The frame is inside the player's sheet editor (HeroScope). */
  hero: boolean
}>()
/** `go` switches the bottom tab (Whisper opens Chat, a token opens Creature…). */
defineSlots<{
  strip?: () => unknown
  tab?: (props: { tab: PhoneTab; hero: boolean; go: (tab: PhoneTab) => void }) => unknown
  turn?: (props: { hero: boolean }) => unknown
  dialogs?: (props: { hero: boolean; go: (tab: PhoneTab) => void }) => unknown
  tools?: () => unknown
}>()

const { gmControls, campaign } = useCampaignBoard()
const scribe = useLoreAvailable()
const features = useBattleFeatures()
/**
 * A seated player whose system has no hero editor (the read-only hero card); keep in step
 * with View.vue's `basicHeroId`.
 */
const basicPlayer = computed(
  () => !gmControls.value && !features.value.heroEditor && !!campaign.value?.myCharacterId,
)
const role = computed(() =>
  phoneRole({ gmControls: gmControls.value, hero: props.hero || basicPlayer.value }),
)
const actions = computed(() => features.value.heroEditor)
const tab = usePhoneTab(role, scribe, actions)
const tabs = computed(() => phoneTabs(role.value, scribe.value, actions.value))

function go(next: PhoneTab) {
  if (tabs.value.includes(next)) tab.value = next
}

/** The open tab and `go`, for the GM's selection toast (View). */
defineExpose({ tab, go })

// The app layout hides its nav while this frame is mounted.
const mounted = usePhoneFrameMounted()
onMounted(() => (mounted.value = true))
onBeforeUnmount(() => (mounted.value = false))

const keyboard = useKeyboardOpen()
const viewport = useViewportHeight()
const talking = computed(() => tab.value === 'chat' || tab.value === 'scribe')
const showTurn = computed(() => !keyboard.value && !talking.value)

// Each tab opens at its top.
const content = ref<HTMLElement | null>(null)
watch(tab, () => {
  if (content.value) content.value.scrollTop = 0
})
</script>

<template>
  <div
    class="phone"
    data-track-area="Phone board"
    :style="keyboard && viewport ? { height: `${viewport}px`, flex: 'none' } : undefined"
  >
    <BattlePhoneBar :init="init" :role="role">
      <template v-if="$slots.tools" #tools><slot name="tools" /></template>
    </BattlePhoneBar>
    <div v-if="$slots.strip" v-show="!keyboard" class="phone__strip">
      <slot name="strip" />
    </div>
    <BattleHeroStrip
      v-if="hero && role === 'player' && tab !== 'hero'"
      v-show="!keyboard"
      @go-hero="go('hero')"
    />
    <div
      id="battle-content"
      ref="content"
      class="phone__content"
      :class="{ 'phone__content--fill': talking }"
      role="tabpanel"
      tabindex="-1"
      :aria-labelledby="`phone-tab-${tab}`"
    >
      <slot name="tab" :tab="tab" :hero="hero" :go="go" />
    </div>
    <BattleResultBar v-if="hero && role === 'player'" :init="init" />
    <div v-if="role !== 'watcher' && $slots.turn" v-show="showTurn" class="phone__turn">
      <slot name="turn" :hero="hero" />
    </div>
    <BattlePhoneTabs v-show="!keyboard" v-model="tab" :tabs="tabs" panel-id="battle-content" />
    <slot name="dialogs" :hero="hero" :go="go" />
  </div>
</template>

<style scoped lang="scss">
.phone {
  position: relative;
  // Fills what the layout leaves (a suspended banner takes its height off the top); the
  // open keyboard sets an exact height inline instead.
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding-inline: env(safe-area-inset-left) env(safe-area-inset-right);
  box-sizing: border-box;
}

.phone__strip {
  flex: none;
  min-width: 0;
  border-bottom: 1px solid var(--line);
}

.phone__content {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 12px 14px;
  scrollbar-width: thin;
  scrollbar-color: var(--line-strong) transparent;

  &:focus {
    outline: none;
  }
}

// Chat and Scribe fill the tab; only their message lists scroll.
.phone__content--fill {
  overflow: hidden;
  padding-bottom: 8px;
}

.phone__turn {
  flex: none;
}
</style>
