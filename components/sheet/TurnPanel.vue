<script setup lang="ts">
// The Turn panel of the Nimble, PF2e and 5e sheets: whose turn it is, the action circles (tap to
// spend or restore; PF2e adds its reaction and strikes out actions stunned or slowed took; 5e
// its reaction, Bonus Action, object interaction and movement), the actions left and the
// attack note, and one step button at a time (Initiative, Start turn, End turn…) with a typed
// Initiative for Manual dice. Each system fills a `TurnModel`: nimble/SheetTurn from
// useTurnSteps, pf2e/SheetTurn from usePf2eTurnSteps, dnd5e/SheetTurn from useDnd5eTurnSteps.
import type { TurnModel } from '~/utils/turnSteps'

defineProps<{ turn: TurnModel }>()
const { draft, canEdit, campaignId } = useSheet()
</script>

<template>
  <section class="panel stack" style="gap: 12px" aria-labelledby="turn-h">
    <UiFold name="Turn" />
    <div class="turn-title">
      <div class="title-help">
        <h2 id="turn-h">Turn</h2>
        <UiHelp label="About the turn tracker" :text="turn.help" />
      </div>
      <span v-if="turn.active" class="turn-now">Your turn</span>
      <SheetTurnWho
        v-else-if="campaignId"
        :campaign-id="campaignId"
        :character-id="draft.id"
        :fallback="turn.inEncounter ? 'Waiting for your turn' : 'Not in combat'"
        class="turn-who"
      />
      <span v-else class="turn-who">{{
        turn.inEncounter ? 'Waiting for your turn' : 'Not in combat'
      }}</span>
      <span
        v-if="turn.inEncounter && turn.initiative != null"
        class="turn-init"
        title="Your Initiative this encounter"
        >Initiative {{ turn.initiative }}</span
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
          v-for="p in turn.pips"
          :key="p.n"
          type="button"
          class="action"
          :class="{ on: p.on, extra: p.extra, lost: !!p.lost }"
          :aria-label="
            p.lost
              ? `Action ${p.n} lost to ${p.lost}`
              : `${p.on ? 'Spend' : 'Restore'} action ${p.n}`
          "
          :title="p.lost ? `Lost to ${p.lost} this turn` : undefined"
          :disabled="!canEdit || turn.pipsLocked || !!p.lost"
          @click="turn.toggleAction(p.n)"
        >
          {{ p.n }}
        </button>
        <button
          type="button"
          class="action action--add"
          aria-label="Gain an extra action"
          :title="turn.extraTitle"
          :disabled="!canEdit || turn.pipsLocked"
          @click="turn.extraAction()"
        >
          +1
        </button>
        <button
          v-if="turn.reaction"
          type="button"
          class="action action--reaction"
          :class="{ on: turn.reaction.ready }"
          :aria-label="turn.reaction.ready ? 'Spend your reaction' : 'Restore your reaction'"
          :aria-pressed="!turn.reaction.ready"
          title="Your reaction: one a round, back at the start of your turn"
          :disabled="!canEdit"
          @click="turn.toggleReaction?.()"
        >
          <span aria-hidden="true">↺</span>
        </button>
        <button
          v-for="e in turn.economy ?? []"
          :key="e.key"
          type="button"
          class="action action--economy"
          :class="[`action--${e.key}`, { on: e.ready }]"
          :aria-label="e.ready ? `Spend your ${e.label}` : `Restore your ${e.label}`"
          :aria-pressed="!e.ready"
          :title="e.title"
          :disabled="!canEdit || turn.pipsLocked"
          @click="turn.toggleEconomy?.(e.key)"
        >
          <span aria-hidden="true">{{ e.glyph }}</span>
        </button>
      </div>
      <div class="stack" style="gap: 2px; min-width: 140px">
        <strong role="status" style="font-size: 15px">{{ turn.leftText }}</strong>
        <span class="muted" style="font-size: 12px">{{ turn.note }}</span>
        <div v-if="turn.movement" class="row move" role="group" aria-label="Movement this turn">
          <button
            type="button"
            class="step step--xs"
            aria-label="5 feet less moved"
            :disabled="!canEdit || turn.pipsLocked || turn.movement.used <= 0"
            @click="turn.move?.(-5)"
          >
            −
          </button>
          <span class="move__v" aria-live="polite"
            >Moved {{ turn.movement.used }} / {{ turn.movement.max }} ft</span
          >
          <button
            type="button"
            class="step step--xs"
            aria-label="5 feet more moved"
            :disabled="!canEdit || turn.pipsLocked || turn.movement.used >= turn.movement.max"
            @click="turn.move?.(5)"
          >
            +
          </button>
        </div>
        <div v-if="turn.casting?.actions" class="row" style="gap: 6px">
          <span class="muted" style="font-size: 12px">
            Casting {{ turn.casting.spell }}: {{ turn.casting.actions }} more
            {{ turn.casting.actions === 1 ? 'action' : 'actions' }} on Start turn
          </span>
          <button
            type="button"
            class="btn btn--ghost btn--sm"
            :disabled="!canEdit"
            @click="turn.cancelCasting?.()"
          >
            Stop casting
          </button>
        </div>
      </div>
      <div class="row" style="gap: 6px; margin-left: auto; flex-wrap: wrap">
        <button
          v-if="turn.steps.includes('encounter')"
          type="button"
          class="btn btn--ghost btn--sm"
          :disabled="!canEdit"
          @click="turn.startEncounter()"
        >
          New encounter
        </button>
        <button
          v-if="turn.steps.includes('initiative')"
          type="button"
          class="btn btn--sm"
          :disabled="!canEdit"
          @click="turn.rollInitiative()"
        >
          Roll Initiative
        </button>
        <button
          v-if="turn.unsent !== null"
          type="button"
          class="btn btn--sm"
          :disabled="!canEdit"
          title="The initiative tracker didn't get your total: sends the same one again"
          @click="turn.resendInitiative()"
        >
          Resend Initiative
        </button>
        <button
          v-if="turn.steps.includes('endEncounter')"
          type="button"
          class="btn btn--quiet btn--sm"
          :disabled="!canEdit"
          :title="turn.endEncounterTitle"
          @click="turn.finishEncounter()"
        >
          End encounter
        </button>
        <button
          v-if="turn.steps.includes('start')"
          type="button"
          class="btn btn--sm"
          :disabled="!canEdit"
          @click="turn.beginTurn()"
        >
          Start turn
        </button>
        <button
          v-else-if="turn.steps.includes('round')"
          type="button"
          class="btn btn--ghost btn--sm"
          :disabled="!canEdit"
          title="Your turn is over for this round; tap when the next round begins"
          @click="turn.nextRound()"
        >
          New round
        </button>
        <button
          v-if="turn.steps.includes('end')"
          type="button"
          class="btn btn--sm"
          :disabled="!canEdit"
          @click="turn.finishTurn()"
        >
          End turn
        </button>
      </div>
    </div>
    <NimbleDiceEntry
      v-if="turn.typed"
      label="Your Initiative total"
      action="Set Initiative"
      signed
      :disabled="!canEdit"
      @submit="turn.rollInitiative"
    />
    <p v-if="turn.result" class="roll-status" role="status" aria-live="polite">
      {{ turn.result }}
    </p>
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

.move {
  gap: 6px;
  margin-top: 4px;
}

.move__v {
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
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

  // Taken by stunned or slowed this turn: struck out, and readable while disabled.
  &.lost {
    border-style: solid;
    text-decoration: line-through;
    opacity: 1;
    background: repeating-linear-gradient(
      135deg,
      transparent 0 5px,
      color-mix(in srgb, var(--danger) 25%, transparent) 5px 7px
    );
  }

  // 5e's Bonus Action and object interaction: filled in their own colours while unused.
  &--economy {
    font-size: 15px;

    &.on {
      color: #fff;
      border: 2px solid var(--economy);
      background: var(--economy);
    }
  }

  &--bonus {
    --economy: #c07a1e;
  }

  &--object {
    --economy: #4b8a6a;
  }

  // PF2e's reaction: a filled circle in its own colour while ready, apart from the
  // actions' (secondary) and extra actions' (accent); dashed like a spent action once used.
  &--reaction {
    --reaction: #7a5ccc;

    margin-left: 4px;
    font-size: 18px;

    &.on {
      background: var(--reaction);
      color: #fff;
      border: 2px solid var(--reaction);
    }
  }
}
</style>
