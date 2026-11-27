<script setup lang="ts">
// A 5e hero's turn economy on the battle board (SRD 5.2.1 p. 13), from the sheet's turn model
// (useDnd5eTurnSteps): the action circles (tap to spend or restore, +1 for Action Surge or
// Haste), the Reaction (↺), the Bonus Action (B) and the object interaction (✋), each captioned
// (Action, Reaction, Bonus, Object), then the movement with −/+ 5 ft. The turn bar shows it; on the phone, whose one-row turn bar has no
// room, the hero tab does (`compact`: 44px targets).
import type { TurnModel } from '~/utils/turnSteps'

defineProps<{ turn: TurnModel; compact?: boolean }>()
const { canEdit } = useSheet()
</script>

<template>
  <div class="eco" :class="{ 'eco--compact': compact }">
    <div class="eco__line" role="group" :aria-label="`Actions: ${turn.leftText}`">
      <span class="eco__item">
        <span class="eco__pips">
          <button
            v-for="p in turn.pips"
            :key="p.n"
            type="button"
            class="eco__pip"
            :class="{ on: p.on, extra: p.extra }"
            :aria-label="`${p.on ? 'Spend' : 'Restore'} action ${p.n}`"
            :disabled="!canEdit || turn.pipsLocked"
            @click="turn.toggleAction(p.n)"
          />
        </span>
        <span class="eco__cap" aria-hidden="true">{{
          turn.pips.length === 1 ? 'Action' : 'Actions'
        }}</span>
      </span>
      <button
        type="button"
        class="eco__add"
        aria-label="Gain an extra action"
        :title="turn.extraTitle"
        :disabled="!canEdit || turn.pipsLocked"
        @click="turn.extraAction()"
      >
        +1
      </button>
      <span v-if="turn.reaction" class="eco__item">
        <button
          type="button"
          class="eco__pip eco__pip--glyph"
          :class="{ on: turn.reaction.ready }"
          :aria-label="turn.reaction.ready ? 'Spend your reaction' : 'Restore your reaction'"
          :aria-pressed="!turn.reaction.ready"
          title="Your Reaction: one a round, back at the start of your turn"
          :disabled="!canEdit"
          @click="turn.toggleReaction?.()"
        >
          <span aria-hidden="true">↺</span>
        </button>
        <span class="eco__cap" aria-hidden="true">Reaction</span>
      </span>
      <span v-for="e in turn.economy ?? []" :key="e.key" class="eco__item">
        <button
          type="button"
          class="eco__pip eco__pip--glyph"
          :class="{ on: e.ready }"
          :aria-label="e.ready ? `Spend your ${e.label}` : `Restore your ${e.label}`"
          :aria-pressed="!e.ready"
          :title="e.title"
          :disabled="!canEdit || turn.pipsLocked"
          @click="turn.toggleEconomy?.(e.key)"
        >
          <span aria-hidden="true">{{ e.glyph }}</span>
        </button>
        <span class="eco__cap" aria-hidden="true">{{ e.short }}</span>
      </span>
    </div>
    <div v-if="turn.movement" class="eco__move" role="group" aria-label="Movement this turn">
      <button
        type="button"
        class="step step--xs eco__step"
        aria-label="5 feet less moved"
        :disabled="!canEdit || turn.pipsLocked || turn.movement.used <= 0"
        @click="turn.move?.(-5)"
      >
        −
      </button>
      <span class="eco__moved" aria-live="polite"
        >{{ turn.movement.used }}/{{ turn.movement.max }} ft</span
      >
      <button
        type="button"
        class="step step--xs eco__step"
        aria-label="5 feet more moved"
        :disabled="!canEdit || turn.pipsLocked || turn.movement.used >= turn.movement.max"
        @click="turn.move?.(5)"
      >
        +
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.eco {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
}

.eco__line,
.eco__move,
.eco__pips {
  display: flex;
  align-items: center;
  gap: 4px;
}

.eco__line {
  align-items: flex-start;
  gap: 8px;
}

.eco__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.eco__cap {
  font-size: 10px;
  font-weight: 600;
  line-height: 1.2;
  color: var(--page-muted);
}

.eco__pip {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border-radius: 50%;
  border: 2px dashed var(--line-strong);
  background: transparent;
  color: var(--page-muted);
  font-size: 11px;
  font-weight: 700;

  &.on {
    border: 2px solid var(--secondary);
    background: var(--secondary);
    color: var(--on-secondary, var(--page-bg));
  }

  &.extra.on {
    border-color: var(--accent);
    background: var(--accent);
  }

  &--glyph.on {
    background: color-mix(in srgb, var(--secondary) 22%, transparent);
    color: var(--page-text);
  }
}

.eco__add {
  height: 22px;
  padding: 0 6px;
  border-radius: 999px;
  border: 1px solid var(--line-strong);
  background: transparent;
  color: var(--page-soft);
  font-size: 11px;
  font-weight: 700;
}

.eco__moved {
  min-width: 52px;
  text-align: center;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--page-text);
}

// Phone and touch: every control a 44px target, 8px apart.
.eco--compact {
  gap: 8px;

  .eco__line,
  .eco__move,
  .eco__pips {
    gap: 8px;
  }

  .eco__cap {
    font-size: 11px;
  }

  .eco__pip {
    width: 44px;
    height: 44px;
    font-size: 14px;
  }

  .eco__add,
  .eco__step {
    min-width: 44px;
    height: 44px;
    font-size: 13px;
  }
}
</style>
