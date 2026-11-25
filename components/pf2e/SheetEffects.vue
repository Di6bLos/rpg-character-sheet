<script setup lang="ts">
// The PF2e sheet's Effects: the hero's own toggles (Rage, Courageous Anthem), what's always
// on (Diehard, Sneak Attack), and effects allies give (Bless, Heroism +2). Active ones change
// the numbers on the sheet through `adjusted`; notes say what the sheet can't apply itself.
// Rules in utils/pf2eEffects.ts, effects in data/pf2e/effects.ts.
import type { Pf2eSheet } from '~/types/sheets'
import {
  GIVEN_EFFECTS,
  activeEffects,
  ownEffects,
  setGiven,
  toggleEffect,
} from '~/utils/pf2eEffects'

const { draft, canEdit, say } = useSheet<Pf2eSheet>()
const sheet = computed(() => draft.value.sheet)

const own = computed(() => ownEffects(sheet.value))
const toggles = computed(() => own.value.filter((e) => e.mode === 'toggle'))
const always = computed(() => own.value.filter((e) => e.mode === 'permanent' && !e.requires))
/** Effects that only count while a toggle is on (the ranger's edges with Hunt Prey), by toggle. */
const withToggle = computed(() => {
  const by = new Map<string, string[]>()
  for (const e of own.value.filter((x) => x.mode === 'permanent' && x.requires))
    by.set(e.requires!, [...(by.get(e.requires!) ?? []), e.name])
  return [...by.entries()]
})
const on = computed(() => new Set(sheet.value.effects?.on ?? []))
const given = computed(() => new Map((sheet.value.effects?.given ?? []).map((g) => [g.name, g])))
/** Notes of what's on; permanent ones only when they need a toggle (Outwit: against your prey). */
const notes = computed(() =>
  activeEffects(sheet.value)
    .filter((a) => a.def.note && (a.def.mode !== 'permanent' || a.def.requires))
    .map((a) => `${a.def.name}: ${a.def.note}`),
)

const { claim, resultIn } = useResultOwner()

function toggle(name: string) {
  if (canEdit.value)
    claim('effects:', () => say(toggleEffect(sheet.value, name, draft.value.level)))
}

/** Effects allies can give fold away (about 25), showing only those on you, until opened. */
const alliesOpen = ref(false)
const shownGiven = computed(() =>
  alliesOpen.value ? GIVEN_EFFECTS : GIVEN_EFFECTS.filter((e) => given.value.has(e.name)),
)

function giveToggle(name: string, values?: number[]) {
  if (!canEdit.value) return
  setGiven(sheet.value, name, !given.value.has(name), values?.[0])
}

function setValue(name: string, value: number) {
  if (canEdit.value) setGiven(sheet.value, name, true, value)
}
</script>

<template>
  <section class="panel stack" style="gap: 10px" aria-labelledby="fx-h">
    <h2 id="fx-h">Effects</h2>
    <div v-if="toggles.length" class="fx-row">
      <span class="caps">Yours</span>
      <button
        v-for="e in toggles"
        :key="e.name"
        type="button"
        class="chip"
        :aria-pressed="on.has(e.name)"
        :title="e.note"
        :disabled="!canEdit"
        @click="toggle(e.name)"
      >
        <span v-if="on.has(e.name)" aria-hidden="true">✓ </span>{{ e.name }}
      </button>
    </div>
    <div class="fx-row">
      <button
        type="button"
        class="fx-fold caps"
        :aria-expanded="alliesOpen"
        aria-controls="fx-allies"
        @click="alliesOpen = !alliesOpen"
      >
        From allies{{ given.size ? ` · ${given.size} on` : '' }}
        <span aria-hidden="true">{{ alliesOpen ? '▴' : '▾' }}</span>
      </button>
    </div>
    <div v-if="shownGiven.length" id="fx-allies" class="fx-row">
      <span v-for="e in shownGiven" :key="e.name" class="fx-given">
        <button
          type="button"
          class="chip"
          :aria-pressed="given.has(e.name)"
          :title="e.note"
          :disabled="!canEdit"
          @click="giveToggle(e.name, e.values)"
        >
          <span v-if="given.has(e.name)" aria-hidden="true">✓ </span
          >{{ e.name.replace(' (ally)', '') }}
        </button>
        <select
          v-if="e.values && given.has(e.name)"
          class="input fx-value"
          :aria-label="`${e.name} bonus`"
          :value="given.get(e.name)?.value ?? e.values[0]"
          :disabled="!canEdit"
          @change="setValue(e.name, Number(($event.target as HTMLSelectElement).value))"
        >
          <option v-for="v in e.values" :key="v" :value="v">+{{ v }}</option>
        </select>
      </span>
    </div>
    <p v-if="always.length" class="small muted">
      Always on: {{ always.map((e) => e.name).join(', ') }}
    </p>
    <p v-for="[toggleName, names] in withToggle" :key="toggleName" class="small muted">
      With {{ toggleName }}: {{ names.join(', ') }}
    </p>
    <p v-if="resultIn('effects:')" class="roll-status" role="status" aria-live="polite">
      {{ resultIn('effects:') }}
    </p>
    <ul v-if="notes.length" class="fx-notes">
      <li v-for="n in notes" :key="n" class="small">{{ n }}</li>
    </ul>
  </section>
</template>

<style scoped lang="scss">
.fx-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;

  .caps {
    min-width: 90px;
  }

  .chip[aria-pressed='true'] {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    color: var(--page-text);
    font-weight: 700;
  }
}

.fx-fold {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  cursor: pointer;
}

@media (pointer: coarse) {
  .fx-fold {
    min-height: 44px;
  }
}

.fx-given {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.fx-value {
  width: auto;
  min-height: 32px;
  padding: 2px 6px;
  font-size: 13px;
}

.fx-notes {
  margin: 0;
  padding-left: 18px;
  color: var(--page-soft);
}
</style>
