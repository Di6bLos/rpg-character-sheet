<script setup lang="ts">
// What a spell rolls at the rank it'd be cast ("basic Reflex · 6d6 fire"), and the choices that
// change it: the action version (Heal, Force Barrage) and a melee spell attack (Ignition's
// d6s). Read from the spell text by utils/pf2eSpellRules.ts.
import type { Pf2eSpellDef } from '~/data/pf2e/types'
import { spellRules, spellSummary } from '~/utils/pf2eSpellRules'

const props = defineProps<{ spell: Pf2eSpellDef; rank: number }>()
const actions = defineModel<number | undefined>('actions')
const melee = defineModel<boolean>('melee', { default: false })

const rules = computed(() => spellRules(props.spell))
const summary = computed(() =>
  spellSummary(props.spell, { rank: props.rank, actions: actions.value, melee: melee.value }),
)
const GLYPH = ['', '◆', '◆◆', '◆◆◆']
</script>

<template>
  <span class="cast-options">
    <select
      v-if="rules.actionOptions.length > 1"
      v-model.number="actions"
      class="input input--sm"
      :aria-label="`Actions to cast ${spell.name} with`"
    >
      <option v-for="n in rules.actionOptions" :key="n" :value="n">
        {{ GLYPH[n] }} {{ n }} action{{ n === 1 ? '' : 's' }}
      </option>
    </select>
    <label v-if="rules.meleeDie" class="check">
      <input v-model="melee" type="checkbox" />
      Melee (d{{ rules.meleeDie }}s)
    </label>
    <small v-if="summary" class="summary">{{ summary }}</small>
  </span>
</template>

<style scoped lang="scss">
.cast-options {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.summary {
  color: var(--page-muted);
  font-size: 12px;
}

.check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;

  input {
    accent-color: var(--accent);
  }
}

.input--sm {
  min-height: 34px;
  padding: 4px 8px;
  font-size: 13px;
}
</style>
