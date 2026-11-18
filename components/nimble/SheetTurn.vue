<script setup lang="ts">
// The turn tracker: actions left this turn, and the Start turn / End turn / New encounter steps.
import type { NimbleSheet } from '~/types/sheets'
import {
  actionPips,
  actionsLeft,
  endEncounter,
  gainAction,
  newRound,
  toggleActionPip,
  endTurn,
  newEncounter,
  startTurn,
  stopCasting,
  turnActions,
} from '~/utils/nimblePlay'

const { draft, canEdit, say } = useSheet<NimbleSheet>()
const sheet = computed(() => draft.value.sheet)

const perTurn = computed(() => turnActions(sheet.value))
const left = computed(() => actionsLeft(sheet.value))
const rushedNote = computed(() =>
  sheet.value.rushed
    ? `Next attack: ${sheet.value.rushed}× disadvantage (Rushed)`
    : 'No attacks yet this turn',
)

const pips = computed(() => actionPips(sheet.value))

function toggleAction(n: number) {
  if (canEdit.value) toggleActionPip(sheet.value, n)
}

function extraAction() {
  if (canEdit.value) say(gainAction(sheet.value))
}

function cancelCasting() {
  if (canEdit.value) say(stopCasting(sheet.value))
}

function beginTurn() {
  if (canEdit.value) say(startTurn(sheet.value, draft.value.level))
}

function finishEncounter() {
  if (canEdit.value) say(endEncounter(sheet.value, draft.value.level))
}

function nextRound() {
  if (canEdit.value) say(newRound(sheet.value, draft.value.level))
}

function finishTurn() {
  if (canEdit.value) say(endTurn(sheet.value, draft.value.level))
}

function startEncounter(values?: number[]) {
  if (canEdit.value) say(newEncounter(sheet.value, draft.value.level, Math.random, values?.[0]))
}
</script>

<template>
  <section class="panel stack" style="gap: 12px" aria-labelledby="turn-h">
    <UiFold name="Turn" />
    <div class="title-help">
      <h2 id="turn-h">Turn</h2>
      <UiHelp
        label="About the turn tracker"
        text="Attacks, spells and reactions spend actions for you; tap a circle to spend or restore one. Your actions come back at the END of your turn, so reactions you take on others’ turns come out of your next one. Start turn refills once-per-turn abilities and pays spells still being cast; New encounter rolls Initiative (9 or less: 1 action, 10–19: 2, 20+: all) and refills once-per-encounter abilities. On the board, Start and End turn happen by themselves as initiative reaches and leaves you."
      />
    </div>
    <div class="tile turn">
      <div
        class="row"
        style="gap: 8px; flex-wrap: wrap"
        role="group"
        aria-label="Actions this turn"
      >
        <button
          v-for="n in pips"
          :key="n"
          type="button"
          class="action"
          :class="{ on: n <= left, extra: n > perTurn }"
          :aria-label="`${n <= left ? 'Spend' : 'Restore'} action ${n}`"
          :disabled="!canEdit"
          @click="toggleAction(n)"
        >
          {{ n }}
        </button>
        <button
          type="button"
          class="action action--add"
          aria-label="Gain an extra action"
          title="An ally or ability gave you an extra action (Stim Pack, Chorus of Champions…); it lasts until your turn ends"
          :disabled="!canEdit"
          @click="extraAction"
        >
          +1
        </button>
      </div>
      <div class="stack" style="gap: 2px; min-width: 140px">
        <strong role="status" style="font-size: 15px">
          {{
            left > perTurn
              ? `${left} left (${left - perTurn} extra)`
              : `${left} of ${perTurn} left`
          }}{{ sheet.dying ? ' (Dying)' : '' }}
        </strong>
        <span class="muted" style="font-size: 12px">{{ rushedNote }}</span>
        <div v-if="sheet.casting.actions" class="row" style="gap: 6px">
          <span class="muted" style="font-size: 12px">
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
      </div>
      <div class="row" style="gap: 6px; margin-left: auto; flex-wrap: wrap">
        <button
          v-if="!sheet.ownDice && !sheet.inEncounter"
          type="button"
          class="btn btn--ghost btn--sm"
          :disabled="!canEdit"
          @click="startEncounter()"
        >
          New encounter
        </button>
        <button
          v-if="sheet.inEncounter && !sheet.turnActive"
          type="button"
          class="btn btn--quiet btn--sm"
          :disabled="!canEdit"
          title="The battle is over: Rage, unused combat charges and minions end"
          @click="finishEncounter"
        >
          End encounter
        </button>
        <button
          v-if="!sheet.turnActive && sheet.inEncounter && !sheet.turnDone"
          type="button"
          class="btn btn--sm"
          :disabled="!canEdit"
          @click="beginTurn"
        >
          Start turn
        </button>
        <button
          v-else-if="sheet.inEncounter && sheet.turnDone && !sheet.turnActive"
          type="button"
          class="btn btn--ghost btn--sm"
          :disabled="!canEdit"
          title="Your turn is over for this round; tap when the next round begins"
          @click="nextRound"
        >
          New round
        </button>
        <button
          v-if="sheet.turnActive"
          type="button"
          class="btn btn--sm"
          :disabled="!canEdit"
          @click="finishTurn"
        >
          End turn
        </button>
      </div>
    </div>
    <NimbleDiceEntry
      v-if="sheet.ownDice && !sheet.inEncounter"
      label="Your Initiative total"
      action="New encounter"
      :disabled="!canEdit"
      @submit="startEncounter"
    />
  </section>
</template>

<style scoped lang="scss">
.turn {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.action {
  flex: none;
  width: 44px;
  height: 44px;
  padding: 0;
  border-radius: 50%;
  font-weight: 700;
  font-size: 15px;
  background: transparent;
  color: var(--page-muted);
  border: 2px dashed var(--line-strong);

  &.on {
    background: var(--secondary);
    color: var(--on-secondary);
    border: 2px solid var(--secondary);
  }

  &.extra.on {
    background: var(--accent);
    color: var(--on-accent);
    border-color: var(--accent);
  }

  &--add {
    border-style: solid;
    font-size: 13px;
    color: var(--page-soft);
  }
}
</style>
