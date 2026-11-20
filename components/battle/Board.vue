<script setup lang="ts">
// Desktop battle board frame (Nimble, 1200px+): the one-line bar, the initiative
// strip and three columns that fill the viewport under the app nav. Only the
// columns scroll; the page itself never does. For players the left and centre
// columns share the seated hero's sheet editor (HeroScope).
import type { useInitiative } from '~/composables/useInitiative'

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
    :class="{ 'battle--gm': gmControls }"
    :style="top ? { '--battle-top': `${top}px` } : undefined"
  >
    <BattleBar :init="init" />
    <div v-if="$slots.strip" class="battle__strip">
      <slot name="strip" />
    </div>
    <div class="battle__cols">
      <BattleHeroScope
        v-slot="{ hero }"
        :turn-character-id="turnCharacterId"
        :round="round"
        :down-summons="downSummons"
      >
        <div class="battle__col battle__col--left"><slot name="left" :hero="hero" /></div>
        <div class="battle__col battle__col--centre"><slot name="centre" :hero="hero" /></div>
      </BattleHeroScope>
      <div class="battle__col battle__col--right"><slot name="right" /></div>
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
  grid-template-columns: var(--battle-left) minmax(0, 1fr) 340px;
  grid-template-rows: minmax(0, 1fr);
  gap: 14px;
  padding: 14px 20px 20px;
  min-height: 0;
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
