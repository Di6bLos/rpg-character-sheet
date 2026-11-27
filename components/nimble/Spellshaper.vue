<script setup lang="ts">
import type { NimbleSheet } from '~/types/sheets'
import { abilityBaseName, keyStatValue } from '~/utils/nimbleBuild'
import { abilityCounters, manaPool, spellshape, spellshapeCost } from '~/utils/nimblePlay'

const { draft, canEdit, say } = useSheet<NimbleSheet>()
const sheet = computed(() => draft.value.sheet)
const keyValue = computed(() => keyStatValue(sheet.value))
const amounts = ref<Record<string, number>>({})

const counter = computed(
  () =>
    abilityCounters(sheet.value, draft.value.level).find(
      (e) => abilityBaseName(e.ability.name) === 'Spellshaper',
    )?.counters[0],
)
const spent = computed(() => !!counter.value && counter.value.used >= counter.value.max)

const options = computed(() =>
  sheet.value.abilities.flatMap((a) => {
    const cost = spellshapeCost(a.desc)
    if (!cost) return []
    const amount = Math.max(cost.min, amounts.value[a.name] ?? cost.min)
    const text = a.desc.replace(/^\([^)]*\)\s*/, '')
    const label = cost.refund ? `−${cost.refund} mana · +1 action` : `${amount} mana`
    const why = spent.value
      ? 'Used this turn'
      : amount > manaPool(sheet.value)
        ? `Needs ${amount} mana`
        : ''
    return [{ name: a.name, cost, amount, text, label, why }]
  }),
)

function setAmount(name: string, value: number, min: number) {
  amounts.value = {
    ...amounts.value,
    [name]: Math.max(min, Math.min(manaPool(sheet.value), value)),
  }
}

function use(name: string, amount: number) {
  if (canEdit.value) say(spellshape(sheet.value, draft.value.level, name, amount))
}
</script>

<template>
  <details v-if="options.length" class="shaper" open>
    <summary class="caps">
      Spellshaper
      <small>{{ spent ? 'used this turn' : '1 per turn' }}</small>
    </summary>
    <div class="shaper__list">
      <div v-for="o in options" :key="o.name" class="tile shaper__opt">
        <div class="shaper__head">
          <strong>{{ o.name }}</strong>
          <small>{{ o.label }}</small>
        </div>
        <p><NimbleRulesText :text="o.text" :key-value="keyValue" /></p>
        <div class="shaper__use">
          <template v-if="o.cost.more">
            <button
              type="button"
              class="step step--xs"
              :aria-label="`Spend 1 less mana on ${o.name}`"
              :disabled="!canEdit || o.amount <= o.cost.min"
              @click="setAmount(o.name, o.amount - 1, o.cost.min)"
            >
              −
            </button>
            <strong aria-live="polite">{{ o.amount }}</strong>
            <button
              type="button"
              class="step step--xs"
              :aria-label="`Spend 1 more mana on ${o.name}`"
              :disabled="!canEdit || o.amount >= manaPool(sheet)"
              @click="setAmount(o.name, o.amount + 1, o.cost.min)"
            >
              +
            </button>
          </template>
          <button
            type="button"
            class="btn btn--sm btn--wrap"
            :disabled="!canEdit || !!o.why"
            :title="o.why || undefined"
            @click="use(o.name, o.amount)"
          >
            {{ o.why || 'Use' }}
          </button>
        </div>
      </div>
    </div>
  </details>
</template>

<style scoped lang="scss">
.shaper {
  display: flex;
  flex-direction: column;
  gap: 8px;

  > summary {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    list-style: none;

    @media (pointer: coarse) {
      min-height: 44px;
    }

    &::-webkit-details-marker {
      display: none;
    }

    small {
      font-size: 11px;
      letter-spacing: normal;
      text-transform: none;
      color: var(--page-muted);
    }

    &::after {
      content: '▾';
      margin-left: auto;
      font-size: 12px;
      letter-spacing: normal;
      color: var(--accent-text);
    }
  }

  &[open] > summary {
    margin-bottom: 8px;

    &::after {
      content: '▴';
    }
  }
}

.shaper__list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(230px, 100%), 1fr));
  gap: 8px;
}

.shaper__opt {
  gap: 6px;
  padding: 10px 14px;

  p {
    font-size: 13px;
    line-height: 1.5;
    color: var(--page-soft);
  }
}

.shaper__head {
  display: flex;
  align-items: baseline;
  gap: 8px;

  strong {
    font-size: 14px;
  }

  small {
    margin-left: auto;
    font-size: 11px;
    font-weight: 700;
    color: var(--accent-text);
    white-space: nowrap;
  }
}

.shaper__use {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  margin-top: auto;

  > strong {
    min-width: 20px;
    text-align: center;
  }

  .btn {
    margin-left: 6px;
  }
}
</style>
