<script setup lang="ts">
// The phone board's last action result, pinned above the turn bar so it isn't lost below
// the tab's scroll. It carries what the action panel shows (the full text of a shortened
// own-dice line in its title). A normal result fades after 6 seconds; a tap dismisses
// it. With Manual dice it stays until tapped or the turn changes, since the player still
// has to roll. While the last tile or turn step can be undone it stays, with an Undo
// button beside it (`useActionUndo`).
import type { useInitiative } from '~/composables/useInitiative'
import type { NimbleSheet } from '~/types/sheets'

const props = defineProps<{ init: ReturnType<typeof useInitiative> }>()

const HIDE_MS = 6000

const { draft } = useSheet<NimbleSheet>()
const result = useBattleResult()
const undo = useActionUndo()
const shown = ref(false)
/** The 6 seconds are up; the bar waits only for its Undo to go. */
let expired = false
let timer: ReturnType<typeof setTimeout> | undefined

function hide() {
  shown.value = false
  clearTimeout(timer)
}

function expire() {
  expired = true
  if (!undo?.label.value) hide()
}

watch(result.seq, () => {
  if (!result.text.value) return hide()
  shown.value = true
  expired = false
  clearTimeout(timer)
  if (!draft.value.sheet.ownDice) timer = setTimeout(expire, HIDE_MS)
})

watch(
  () => undo?.label.value,
  (label) => {
    if (!label && expired) hide()
  },
)

watch(
  () => props.init.turnId.value,
  () => {
    if (draft.value.sheet.ownDice) hide()
  },
)

onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div class="rb-wrap" role="status" aria-live="polite">
    <Transition name="rb">
      <div v-if="shown" class="rb-row">
        <button
          type="button"
          class="rb"
          data-track="Dismiss result"
          :title="result.detail.value || undefined"
          @click="hide"
        >
          <span class="rb__text">{{ result.text.value }}</span>
          <span class="rb__posted">Posted to party chat</span>
          <span class="sr-only">Tap to dismiss</span>
        </button>
        <button
          v-if="undo?.label.value"
          type="button"
          class="rb__undo"
          data-track="Undo action"
          :aria-label="`Undo ${undo.label.value}`"
          @click="undo.undo()"
        >
          Undo
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped lang="scss">
.rb-wrap {
  flex: none;
}

.rb {
  all: unset;
  box-sizing: border-box;
  width: 100%;
  min-height: 44px;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 10px;
  padding: 8px 14px;
  border-top: 1px solid color-mix(in srgb, var(--ok-text) 30%, transparent);
  background: var(--ok-bg);
  color: var(--ok-text);
  font-size: 13px;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
}

.rb-row {
  display: flex;
  align-items: stretch;
  background: var(--ok-bg);
  border-top: 1px solid color-mix(in srgb, var(--ok-text) 30%, transparent);

  .rb {
    flex: 1 1 auto;
    border-top: 0;
  }
}

// A 44px touch target at the bar's right end.
.rb__undo {
  all: unset;
  flex: none;
  min-width: 64px;
  min-height: 44px;
  display: grid;
  place-items: center;
  padding: 0 12px;
  border-left: 1px solid color-mix(in srgb, var(--ok-text) 30%, transparent);
  color: var(--ok-text);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
}

.rb__text {
  flex: 1 1 auto;
  min-width: 0;
  font-weight: 600;
}

.rb__posted {
  margin-left: auto;
  font-size: 11px;
  opacity: 0.85;
}

.rb-enter-active,
.rb-leave-active {
  transition: opacity 0.25s ease;
}

.rb-enter-from,
.rb-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .rb-enter-active,
  .rb-leave-active {
    transition: none;
  }
}
</style>
