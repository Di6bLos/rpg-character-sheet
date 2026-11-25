<script setup lang="ts">
// One ability in the PF2e Actions panel: its action glyph (named for screen readers), name,
// frequency with uses left, trigger, requirements, cost and usage, what it does in short (the rest folded),
// the choices its Use needs (skill, Treat Wounds DC, weapon, actions, healing yourself) and
// Use; after it makes a Strike, that Strike's damage buttons. SheetActions.vue does the rest.
import type { Pf2eRank } from '~/types/sheets'
import { sign } from '~/utils/dice'
import {
  type Pf2eActionEntry,
  type Pf2eCheckChoice,
  type Pf2eRowState,
  costGlyph,
  actionCostLabel,
  frequencyLabel,
} from '~/utils/pf2eActions'

const props = defineProps<{
  entry: Pf2eActionEntry
  why: string
  left: number
  choices: Pf2eCheckChoice[]
  weapons: { index: number; name: string }[]
  tiers: { rank: Pf2eRank; dc: number; bonus: number }[]
  dmg: string
}>()
const emit = defineEmits<{
  use: [state: Pf2eRowState]
  damage: [crit: boolean, state: Pf2eRowState]
}>()

const state = reactive<Pf2eRowState>({})
const r = computed(() => props.entry.rules)
const glyph = computed(() => costGlyph(r.value.cost))
const label = computed(() => actionCostLabel(r.value.cost))
const range = computed(() => {
  const c = r.value.cost
  return c?.kind === 'actions' && c.max > c.min
    ? Array.from({ length: c.max - c.min + 1 }, (_, i) => c.min + i)
    : []
})
const heals = computed(
  () =>
    r.value.healing.length > 0 || !!r.value.check?.tiers || !!props.entry.via?.rules.check?.tiers,
)
const TIER: Record<Pf2eRank, string> = {
  U: 'Untrained',
  T: 'Trained',
  E: 'Expert',
  M: 'Master',
  L: 'Legendary',
}
const id = computed(() => `act-${props.entry.key}`)
const checkLabel = computed(() => {
  const c = r.value.check ?? props.entry.via?.rules.check
  if (!c) return ''
  const vs = c.against ? ` vs ${c.against}` : c.dc ? ` vs DC ${c.dc}` : ''
  return `${c.skills[0] === 'any' ? 'Skill' : c.skills.join(' or ')} check${vs}${c.attack ? ' (attack)' : ''}`
})
</script>

<template>
  <div class="arow tile" :aria-labelledby="`${id}-name`" role="group">
    <div class="arow__head">
      <span v-if="glyph" class="arow__glyph" role="img" :aria-label="label">{{ glyph }}</span>
      <span v-else-if="label" class="arow__time">{{ label }}</span>
      <strong :id="`${id}-name`">{{ entry.name }}</strong>
      <small v-if="entry.from" class="muted">· {{ entry.from }}</small>
      <span v-if="r.frequency" class="arow__freq small">
        {{ frequencyLabel(r.frequency) }}
        <template v-if="!r.frequency.perTarget"> · {{ left }} left</template>
      </span>
    </div>
    <p v-if="r.trigger" class="small arow__line"><strong>Trigger</strong> {{ r.trigger }}</p>
    <p v-if="r.requirements" class="small arow__line">
      <strong>Requirements</strong> {{ r.requirements }}
    </p>
    <p v-if="r.costNote" class="small arow__line"><strong>Cost</strong> {{ r.costNote }}</p>
    <p v-if="r.usage" class="small arow__line"><strong>Usage</strong> {{ r.usage }}</p>
    <p class="small arow__line">{{ entry.summary }}</p>
    <p v-if="checkLabel || dmg || entry.via" class="small muted arow__line">
      <template v-if="entry.via">Makes a {{ entry.via.name }} check. </template>
      <template v-if="checkLabel">{{ checkLabel }}. </template>
      <template v-if="dmg">Rolls {{ dmg }}.</template>
    </p>
    <details v-if="entry.text.length > entry.summary.length + 20" class="arow__more">
      <summary class="small">Full text</summary>
      <p class="small arow__full">{{ entry.text }}</p>
    </details>
    <div class="arow__controls">
      <select
        v-if="choices.length > 1"
        v-model="state.skill"
        class="input arow__select"
        :aria-label="`${entry.name}: skill`"
      >
        <option :value="undefined">
          {{ choices[0]?.skill }} {{ sign(choices[0]?.bonus ?? 0) }}
        </option>
        <option v-for="c in choices.slice(1)" :key="c.skill" :value="c.skill">
          {{ c.skill }} {{ sign(c.bonus) }}
        </option>
      </select>
      <span v-else-if="choices.length === 1" class="small muted">
        {{ choices[0]?.skill }} {{ sign(choices[0]?.bonus ?? 0) }}
      </span>
      <select
        v-if="tiers.length > 1"
        v-model="state.tier"
        class="input arow__select"
        :aria-label="`${entry.name}: DC`"
      >
        <option :value="undefined">DC {{ tiers[0]?.dc }}</option>
        <option v-for="t in tiers.slice(1)" :key="t.rank" :value="t.rank">
          DC {{ t.dc }} ({{ TIER[t.rank] }}, +{{ t.bonus }} HP)
        </option>
      </select>
      <select
        v-if="r.strike && weapons.length > 1"
        v-model="state.weapon"
        class="input arow__select"
        :aria-label="`${entry.name}: weapon`"
      >
        <option :value="undefined">{{ weapons[0]?.name }}</option>
        <option v-for="w in weapons.slice(1)" :key="w.index" :value="w.index">{{ w.name }}</option>
      </select>
      <select
        v-if="range.length"
        v-model="state.actions"
        class="input arow__select"
        :aria-label="`${entry.name}: actions to spend`"
      >
        <option :value="undefined">{{ range[0] }} action{{ range[0] === 1 ? '' : 's' }}</option>
        <option v-for="n in range.slice(1)" :key="n" :value="n">{{ n }} actions</option>
      </select>
      <label v-if="heals" class="small arow__self">
        <input v-model="state.onSelf" type="checkbox" />
        On me
      </label>
      <button
        type="button"
        class="btn btn--sm arow__use"
        :disabled="!!why"
        :title="why || undefined"
        :aria-describedby="why ? `${id}-why` : undefined"
        @click="emit('use', state)"
      >
        Use
      </button>
      <span v-if="why" :id="`${id}-why`" class="small muted">{{ why }}</span>
      <template v-if="state.struck">
        <button type="button" class="btn btn--ghost btn--sm" @click="emit('damage', false, state)">
          Damage
        </button>
        <button
          type="button"
          class="btn btn--ghost btn--sm"
          title="Critical hit: double damage"
          @click="emit('damage', true, state)"
        >
          Crit ×2
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
.arow {
  gap: 6px;
  padding: 12px 14px;
}

.arow__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;

  strong {
    font-size: 15px;
  }
}

.arow__glyph {
  color: var(--secondary);
  font-size: 13px;
  letter-spacing: 1px;
}

.arow__time {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--page-muted);
}

.arow__freq {
  margin-left: auto;
  color: var(--page-soft);
}

.arow__line {
  margin: 0;
  line-height: 1.45;
  color: var(--page-soft);

  strong {
    color: var(--page-text);
  }
}

.arow__more summary {
  cursor: pointer;
  color: var(--page-muted);
}

.arow__full {
  white-space: pre-line;
  margin: 6px 0 0;
  color: var(--page-soft);
}

.arow__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.arow__select {
  width: auto;
  max-width: 100%;
  min-height: 36px;
  padding: 4px 8px;
  font-size: 13px;
}

.arow__self {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
</style>
