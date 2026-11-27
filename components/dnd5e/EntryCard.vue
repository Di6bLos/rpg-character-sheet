<script setup lang="ts">
// One feature, trait, feat benefit or option of a 5e hero as a card, the way Nimble's ability
// actions and PF2e's ActionRow show theirs: name and where it's from, its cost pill, its uses
// left, its dice and save DC, the text (folded), and Use, which pays the cost on the turn,
// spends the use and does what the rules engine knows (utils/dnd5eFeatures.ts useEntry). Lay on
// Hands-style pools take an amount; Bardic Inspiration picks the ally it goes to. Passive ones
// are cards without Use.
import type { Dnd5eSheet } from '~/types/sheets'
import { type Dnd5eEntry, entryWhy, useEntry } from '~/utils/dnd5eFeatures'
import { usesLeft } from '~/utils/dnd5ePlay'
import { loreHtml } from '~/utils/loreText'

const props = defineProps<{ entry: Dnd5eEntry; compact?: boolean }>()
const { draft, canEdit, say } = useSheet<Dnd5eSheet>()
const { claim, resultFor } = useResultOwner()
const { target, columns } = useDnd5eSheet()
const typed = useTypedRoll()
const sheet = computed(() => draft.value.sheet)
const e = computed(() => props.entry)
const key = computed(() => `act:${e.value.key}`)

const max = computed(
  () => sheet.value.resources?.find((r) => r.name === e.value.resource)?.max ?? 0,
)
const left = computed(() => (e.value.resource ? usesLeft(sheet.value, e.value.resource) : 0))
const why = computed(() => (e.value.passive ? '' : entryWhy(sheet.value, e.value)))
const pool = ref(1)

/** Bardic Inspiration and the like go to an ally in the campaign (useDnd5eHelp().inspire). */
const helping = props.entry.rule?.give ? useDnd5eHelp() : null
const ally = ref('')

async function give() {
  if (!helping || !ally.value || why.value) return
  const line = await helping.inspire(ally.value, e.value.dice ?? '', () =>
    useEntry(sheet.value, draft.value.level, e.value),
  )
  if (line) claim(key.value, () => say(line))
}

function use() {
  if (!canEdit.value) return
  if (helping && ally.value) return void give()
  typed.run(key.value, e.value.name, () => {
    const line = useEntry(sheet.value, draft.value.level, e.value, {
      amount: pool.value,
      target: target.value,
      columns: columns.value,
    })
    claim(key.value, () => say(line))
  })
}

const facts = computed(() =>
  [
    e.value.dice ? `${e.value.dice}${e.value.damageType ? ` ${e.value.damageType}` : ''}` : '',
    e.value.save ? `DC ${e.value.save.dc} ${e.value.save.ability} save` : '',
    e.value.duration ?? '',
    e.value.oncePerTurn ? 'once a turn' : '',
  ].filter(Boolean),
)
const RESOURCE_PIPS = 8
</script>

<template>
  <div class="tile entry" :class="{ 'entry--compact': compact }" role="group" :aria-label="e.name">
    <div class="entry__head">
      <strong>{{ e.name }}</strong>
      <small v-if="e.from" class="muted">· {{ e.from }}</small>
      <Dnd5eCostPill :cost="e.cost" />
    </div>
    <div v-if="e.resource" class="entry__uses">
      <template v-if="max && max <= RESOURCE_PIPS && !e.rule?.pool">
        <span class="pips" role="img" :aria-label="`${left} of ${max} ${e.resource} left`">
          <i v-for="n in max" :key="n" class="pip-dot" :class="{ on: n <= left }" />
        </span>
      </template>
      <small class="muted"
        >{{ left }} / {{ max }} {{ e.resource === e.name ? 'left' : e.resource
        }}{{ e.spend > 1 ? ` · costs ${e.spend}` : '' }}</small
      >
    </div>
    <p v-if="facts.length" class="small entry__facts">{{ facts.join(' · ') }}</p>
    <p v-if="e.text && e.full" class="small entry__sum">{{ e.text }}</p>
    <details v-if="e.text" class="entry__text">
      <summary class="small">Rules</summary>
      <!-- eslint-disable-next-line vue/no-v-html -- loreHtml escapes everything first -->
      <div class="small" v-html="loreHtml(e.full ?? e.text)" />
    </details>
    <div v-if="!e.passive" class="entry__act">
      <label v-if="helping?.allies.value.length" class="ally">
        <span class="sr-only">Give it to</span>
        <select v-model="ally" class="input input--sm" :disabled="!canEdit">
          <option value="">An ally (say who)</option>
          <option v-for="a in helping.allies.value" :key="a.id" :value="a.id">{{ a.name }}</option>
        </select>
      </label>
      <label v-if="e.rule?.pool" class="pool">
        <span class="sr-only">Points to spend</span>
        <input
          v-model.number="pool"
          class="input"
          type="number"
          min="1"
          :max="left"
          inputmode="numeric"
          :disabled="!canEdit"
        />
      </label>
      <button
        type="button"
        class="btn btn--sm"
        :class="{ 'btn--ghost': !!why }"
        :disabled="!canEdit || !!why"
        :aria-label="why ? `${e.name}: ${why}` : `Use ${e.name}`"
        @click="use"
      >
        {{ why || 'Use' }}
      </button>
    </div>
    <NimbleDiceEntry
      v-if="typed.prompt(key)"
      :label="typed.prompt(key)"
      action="Roll"
      :disabled="!canEdit"
      @submit="typed.submit"
    />
    <p v-if="resultFor(key)" class="roll-status attack__result" role="status">
      {{ resultFor(key) }}
    </p>
  </div>
</template>

<style scoped lang="scss">
.entry {
  gap: 8px;
  padding: 14px;
}

.entry__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;

  strong {
    font-size: 15px;
  }
}

.entry__uses {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.pips {
  display: inline-flex;
  gap: 4px;
}

.pip-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1.5px solid var(--secondary);

  &.on {
    background: var(--secondary);
  }
}

.entry__sum {
  margin: 0;
  color: var(--page-soft);
}

.entry__facts {
  margin: 0;
  color: var(--accent-text);
  font-weight: 600;
}

.entry__text {
  summary {
    min-height: 28px;
    display: flex;
    align-items: center;
    cursor: pointer;
    color: var(--page-muted);
  }

  div {
    color: var(--page-soft);
    line-height: 1.45;

    :deep(p) {
      margin: 0.3em 0;
    }
  }
}

.entry__act {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: auto;

  .btn {
    flex: 1;
  }
}

.ally .input {
  min-height: 36px;
  max-width: 160px;
}

.pool .input {
  width: 72px;
  min-height: 36px;
}

.attack__result {
  margin: 0;
  font-size: 13px;
}

@media (pointer: coarse) {
  .entry__text summary,
  .ally .input {
    min-height: 36px;
    max-width: 160px;
  }

  .pool .input {
    min-height: 44px;
  }
}
</style>
