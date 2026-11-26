<script setup lang="ts">
// The PF2e sheet's resources, the way Nimble's SheetResources shows mana and the class
// resource, each its own folding panel: Focus Points while no focus spell shows them in Spells
// (Player Core p. 299), then each of the hero's own toggles (Rage, Hunt Prey, Panache…), what
// it does and turning it on or off. Using the ability in Actions also turns it on and pays for
// it; here it's only switched. Effects in data/pf2e/effects.ts, rules in utils/pf2eEffects.ts.
import type { Pf2eSheet } from '~/types/sheets'
import { activeEffects, ownEffects, toggleEffect } from '~/utils/pf2eEffects'

const { draft, canEdit, say } = useSheet<Pf2eSheet>()
const { claim, resultIn } = useResultOwner()
const sheet = computed(() => draft.value.sheet)

const showFocus = computed(() => sheet.value.focus.max > 0 && !sheet.value.focusSpells?.length)
const toggles = computed(() => ownEffects(sheet.value).filter((e) => e.mode === 'toggle'))
const on = computed(() => new Set(sheet.value.effects?.on ?? []))
const values = computed(() => new Map(activeEffects(sheet.value).map((a) => [a.def.name, a.value])))

function setFocus(n: number) {
  if (!canEdit.value) return
  sheet.value.focus.current = sheet.value.focus.current === n ? n - 1 : n
}

function toggle(name: string) {
  if (canEdit.value)
    claim(`res:${name}`, () => say(toggleEffect(sheet.value, name, draft.value.level)))
}
</script>

<template>
  <div v-if="showFocus || toggles.length" class="stack" style="gap: 24px; min-width: 0">
    <section v-if="showFocus" class="panel stack" aria-labelledby="focus-h">
      <UiFold name="Focus Points" />
      <div class="panel-title" style="margin: 0">
        <span class="title-help">
          <h2 id="focus-h">Focus Points</h2>
          <UiHelp
            label="About Focus Points"
            text="Spent on focus spells and some class abilities; Refocus (10 minutes) gets 1 back, and daily preparations fill the pool (Player Core p. 299)."
          />
        </span>
        <span class="badge badge--outline">{{ sheet.focus.current }} / {{ sheet.focus.max }}</span>
      </div>
      <div class="row" style="gap: 6px">
        <button
          v-for="n in sheet.focus.max"
          :key="n"
          type="button"
          class="pip pip--secondary"
          :aria-label="`Focus Point ${n}`"
          :aria-pressed="sheet.focus.current >= n"
          :disabled="!canEdit"
          @click="setFocus(n)"
        />
      </div>
      <p v-if="sheet.focus.note" class="small muted" style="margin: 0">{{ sheet.focus.note }}</p>
    </section>

    <section
      v-for="e in toggles"
      :key="e.name"
      class="panel stack"
      :class="{ 'is-on': on.has(e.name) }"
      :aria-label="e.name"
    >
      <UiFold :name="e.name" />
      <div class="panel-title" style="margin: 0">
        <span class="title-help">
          <h2>{{ e.name }}</h2>
          <UiHelp v-if="e.note" :label="`About ${e.name}`" :text="e.note" />
        </span>
        <span class="badge badge--outline">{{
          on.has(e.name) ? (values.get(e.name) ? `On · +${values.get(e.name)}` : 'On') : 'Off'
        }}</span>
      </div>
      <div class="row" style="gap: 10px; flex-wrap: wrap">
        <button
          type="button"
          class="btn"
          :class="{ 'btn--ghost': on.has(e.name) }"
          :disabled="!canEdit"
          :aria-pressed="on.has(e.name)"
          @click="toggle(e.name)"
        >
          {{ on.has(e.name) ? `End ${e.name}` : e.name }}
        </button>
        <span class="small muted">Use it from Actions to pay its actions too.</span>
      </div>
      <p v-if="resultIn(`res:${e.name}`)" class="roll-status" role="status" aria-live="polite">
        {{ resultIn(`res:${e.name}`) }}
      </p>
    </section>
  </div>
</template>

<style scoped lang="scss">
.is-on {
  border: 1.5px solid var(--accent);
}
</style>
