<script setup lang="ts">
// The stat block's HP: the numbers, the draggable bar the hero column uses (drag or the
// arrow keys preview the change, let go or Enter applies it), then −, amount, + and Set
// (Enter in the amount sets it). An empty amount means 1 for − and +.
import type { TurnRow, useInitiative } from '~/composables/useInitiative'

const props = defineProps<{ init: ReturnType<typeof useInitiative>; c: TurnRow }>()
const c = computed(() => props.c)
// On touch the steppers, amount and Set are 44px targets, 8px apart.
const { touch } = useBoardLayout()

const hpMax = computed(() => c.value.hp_max ?? 0)
const hp = computed(() => c.value.hp ?? 0)
const tone = computed(() => (hp.value * 2 <= hpMax.value ? 'danger' : ''))
const amount = ref<number | null>(null)
watch(
  () => props.c.id,
  () => {
    amount.value = null
  },
)
function typed(): number {
  const n = Math.floor(Math.abs(Number(amount.value)))
  return Number.isFinite(n) ? Math.min(999, n) : 0
}
function change(sign: 1 | -1) {
  void props.init.adjustHp(c.value, sign * (typed() || 1))
  amount.value = null
}
function setHp() {
  if (amount.value === null || String(amount.value) === '') return
  void props.init.adjustHp(c.value, typed() - hp.value)
  amount.value = null
}
</script>

<template>
  <div v-if="hpMax > 0" class="sbk__hp" :class="{ 'sbk__hp--touch': touch }">
    <div class="sbk__head">
      <span class="sbk__label">Hit points</span>
      <span class="sbk__value" aria-live="polite">{{
        hp <= 0 ? 'Slain' : `${hp} / ${hpMax}`
      }}</span>
    </div>
    <NimbleHpBar
      class="sbk__drag"
      :hp="hp"
      :max="hpMax"
      :tone="tone"
      @change="(delta: number) => init.adjustHp(c, delta)"
    />
    <div class="sbk__ctl" role="group" :aria-label="`${c.name} hit points`">
      <button
        type="button"
        class="step step--xs"
        :aria-label="`${c.name}: lose HP`"
        @click="change(-1)"
      >
        −
      </button>
      <input
        v-model.number="amount"
        class="input sbk__amount"
        type="number"
        min="0"
        max="999"
        placeholder="amount"
        :aria-label="`Amount for ${c.name}`"
        @keydown.enter.prevent="setHp"
      />
      <button
        type="button"
        class="step step--xs"
        :aria-label="`${c.name}: gain HP`"
        @click="change(1)"
      >
        +
      </button>
      <button type="button" class="btn btn--ghost btn--sm sbk__set" @click="setHp">Set</button>
    </div>
  </div>
  <p v-else class="sbk__muted">Dies to any damage.</p>
</template>

<style scoped lang="scss">
.sbk__hp {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sbk__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.sbk__label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--page-muted);
}

.sbk__value {
  font-family: var(--font-heading);
  font-size: 16px;
  font-variant-numeric: tabular-nums;
}

// A little thicker than the hero column's, as the old bar was.
.sbk__drag :deep(.meter) {
  height: 12px;
}

.sbk__ctl {
  display: flex;
  align-items: center;
  gap: 6px;
}

.sbk__amount {
  flex: 1 1 0;
  min-width: 0;
  min-height: 32px;
  padding: 4px 8px;
  text-align: center;
}

.sbk__set {
  min-height: 32px;
}

.sbk__muted {
  margin: 0;
  font-size: 12.5px;
  color: var(--page-muted);
}

// --- Touch -----------------------------------------------------------------------------
.sbk__hp--touch {
  .sbk__ctl {
    gap: 8px;
  }

  .sbk__amount,
  .sbk__set {
    min-height: 44px;
  }

  // The 16px value would clip the placeholder in a narrow column (tablet-wide).
  .sbk__amount {
    padding-inline: 4px;
    font-size: 16px;

    &::placeholder {
      font-size: 13px;
    }
  }
}
</style>
