<script setup lang="ts">
// The turn tracker: actions left this turn, and the Start turn / End turn / New encounter steps.
import type { NimbleSheet } from '~/types/sheets'

const { draft, canEdit, campaignId } = useSheet<NimbleSheet>()
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
} = useTurnSteps()
</script>

<template>
  <section class="panel stack" style="gap: 12px" aria-labelledby="turn-h">
    <UiFold name="Turn" />
    <div class="turn-title">
      <div class="title-help">
        <h2 id="turn-h">Turn</h2>
        <UiHelp
          label="About the turn tracker"
          text="Attacks, spells and reactions spend actions for you; tap a circle to spend or restore one. Your actions come back at the END of your turn, so reactions you take on others’ turns come out of your next one. Start turn refills once-per-turn abilities and pays spells still being cast; New encounter refills once-per-encounter abilities; then Roll Initiative (or type your total if you roll your own dice): 9 or less starts you with 1 action, 10–19 with 2, 20+ with all. On the board, Start and End turn happen by themselves as initiative reaches and leaves you."
        />
      </div>
      <span v-if="sheet.turnActive" class="turn-now">Your turn</span>
      <NimbleTurnWho
        v-else-if="campaignId"
        :campaign-id="campaignId"
        :character-id="draft.id"
        :fallback="sheet.inEncounter ? 'Waiting for your turn' : 'Not in combat'"
        class="turn-who"
      />
      <span v-else class="turn-who">{{
        sheet.inEncounter ? 'Waiting for your turn' : 'Not in combat'
      }}</span>
      <span
        v-if="sheet.inEncounter && sheet.initiative != null"
        class="turn-init"
        title="Your Initiative this encounter"
        >Initiative {{ sheet.initiative }}</span
      >
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
          v-if="steps.includes('encounter')"
          type="button"
          class="btn btn--ghost btn--sm"
          :disabled="!canEdit"
          @click="startEncounter"
        >
          New encounter
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
        <button
          v-if="steps.includes('endEncounter')"
          type="button"
          class="btn btn--quiet btn--sm"
          :disabled="!canEdit"
          title="The battle is over: Rage, unused combat charges and minions end"
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
          title="Your turn is over for this round; tap when the next round begins"
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
    </div>
    <NimbleDiceEntry
      v-if="typed"
      label="Your Initiative total"
      action="Set Initiative"
      signed
      :disabled="!canEdit"
      @submit="initiative"
    />
  </section>
</template>

<style scoped lang="scss">
.turn-title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 12px;
  padding-right: 40px;
}

.turn-now {
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  background: color-mix(in srgb, var(--accent) 20%, transparent);
  color: var(--accent-text);
}

.turn-init {
  padding: 2px 10px;
  border-radius: 999px;
  border: 1px solid var(--line-strong);
  font-size: 12px;
  font-weight: 700;
  color: var(--page-soft);
}

.turn-who {
  font-size: 13px;
  color: var(--page-muted);
}

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
