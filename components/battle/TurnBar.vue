<script setup lang="ts">
// The player's turn bar on the battle board (top of the centre column): whose turn it is,
// the action pips (click to spend or restore), reactions used this round, the Rushed
// note and the sheet's turn steps (useTurnSteps, the same as the sheet's Turn panel).
// The automatic steps as initiative moves run in HeroScope's editor, not here.
import type { useInitiative } from '~/composables/useInitiative'
import type { NimbleSheet } from '~/types/sheets'
import { turnHeadline } from '~/utils/turnSteps'

const props = defineProps<{ init: ReturnType<typeof useInitiative> }>()

const { draft, canEdit } = useSheet<NimbleSheet>()
const announce = useAnnounce()
const {
  sheet,
  perTurn,
  left,
  pips,
  steps,
  typed,
  rushedNote,
  toggleAction,
  extraAction,
  cancelCasting,
  beginTurn,
  finishTurn,
  nextRound,
  startEncounter,
  finishEncounter,
  initiative,
} = useTurnSteps({ onResult: announce })

const headline = computed(() =>
  turnHeadline({
    order: props.init.order.value,
    turnId: props.init.turnId.value,
    round: props.init.round.value,
    mine: draft.value.id,
    turnActive: sheet.value.turnActive,
    inEncounter: sheet.value.inEncounter,
  }),
)

/** The GM's encounter is running (someone has the turn) but this sheet hasn't joined it. */
const joining = computed(() => !!props.init.turnId.value && !sheet.value.inEncounter)

const sub = computed(() =>
  [
    joining.value ? "The GM's encounter is running: join it and roll Initiative." : '',
    sheet.value.inEncounter && sheet.value.initiative != null
      ? `Initiative ${sheet.value.initiative}`
      : '',
    rushedNote.value,
  ]
    .filter(Boolean)
    .join(' · '),
)

const leftText = computed(
  () =>
    `${left.value > perTurn.value ? `${left.value} left (${left.value - perTurn.value} extra)` : `${left.value} of ${perTurn.value} left`}${sheet.value.dying ? ' (Dying)' : ''}`,
)

const reactions = computed(() => {
  const used = [...new Set(sheet.value.reactionsUsed)]
  return used.length ? `${used.join(', ')} used` : 'Ready'
})
</script>

<template>
  <section class="panel turn" :class="{ 'turn--now': sheet.turnActive }" aria-label="Your turn">
    <div class="turn__who">
      <strong class="turn__title" role="status">{{ headline }}</strong>
      <span class="turn__sub">{{ sub }}</span>
    </div>

    <div class="turn__pips" role="group" :aria-label="`Actions: ${leftText}`">
      <button
        v-for="n in pips"
        :key="n"
        type="button"
        class="turn__pip"
        :class="{ on: n <= left, extra: n > perTurn }"
        :aria-label="`${n <= left ? 'Spend' : 'Restore'} action ${n}`"
        :disabled="!canEdit"
        @click="toggleAction(n)"
      />
      <UiTooltip
        title="Extra action"
        text="An ally or ability gave you an extra action (Stim Pack, Chorus of Champions…); it lasts until your turn ends."
      >
        <button
          type="button"
          class="turn__add"
          aria-label="Gain an extra action"
          :disabled="!canEdit"
          @click="extraAction"
        >
          +1
        </button>
      </UiTooltip>
      <span class="turn__left">{{ leftText }}</span>
    </div>

    <div class="turn__react">
      <span>Reactions</span>
      <b>{{ reactions }}</b>
    </div>

    <div class="turn__steps">
      <button
        v-if="steps.includes('encounter')"
        type="button"
        class="btn btn--sm"
        :class="{ 'btn--ghost': !joining }"
        :disabled="!canEdit"
        @click="startEncounter"
      >
        {{ joining ? 'Join encounter' : 'New encounter' }}
      </button>
      <button
        v-if="steps.includes('initiative')"
        type="button"
        class="btn btn--sm"
        :disabled="!canEdit"
        @click="initiative()"
      >
        Roll Initiative
      </button>
      <NimbleDiceEntry
        v-if="typed"
        class="turn__entry"
        label="Your Initiative total"
        action="Set"
        signed
        :disabled="!canEdit"
        @submit="initiative"
      />
      <button
        v-if="steps.includes('endEncounter')"
        type="button"
        class="btn btn--quiet btn--sm"
        :disabled="!canEdit"
        @click="finishEncounter"
      >
        End encounter
      </button>
      <button
        v-if="steps.includes('start')"
        type="button"
        class="btn btn--sm"
        :disabled="!canEdit"
        @click="beginTurn"
      >
        Start turn
      </button>
      <button
        v-else-if="steps.includes('round')"
        type="button"
        class="btn btn--ghost btn--sm"
        :disabled="!canEdit"
        @click="nextRound"
      >
        New round
      </button>
      <button
        v-if="steps.includes('end')"
        type="button"
        class="btn btn--sm"
        :disabled="!canEdit"
        @click="finishTurn"
      >
        End turn
      </button>
    </div>

    <div v-if="sheet.casting.actions" class="turn__casting">
      <span>
        Casting {{ sheet.casting.spell }}: {{ sheet.casting.actions }} more
        {{ sheet.casting.actions === 1 ? 'action' : 'actions' }} on Start turn
      </span>
      <button
        type="button"
        class="btn btn--ghost btn--sm"
        :disabled="!canEdit"
        @click="cancelCasting"
      >
        Stop casting
      </button>
    </div>
  </section>
</template>

<style scoped lang="scss">
.turn {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  padding: 10px 14px;

  &--now {
    border-color: var(--accent);
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--accent) 16%, var(--panel-bg)),
      var(--panel-bg)
    );
  }
}

.turn__who {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1 1 220px;
}

.turn__title {
  font-family: var(--font-heading);
  font-size: 15px;
}

.turn__sub {
  font-size: 12px;
  color: var(--page-muted);
}

.turn__pips {
  display: flex;
  align-items: center;
  gap: 6px;
}

.turn__pip {
  width: 22px;
  height: 22px;
  padding: 0;
  border-radius: 50%;
  border: 2px dashed var(--line-strong);
  background: transparent;

  &.on {
    border: 2px solid var(--secondary);
    background: var(--secondary);
  }

  &.extra.on {
    border-color: var(--accent);
    background: var(--accent);
  }
}

.turn__add {
  height: 22px;
  padding: 0 6px;
  border-radius: 999px;
  border: 1px solid var(--line-strong);
  background: transparent;
  color: var(--page-soft);
  font-size: 11px;
  font-weight: 700;
}

.turn__left {
  margin-left: 4px;
  font-size: 12px;
  color: var(--page-soft);
  white-space: nowrap;
}

.turn__react {
  display: flex;
  flex-direction: column;
  font-size: 11px;
  color: var(--page-muted);
  text-align: right;

  b {
    font-size: 12px;
    color: var(--page-text);
  }
}

.turn__steps {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

.turn__entry {
  max-width: 260px;
}

.turn__casting {
  flex: 1 1 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--page-muted);
}
</style>
