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
const always = computed(() => own.value.filter((e) => e.mode === 'permanent'))
const on = computed(() => new Set(sheet.value.effects?.on ?? []))
const given = computed(() => new Map((sheet.value.effects?.given ?? []).map((g) => [g.name, g])))
const notes = computed(() =>
  activeEffects(sheet.value)
    .filter((a) => a.def.note && a.def.mode !== 'permanent')
    .map((a) => `${a.def.name}: ${a.def.note}`),
)

function toggle(name: string) {
  if (canEdit.value) say(toggleEffect(sheet.value, name, draft.value.level))
}

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
        {{ e.name }}
      </button>
    </div>
    <div class="fx-row">
      <span class="caps">From allies</span>
      <span v-for="e in GIVEN_EFFECTS" :key="e.name" class="fx-given">
        <button
          type="button"
          class="chip"
          :aria-pressed="given.has(e.name)"
          :title="e.note"
          :disabled="!canEdit"
          @click="giveToggle(e.name, e.values)"
        >
          {{ e.name.replace(' (ally)', '') }}
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
