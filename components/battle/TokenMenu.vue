<script setup lang="ts">
// The GM's menu on an initiative token (right-click, or the keyboard's context-menu key):
// make it the acting turn (a token from a round already played goes back to that round;
// Undo in the toast puts the turn back), change its initiative, or remove it from the encounter (asks first).
import type { TurnRow, useInitiative } from '~/composables/useInitiative'
import { turnTo } from '~/utils/initiative'

const props = defineProps<{
  init: ReturnType<typeof useInitiative>
  c: TurnRow
  anchor: HTMLElement | null
  /** Rounds from the current one for the token picked: 0, or negative for a past round. */
  roundOffset: number
}>()
const open = defineModel<boolean>({ required: true })

const snackbar = useSnackbarStore()

const targetRound = computed(() => Math.max(1, props.init.round.value + props.roundOffset))
const canJump = computed(
  () =>
    !!turnTo(
      props.init.order.value,
      props.init.turnId.value,
      props.init.round.value,
      props.c.id,
      props.roundOffset,
    ),
)
const jumpNote = computed(() => {
  if (!canJump.value) return 'Already acting'
  return targetRound.value === props.init.round.value
    ? `Round ${targetRound.value}`
    : `Round ${targetRound.value} (now ${props.init.round.value})`
})

const busy = ref(false)
const gmUndo = useGmUndo()

async function makeActive(close: (refocus?: boolean) => void) {
  if (!canJump.value || busy.value) return
  busy.value = true
  const name = props.c.name
  const round = targetRound.value
  const roundMoved = round !== props.init.round.value
  try {
    const undo = await props.init.jumpTo(props.c.id, props.roundOffset)
    if (!undo) return
    gmUndo?.set(`${name}'s turn`, undo)
    close()
    snackbar.show(`${name}'s turn${roundMoved ? `, round ${round}` : ''}`, 'success', 6000, {
      label: 'Undo',
      run: undo,
    })
  } finally {
    busy.value = false
  }
}

// --- Initiative -----------------------------------------------------------------------
// A number input's v-model hands back a number, or '' when cleared.
const score = ref<number | string>(props.c.initiative_rolled ? props.c.initiative : '')
watch(open, (on) => {
  if (!on) return
  score.value = props.c.initiative_rolled ? props.c.initiative : ''
  confirming.value = false
})
const scoreValue = computed(() => {
  const raw = String(score.value).trim()
  const v = Number(raw)
  return raw !== '' && Number.isInteger(v) ? v : null
})

async function saveScore(close: (refocus?: boolean) => void) {
  const v = scoreValue.value
  if (v === null) return
  if (v !== props.c.initiative || !props.c.initiative_rolled)
    await props.init.setInitiative(props.c, v)
  close()
}

// --- Remove ---------------------------------------------------------------------------
const confirming = ref(false)
const removeBtn = ref<HTMLButtonElement>()

async function askRemove() {
  confirming.value = true
  await nextTick()
  removeBtn.value?.focus()
}

async function remove(close: (refocus?: boolean) => void) {
  if (busy.value) return
  busy.value = true
  try {
    await props.init.remove(props.c)
    close()
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <BattleActionPop v-model="open" :anchor="anchor" :label="`Turn options for ${c.name}`">
    <template #default="{ close }">
      <p class="menu__title">{{ c.name }}</p>
      <button
        type="button"
        class="menu__item"
        :aria-disabled="!canJump || busy || undefined"
        @click="makeActive(close)"
      >
        <span>Make active turn</span>
        <small>{{ jumpNote }}</small>
      </button>

      <form class="menu__score" @submit.prevent="saveScore(close)">
        <label :for="`tok-init-${c.id}`">Initiative</label>
        <input
          :id="`tok-init-${c.id}`"
          v-model="score"
          class="input"
          type="number"
          inputmode="numeric"
          step="1"
        />
        <button type="submit" class="btn btn--sm" :disabled="scoreValue === null">Set</button>
      </form>

      <button
        v-if="!confirming"
        type="button"
        class="menu__item menu__item--danger"
        @click="askRemove"
      >
        <span>Remove from encounter</span>
      </button>
      <div v-else class="menu__confirm" role="group" :aria-label="`Remove ${c.name}?`">
        <span>Remove {{ c.name }}?</span>
        <div class="menu__confirm-btns">
          <button
            ref="removeBtn"
            type="button"
            class="btn btn--sm btn--danger"
            :disabled="busy"
            @click="remove(close)"
          >
            Remove
          </button>
          <button type="button" class="btn btn--sm" @click="confirming = false">Cancel</button>
        </div>
      </div>
    </template>
  </BattleActionPop>
</template>

<style scoped lang="scss">
.menu__title {
  margin: 0 2px 2px;
  font-size: 12px;
  font-weight: 700;
  color: var(--page-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.menu__item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-width: 200px;
  padding: 6px 10px;
  border: 1px solid var(--line);
  border-radius: min(var(--radius-control), 8px);
  background: var(--inset);
  color: var(--page-text);
  font: inherit;
  font-size: 12.5px;
  text-align: left;

  &:hover,
  &:focus-visible {
    border-color: var(--accent);
  }

  &[aria-disabled='true'] {
    opacity: 0.55;
    cursor: not-allowed;
  }

  small {
    font-size: 11px;
    color: var(--page-muted);
  }

  &--danger {
    color: color-mix(in srgb, var(--danger) 55%, var(--page-text));

    &:hover,
    &:focus-visible {
      border-color: var(--danger);
    }
  }
}

.menu__score {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 2px;
  font-size: 12.5px;

  label {
    flex: 1 1 auto;
  }

  .input {
    width: 64px;
    padding: 4px 6px;
  }
}

.menu__confirm {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px 4px 2px;
  font-size: 12.5px;
}

.menu__confirm-btns {
  display: flex;
  gap: 6px;
}
</style>
