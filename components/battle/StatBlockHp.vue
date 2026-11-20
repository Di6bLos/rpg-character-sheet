<script setup lang="ts">
// The stat block's HP: the bar with numbers, then −, amount, + and Set (Enter in the
// amount sets it). An empty amount means 1 for − and +.
import type { TurnRow, useInitiative } from '~/composables/useInitiative'

const props = defineProps<{ init: ReturnType<typeof useInitiative>; c: TurnRow }>()
const c = computed(() => props.c)

const hpMax = computed(() => c.value.hp_max ?? 0)
const hp = computed(() => c.value.hp ?? 0)
const fill = computed(() =>
  hpMax.value > 0 ? Math.min(100, Math.max(0, (hp.value / hpMax.value) * 100)) : 0,
)
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
  <div v-if="hpMax > 0" class="sbk__hp">
    <div class="sbk__bar">
      <span class="sbk__fill" :class="{ 'is-low': fill <= 50 }" :style="{ width: `${fill}%` }" />
      <span class="sbk__bar-text">{{ hp <= 0 ? 'Slain' : `${hp} / ${hpMax}` }}</span>
    </div>
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

.sbk__bar {
  position: relative;
  height: 22px;
  border-radius: 6px;
  background: var(--track);
  overflow: hidden;
}

.sbk__fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--secondary);

  &.is-low {
    background: var(--danger);
  }
}

.sbk__bar-text {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--page-text);
  text-shadow: 0 0 3px var(--panel-bg);
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
</style>
