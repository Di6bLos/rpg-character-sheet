<script setup lang="ts">
// The PF2e sheet's turn tracker (Player Core pp. 436–437): Roll initiative (Perception with
// initiative bonuses like Incredible Initiative, once an encounter), then Start turn and End
// turn one at a time, the actions and reaction left in words and pips, and which attack the
// next Strike is for the multiple attack penalty. Its results show here. Rules in
// utils/pf2eActions.ts; abilities spend from it in the Actions panel.
import type { Pf2eSheet } from '~/types/sheets'
import { rollCheck, showOutcome, sign } from '~/utils/dice'
import { endPf2eEncounter, endPf2eTurn, startPf2eTurn } from '~/utils/pf2eActions'
import { adjusted } from '~/utils/pf2ePlay'

const { draft, canEdit, say } = useSheet<Pf2eSheet>()
const { claim, resultIn } = useResultOwner()
const sheet = computed(() => draft.value.sheet)
const turn = computed(() => sheet.value.turn)
const active = computed(() => !!turn.value?.active)
const inCombat = computed(() => active.value || (turn.value?.round ?? 0) > 0)
const actionsLeft = computed(() => (active.value ? (turn.value?.actions ?? 0) : 0))
const maxActions = computed(() => Math.max(3, actionsLeft.value))
const reactionReady = computed(() => turn.value?.reaction !== false)

/** The initiative rolled this encounter: one roll, until the encounter ends. */
const rolled = ref<number | null>(null)

const initiative = computed(() => {
  const p = sheet.value.saves.find((x) => x.label === 'Perception')
  return adjusted(sheet.value, p?.value ?? 0, { kind: 'perception', attr: 'WIS', initiative: true })
})
const initiativeWhy = computed(() =>
  rolled.value !== null
    ? `Rolled ${rolled.value} this encounter`
    : active.value
      ? 'Initiative is rolled before your first turn'
      : '',
)

function rollInitiative() {
  if (!canEdit.value || initiativeWhy.value) return
  claim('turn:init', () => {
    const r = rollCheck(initiative.value.value)
    rolled.value = r.total
    const nat = r.natural ? `, natural ${r.natural}` : ''
    const note = initiative.value.note ? ` (${initiative.value.note})` : ''
    const line = `Initiative: ${r.total} (${r.d20} ${sign(initiative.value.value)}${nat})${note}`
    showOutcome({ label: 'Initiative', total: r.total, detail: line })
    say(line)
  })
}

function step() {
  if (!canEdit.value) return
  claim('turn:step', () =>
    say(active.value ? endPf2eTurn(sheet.value) : startPf2eTurn(sheet.value)),
  )
}

function finish() {
  if (!canEdit.value) return
  rolled.value = null
  claim('turn:end', () => say(endPf2eEncounter(sheet.value)))
}

const ORDINAL = ['1st', '2nd', '3rd']
const nextAttack = computed(() =>
  active.value ? ORDINAL[Math.min(2, turn.value?.attacks ?? 0)] : '1st',
)
const heading = computed(() => {
  if (!inCombat.value) return 'Not in combat'
  const round = `Round ${turn.value?.round ?? 1}`
  return active.value ? `${round} · your turn` : `${round} · waiting for your turn`
})
const status = computed(() => {
  const reaction = reactionReady.value ? 'reaction ready' : 'reaction used'
  if (!active.value) return reaction.replace(/^r/, 'R')
  const n = actionsLeft.value
  return `${n} action${n === 1 ? '' : 's'} left · ${reaction}`
})
const result = computed(() => resultIn('turn:'))
</script>

<template>
  <section class="panel stack turn" style="gap: 12px" aria-labelledby="turn-h">
    <div class="panel-title" style="margin: 0">
      <h2 id="turn-h">Turn</h2>
      <span class="turn__now" :class="{ 'is-active': active }">{{ heading }}</span>
    </div>
    <div class="turn__state">
      <span class="turn__pips" aria-hidden="true">
        <span
          v-for="n in maxActions"
          :key="n"
          class="turn__pip"
          :class="{ 'is-on': n <= actionsLeft }"
          >{{ n <= actionsLeft ? '◆' : '◇' }}</span
        >
        <span class="turn__pip turn__pip--reaction" :class="{ 'is-on': reactionReady }">↺</span>
      </span>
      <span class="turn__status">{{ status }}</span>
      <span class="small turn__map">Next Strike: {{ nextAttack }} attack</span>
    </div>
    <div class="turn__buttons">
      <button type="button" class="btn btn--sm turn__step" :disabled="!canEdit" @click="step">
        {{ active ? 'End turn' : 'Start turn' }}
      </button>
      <button
        type="button"
        class="btn btn--ghost btn--sm"
        :disabled="!canEdit || !!initiativeWhy"
        :title="initiativeWhy || initiative.note || undefined"
        :aria-describedby="initiativeWhy ? 'turn-init-why' : undefined"
        @click="rollInitiative"
      >
        {{ rolled !== null ? `Initiative ${rolled}` : `Roll initiative ${sign(initiative.value)}` }}
      </button>
      <span v-if="initiativeWhy" id="turn-init-why" class="sr-only">{{ initiativeWhy }}</span>
      <button
        type="button"
        class="btn btn--ghost btn--sm"
        :disabled="!canEdit || !inCombat"
        @click="finish"
      >
        End encounter
      </button>
    </div>
    <p v-if="result" class="roll-status" role="status" aria-live="polite">{{ result }}</p>
  </section>
</template>

<style scoped lang="scss">
.turn__now {
  font-size: 13px;
  font-weight: 600;
  color: var(--page-soft);

  &.is-active {
    color: var(--page-text);
  }
}

.turn__state {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 14px;
}

.turn__pips {
  display: inline-flex;
  gap: 6px;
  font-size: 18px;
}

.turn__pip {
  color: var(--page-muted);

  &.is-on {
    color: var(--page-text);
  }

  &--reaction.is-on {
    color: var(--accent-ink);
  }
}

.turn__status {
  font-weight: 600;
}

.turn__map {
  color: var(--page-soft);
}

.turn__buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;

  .turn__step {
    order: 3;
    margin-left: auto;
  }
}

@media (max-width: 600px) {
  .turn__buttons {
    display: grid;
    grid-template-columns: 1fr 1fr;

    .turn__step {
      order: -1;
      grid-column: 1 / -1;
      margin-left: 0;
    }
  }
}
</style>
