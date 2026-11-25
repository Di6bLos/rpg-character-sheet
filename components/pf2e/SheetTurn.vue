<script setup lang="ts">
// The PF2e sheet's turn tracker (Player Core pp. 436–437): Roll initiative (Perception with
// initiative bonuses like Incredible Initiative), then Start turn and End turn one at a time,
// the actions and reaction left, and which attack the next Strike is for the multiple attack
// penalty. Rules in utils/pf2eActions.ts; abilities spend from it in the Actions panel.
import type { Pf2eSheet } from '~/types/sheets'
import { rollAttack, sign } from '~/utils/dice'
import { endPf2eEncounter, endPf2eTurn, startPf2eTurn } from '~/utils/pf2eActions'
import { adjusted } from '~/utils/pf2ePlay'

const { draft, canEdit, say } = useSheet<Pf2eSheet>()
const sheet = computed(() => draft.value.sheet)
const turn = computed(() => sheet.value.turn)
const active = computed(() => !!turn.value?.active)
const maxActions = computed(() => Math.max(3, turn.value?.actions ?? 0))

const initiative = computed(() => {
  const p = sheet.value.saves.find((x) => x.label === 'Perception')
  return adjusted(sheet.value, p?.value ?? 0, { kind: 'perception', attr: 'WIS', initiative: true })
})

function rollInitiative() {
  if (!canEdit.value) return
  const r = rollAttack(initiative.value.value)
  const nat = r.natural ? `, natural ${r.natural}` : ''
  const note = initiative.value.note ? ` (${initiative.value.note})` : ''
  say(`Initiative: ${r.total} (${r.d20} ${sign(initiative.value.value)}${nat})${note}`)
}

function step() {
  if (!canEdit.value) return
  say(active.value ? endPf2eTurn(sheet.value) : startPf2eTurn(sheet.value))
}

function finish() {
  if (canEdit.value) say(endPf2eEncounter(sheet.value))
}

const ORDINAL = ['1st', '2nd', '3rd']
const nextAttack = computed(() =>
  active.value ? ORDINAL[Math.min(2, turn.value?.attacks ?? 0)] : '1st',
)
</script>

<template>
  <section class="panel stack turn" style="gap: 12px" aria-labelledby="turn-h">
    <div class="panel-title" style="margin: 0">
      <h2 id="turn-h">Turn</h2>
      <span v-if="turn?.round" class="small muted">Round {{ turn.round }}</span>
    </div>
    <div class="turn__row">
      <div
        class="turn__pips"
        role="img"
        :aria-label="
          active
            ? `${turn?.actions ?? 0} of ${maxActions} actions left, reaction ${turn?.reaction ? 'ready' : 'used'}`
            : `Not your turn, reaction ${turn?.reaction === false ? 'used' : 'ready'}`
        "
      >
        <span
          v-for="n in maxActions"
          :key="n"
          class="turn__pip"
          :class="{ 'is-on': active && n <= (turn?.actions ?? 0) }"
          aria-hidden="true"
          >◆</span
        >
        <span
          class="turn__pip turn__pip--reaction"
          :class="{ 'is-on': turn?.reaction !== false }"
          aria-hidden="true"
          >↺</span
        >
      </div>
      <span class="small muted">Next Strike: {{ nextAttack }} attack</span>
      <div class="row" style="gap: 8px; margin-left: auto">
        <button
          type="button"
          class="btn btn--ghost btn--sm"
          :disabled="!canEdit"
          :title="initiative.note || undefined"
          @click="rollInitiative"
        >
          Roll initiative {{ sign(initiative.value) }}
        </button>
        <button type="button" class="btn btn--sm" :disabled="!canEdit" @click="step">
          {{ active ? 'End turn' : 'Start turn' }}
        </button>
        <button
          v-if="turn?.round"
          type="button"
          class="btn btn--ghost btn--sm"
          :disabled="!canEdit"
          @click="finish"
        >
          End encounter
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.turn__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 16px;
}

.turn__pips {
  display: inline-flex;
  gap: 6px;
  font-size: 18px;
}

.turn__pip {
  color: var(--page-muted);
  opacity: 0.4;

  &.is-on {
    color: var(--secondary);
    opacity: 1;
  }

  &--reaction.is-on {
    color: var(--accent);
  }
}
</style>
