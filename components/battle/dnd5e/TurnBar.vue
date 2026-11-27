<script setup lang="ts">
// A 5e hero's turn bar on the battle board (top of the centre column), the Nimble TurnBar's
// twin with the 5e action economy (SRD 5.2.1 pp. 9–13): whose turn it is, the action,
// Reaction, Bonus Action and object interaction circles with the movement (Economy), the
// note (attacks left in the Attack action, Concentration, a death save due) and the sheet's
// turn steps (useDnd5eTurnSteps, as the sheet's Turn panel). Initiative goes to the GM's
// tracker; Start and End turn follow the tracker by themselves (HeroEditor). Compact
// (phone): one row, the headline with what's left as its sub line (once: the note may already
// say it) and the step button; the circles are on the Hero tab there.
import type { useInitiative } from '~/composables/useInitiative'
import type { Dnd5eSheet } from '~/types/sheets'
import { turnHeadline } from '~/utils/turnSteps'

const props = defineProps<{ init: ReturnType<typeof useInitiative>; compact?: boolean }>()

const { draft, canEdit, gmEncounter } = useSheet<Dnd5eSheet>()
const { touch } = useBoardLayout()
const announce = useAnnounce()
const { model } = useDnd5eTurnSteps({ onResult: announce })
const sheet = computed(() => draft.value.sheet)
const active = computed(() => !!sheet.value.turn?.active)

const headline = computed(() =>
  turnHeadline({
    order: props.init.order.value,
    turnId: props.init.turnId.value,
    round: props.init.round.value,
    mine: draft.value.id,
    turnActive: active.value,
    inEncounter: !!sheet.value.inEncounter,
  }),
)
const headMain = computed(() => headline.value.split(' · ')[0] ?? headline.value)
const headTail = computed(() => {
  const tail = headline.value.split(' · ').slice(1).join(' · ')
  return tail && tail.charAt(0).toUpperCase() + tail.slice(1)
})

/** The GM's encounter is running but this hero isn't on the tracker (seated heroes join on their own). */
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
    sheet.value.inEncounter && model.value.initiative != null
      ? `Initiative ${model.value.initiative}`
      : '',
    model.value.note,
  ]
    .filter(Boolean)
    .join(' · '),
)
/** The note already starts with the actions left (dnd5eTurnLeft), so compact skips `leftText`. */
const noteHasLeft = computed(() => /^(\d+ actions? left|Action used)\b/.test(model.value.note))
const subRest = computed(() =>
  props.compact && !noteHasLeft.value
    ? [model.value.leftText, sub.value].filter(Boolean).join(' · ')
    : sub.value,
)
const subLine = computed(() => [headTail.value, subRest.value].filter(Boolean).join(' · '))
const steps = computed(() => model.value.steps)
</script>

<template>
  <section
    class="panel turn"
    :class="{ 'turn--now': active, 'turn--compact': compact, 'turn--touch': touch && !compact }"
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

    <BattleDnd5eEconomy v-if="!compact" class="turn__pips" :turn="model" :compact="touch" />

    <div class="turn__steps">
      <button
        v-if="steps.includes('encounter')"
        type="button"
        class="btn btn--sm"
        :class="{ 'btn--ghost': !joining }"
        :disabled="!canEdit"
        @click="model.startEncounter()"
      >
        {{ joining ? 'Join encounter' : 'New encounter' }}
      </button>
      <button
        v-if="steps.includes('initiative')"
        type="button"
        class="btn btn--sm"
        :disabled="!canEdit"
        @click="model.rollInitiative()"
      >
        Roll Initiative
      </button>
      <NimbleDiceEntry
        v-if="model.typed"
        class="turn__entry"
        label="Your Initiative total"
        action="Set"
        signed
        :disabled="!canEdit"
        @submit="model.rollInitiative"
      />
      <button
        v-if="model.unsent !== null"
        type="button"
        class="btn btn--sm"
        :disabled="!canEdit"
        title="The initiative tracker didn't get your total: sends the same one again"
        @click="model.resendInitiative()"
      >
        Resend Initiative
      </button>
      <button
        v-if="steps.includes('endEncounter')"
        type="button"
        class="btn btn--quiet btn--sm"
        :disabled="!canEdit"
        :title="model.endEncounterTitle"
        @click="model.finishEncounter()"
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
        @click="model.beginTurn()"
      >
        Start turn
      </button>
      <button
        v-else-if="steps.includes('round')"
        type="button"
        class="btn btn--ghost btn--sm"
        :disabled="!canEdit"
        @click="model.nextRound()"
      >
        New round
      </button>
      <button
        v-if="steps.includes('end')"
        type="button"
        class="btn btn--sm"
        :disabled="!canEdit"
        @click="model.finishTurn()"
      >
        End turn
      </button>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use '../../../assets/styles/battle-turn';
</style>
