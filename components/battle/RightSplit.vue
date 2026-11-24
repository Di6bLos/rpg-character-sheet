<script setup lang="ts">
// The handle between the Party and Chat panels: drag it up or down to share the
// right column between them, all the way to closing either one (a panel dragged
// smaller than RIGHT_CLOSE_PX snaps closed: the Party to its header line, Chat to a
// strip with the missed messages). A click shares the column half and half; a click on
// either panel's header gives that panel the full height. Shown while the Party has heroes.
import type { RosterEntry } from '~/types'
import { RIGHT_CLOSE_PX, RIGHT_SPLIT } from '~/composables/useBattleRight'

const props = defineProps<{ roster: RosterEntry[]; gm: boolean }>()

const right = useBattleRight()
const auth = useAuthStore()
const el = ref<HTMLElement | null>(null)

const hasHeroes = computed(() =>
  props.roster.some((r) => !!r.character_id && (props.gm || r.user_id !== auth.userId)),
)

/** The two panels' combined height: the column minus this handle's gap. */
function room() {
  return Math.max(1, (el.value?.parentElement?.clientHeight ?? 1) - 14)
}

let drag: number | null = null

/** Snaps a share that leaves either panel smaller than the close size to closing it. */
function apply(share: number, save: boolean) {
  const close = RIGHT_CLOSE_PX / room()
  right.setSplit(share < close ? 0 : share > 1 - close ? 1 : share, save)
}
function onMove(delta: number) {
  drag = (drag ?? right.state.value.split) + delta / room()
  apply(drag, false)
}
function onKey(step: 'less' | 'more' | 'min' | 'max') {
  const now = right.state.value.split
  if (step === 'min') return right.setSplit(0, false)
  if (step === 'max') return right.setSplit(1, false)
  const close = RIGHT_CLOSE_PX / room()
  // Out of a closed end, the first key press opens to the close size.
  if (now <= 0 && step === 'more') return right.setSplit(close, false)
  if (now >= 1 && step === 'less') return right.setSplit(1 - close, false)
  apply(now + (step === 'more' ? 0.05 : -0.05), false)
}
/** A click shares the column half and half (a header click gives one panel all of it). */
function onTap() {
  right.setSplit(RIGHT_SPLIT.initial, false)
}
function onDrop() {
  drag = null
  right.save()
}
</script>

<template>
  <div v-if="hasHeroes" ref="el" class="rsplit">
    <BattleSplitter
      class="rsplit__bar"
      orientation="horizontal"
      label="Resize party and chat panels: drag, or click to share them half and half"
      :value="right.state.value.split * 100"
      :min="0"
      :max="100"
      @move="onMove"
      @key="onKey"
      @drop="onDrop"
      @tap="onTap"
    />
  </div>
</template>

<style scoped lang="scss">
// Sits exactly in the column's 14px gap between the two panels (the negative
// margins cancel the gap this element adds).
.rsplit {
  flex: none;
  height: 14px;
  margin-block: -14px;
  display: flex;
}

.rsplit__bar {
  flex: 1;
}
</style>
