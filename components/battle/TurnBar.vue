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
  leftText,
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
@use '../../assets/styles/battle-turn';
</style>
