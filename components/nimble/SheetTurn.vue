<script setup lang="ts">
// The turn tracker: actions left this turn, and the New turn / New encounter resets.
import type { NimbleSheet } from '~/types/sheets'
import { actionsLeft, newEncounter, newTurn, stopCasting, turnActions } from '~/utils/nimblePlay'

const { draft, canEdit, say } = useSheet<NimbleSheet>()
const sheet = computed(() => draft.value.sheet)

const perTurn = computed(() => turnActions(sheet.value))
const left = computed(() => actionsLeft(sheet.value))
const rushedNote = computed(() =>
  sheet.value.rushed
    ? `Next attack: ${sheet.value.rushed}× disadvantage (Rushed)`
    : 'No attacks yet this turn',
)

function toggleAction(n: number) {
  if (!canEdit.value) return
  // Pips fill from the left: tapping a filled one spends it, an empty one restores it.
  sheet.value.actionsSpent = Math.max(
    0,
    Math.min(perTurn.value, sheet.value.actionsSpent + (n <= left.value ? 1 : -1)),
  )
}

function cancelCasting() {
  if (canEdit.value) say(stopCasting(sheet.value))
}

function startTurn() {
  if (canEdit.value) say(newTurn(sheet.value))
}

function startEncounter() {
  if (canEdit.value) say(newEncounter(sheet.value))
}
</script>

<template>
  <section class="panel stack" style="gap: 12px" aria-labelledby="turn-h">
    <div class="title-help">
      <h2 id="turn-h">Turn</h2>
      <UiHelp
        label="About the turn tracker"
        text="Attacks, spells and reactions spend actions for you. Tap a circle to spend or restore one. New turn restores them all, readies your reactions and refills once-per-turn abilities; New encounter also refills once-per-encounter ones."
      />
    </div>
    <div class="tile turn">
      <div class="row" style="gap: 8px" role="group" aria-label="Actions this turn">
        <button
          v-for="n in perTurn"
          :key="n"
          type="button"
          class="action"
          :class="{ on: n <= left }"
          :aria-label="`${n <= left ? 'Spend' : 'Restore'} action ${n}`"
          :disabled="!canEdit"
          @click="toggleAction(n)"
        >
          {{ n }}
        </button>
      </div>
      <div class="stack" style="gap: 2px; min-width: 140px">
        <strong role="status" style="font-size: 15px">
          {{ left }} of {{ perTurn }} left{{ sheet.dying ? ' (Dying)' : '' }}
        </strong>
        <span class="muted" style="font-size: 12px">{{ rushedNote }}</span>
        <div v-if="sheet.casting.actions" class="row" style="gap: 6px">
          <span class="muted" style="font-size: 12px">
            Casting {{ sheet.casting.spell }}: {{ sheet.casting.actions }} more
            {{ sheet.casting.actions === 1 ? 'action' : 'actions' }} on New turn
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
          type="button"
          class="btn btn--ghost btn--sm"
          :disabled="!canEdit"
          @click="startEncounter"
        >
          New encounter
        </button>
        <button
          type="button"
          class="btn btn--ghost btn--sm"
          :disabled="!canEdit"
          @click="startTurn"
        >
          New turn
        </button>
      </div>
    </div>
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
  width: 44px;
  height: 44px;
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
}
</style>
