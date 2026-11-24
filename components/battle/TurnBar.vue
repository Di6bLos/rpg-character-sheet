<script setup lang="ts">
// The player's turn bar on the battle board (top of the centre column): whose turn it is,
// the action pips (click to spend or restore), reactions used this round, the Rushed
// note and the sheet's turn steps (useTurnSteps, the same as the sheet's Turn panel).
// The automatic steps as initiative moves run in HeroScope's editor, not here.
// Compact (phone): one row above the tab bar: the headline with the actions left and
// reactions as its sub line, touch-sized pips and the step button.
// On touch (any width: tablets, touch desktops) the full bar keeps all it shows, with the
// pips, "+1" and the step buttons as 44px targets 8px apart.
import type { useInitiative } from '~/composables/useInitiative'
import type { NimbleSheet } from '~/types/sheets'
import { turnHeadline } from '~/utils/turnSteps'

const props = defineProps<{ init: ReturnType<typeof useInitiative>; compact?: boolean }>()

const { draft, canEdit } = useSheet<NimbleSheet>()
const { touch } = useBoardLayout()
const announce = useAnnounce()
const {
  sheet,
  gmEncounter,
  perTurn,
  left,
  pips,
  steps,
  typed,
  unsent,
  resendInitiative,
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

// "Goblin F is acting · round 3": the bar shows the first part as the title and moves the
// rest to the start of the sub line, so the title fits beside the pips at 1200px.
const headMain = computed(() => headline.value.split(' · ')[0] ?? headline.value)
const headTail = computed(() => {
  const tail = headline.value.split(' · ').slice(1).join(' · ')
  return tail && tail.charAt(0).toUpperCase() + tail.slice(1)
})

/**
 * The GM's encounter is running (someone has the turn) but this hero isn't on the tracker:
 * seated heroes join on their own.
 */
const joining = computed(
  () => !!props.init.turnId.value && !sheet.value.inEncounter && !gmEncounter.value,
)
/** In the GM's encounter, someone else has the turn: Start turn waits for the tracker. */
const otherActing = computed(() => {
  if (!gmEncounter.value) return false
  const acting = props.init.order.value.find((c) => c.id === props.init.turnId.value)
  return !!acting && acting.character_id !== draft.value.id
})

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
  return used.length ? `Reactions: ${used.join(', ')} used` : 'Reactions ready'
})

/** Compact: the sub line also carries what the status column shows on wider bars. */
const subRest = computed(() =>
  props.compact
    ? [leftText.value, reactions.value, sub.value].filter(Boolean).join(' · ')
    : sub.value,
)
const subLine = computed(() => [headTail.value, subRest.value].filter(Boolean).join(' · '))
</script>

<template>
  <section
    class="panel turn"
    :class="{
      'turn--now': sheet.turnActive,
      'turn--compact': compact,
      'turn--touch': touch && !compact,
    }"
    aria-label="Your turn"
  >
    <div class="turn__who">
      <strong class="turn__title" role="status" :title="headline"
        >{{ headMain }}<span v-if="headTail" class="sr-only"> · {{ headTail }}</span></strong
      >
      <span v-if="subLine" class="turn__sub" :title="subLine"
        ><span aria-hidden="true">{{ headTail }}{{ headTail && subRest ? ' · ' : '' }}</span
        >{{ subRest }}</span
      >
    </div>

    <div class="turn__pips" role="group" :aria-label="`Actions: ${leftText}`">
      <span class="turn__pipline">
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
          v-if="!compact"
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
      </span>
      <span v-if="!compact" class="turn__status">
        <span class="turn__left">{{ leftText }}</span>
        <span class="turn__react" :title="reactions">{{ reactions }}</span>
      </span>
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
        v-if="unsent !== null"
        type="button"
        class="btn btn--sm"
        :disabled="!canEdit"
        title="The initiative tracker didn't get your total: sends the same one again"
        @click="resendInitiative"
      >
        Resend Initiative
      </button>
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
        :disabled="!canEdit || otherActing"
        :title="
          otherActing ? 'Not your turn yet: it starts when initiative reaches you' : undefined
        "
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
  container: turn / inline-size;
  flex: none;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  padding: 8px 12px;

  // The accent wash is laid over the panel background rather than mixed into it: Cursed's
  // panel background is a gradient, which color-mix() can't take (the whole background was
  // dropped, leaving dark panel text on the dark page).
  &--now {
    border-color: var(--accent);
    background:
      linear-gradient(90deg, color-mix(in srgb, var(--accent) 16%, transparent), transparent),
      var(--panel-bg);
  }
}

.turn__who {
  display: flex;
  flex-direction: column;
  gap: 1px;
  // Takes what the pips and the step button leave, so the bar stays on one row at 1200px;
  // long lines truncate (the full text is in their title).
  flex: 1 1 0;
  min-width: 80px;
}

.turn__title,
.turn__sub {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  flex: none;
  display: flex;
  align-items: center;
  gap: 4px;
}

.turn__pipline {
  display: flex;
  align-items: center;
  gap: 4px;
}

// A narrow bar (1200–1360px windows) puts the action count and reactions under the pips,
// so the headline keeps its room and the bar stays on one row.
@container turn (max-width: 620px) {
  .turn__pips {
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
  }

  .turn__status {
    margin-left: 0;
  }

  .turn__left,
  .turn__react {
    font-size: 11px;
    line-height: 1.2;
  }
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

.turn__status {
  display: flex;
  flex-direction: column;
  margin-left: 3px;
  line-height: 1.25;
  white-space: nowrap;
}

.turn__left {
  font-size: 12px;
  color: var(--page-text);
}

.turn__react {
  max-width: 96px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
  color: var(--page-soft);
}

.turn__steps {
  flex: none;
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

// --- Compact (phone) -------------------------------------------------------------------
// A bar across the frame above the tabs, on one row: the headline takes what the pips
// and the step button leave. Pips are 44px targets 8px apart, drawn as 18px dots. Only
// the typed Initiative entry and the casting note take a row of their own.
.turn--compact {
  flex-wrap: wrap;
  gap: 6px 8px;
  padding: 6px 12px;
  border-width: 1px 0 0;
  border-radius: 0;

  .turn__who {
    min-width: 0;
  }

  .turn__pipline {
    gap: 8px;
  }

  .turn__pip {
    position: relative;
    width: 44px;
    height: 44px;
    border: 0;
    background: none;

    &::after {
      content: '';
      position: absolute;
      inset: 13px;
      box-sizing: border-box;
      border-radius: 50%;
      border: 2px dashed var(--line-strong);
    }

    &.on,
    &.extra.on {
      border: 0;
      background: none;
    }

    &.on::after {
      border: 2px solid var(--secondary);
      background: var(--secondary);
    }

    &.extra.on::after {
      border-color: var(--accent);
      background: var(--accent);
    }
  }

  .turn__steps {
    flex-wrap: nowrap;
    gap: 8px;

    .btn {
      min-height: 44px;
      padding-inline: 16px;
      font-size: 14px;
      white-space: nowrap;
    }
  }

  .turn__entry {
    flex: 1 1 100%;
    max-width: none;
  }

  .turn__steps:has(.turn__entry) {
    flex: 1 1 100%;
    flex-wrap: wrap;
  }
}

// --- Touch (the full bar) ---------------------------------------------------------------
// Every one-tap control is a 44px target, 8px from the next; the pips keep their 22px dots,
// drawn inside the target.
.turn--touch {
  .turn__pips,
  .turn__pipline,
  .turn__steps,
  .turn__casting {
    gap: 8px;
  }

  .turn__pip {
    position: relative;
    width: 44px;
    height: 44px;
    border: 0;
    background: none;

    &::after {
      content: '';
      position: absolute;
      inset: 11px;
      box-sizing: border-box;
      border-radius: 50%;
      border: 2px dashed var(--line-strong);
    }

    &.on,
    &.extra.on {
      border: 0;
      background: none;
    }

    &.on::after {
      border: 2px solid var(--secondary);
      background: var(--secondary);
    }

    &.extra.on::after {
      border-color: var(--accent);
      background: var(--accent);
    }
  }

  .turn__add {
    min-width: 44px;
    height: 44px;
    font-size: 13px;
  }

  .turn__steps .btn,
  .turn__casting .btn {
    min-height: 44px;
    padding-inline: 16px;
    font-size: 14px;
  }
}
</style>
