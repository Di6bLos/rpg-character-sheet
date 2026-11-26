<script setup lang="ts">
// The target row above the PF2e Attacks (and the Spells panel's spell attacks), laid out like
// Nimble's Target armor row: the target's AC for the degree of each attack (Player Core
// p. 401), then the situations the hero's abilities add damage for (off-guard for sneak
// attack, your prey this round, Devise a Stratagem). PF2e attacks roll against an AC number
// where Nimble picks an armor kind. State in usePf2eStrikes.
const { canEdit } = useSheet()
const { targetAc, damageFlags, conditionsOffered } = usePf2eStrikes()

const FLAGS = [
  { key: 'offGuard', label: 'Off-guard' },
  { key: 'huntedPrey', label: 'Your prey: first hit this round' },
  { key: 'stratagem', label: 'Devise a Stratagem (INT to the next attack)' },
] as const
const offered = computed(() => FLAGS.filter((f) => conditionsOffered.value.includes(f.key)))

function flip(key: (typeof FLAGS)[number]['key']) {
  if (canEdit.value) damageFlags.value[key] = !damageFlags.value[key]
}
</script>

<template>
  <div class="target">
    <div class="target__row">
      <span class="caps">Target</span>
      <label class="target__ac">
        AC
        <input
          v-model.number="targetAc"
          class="input"
          type="number"
          inputmode="numeric"
          min="0"
          placeholder="—"
          aria-label="Target AC"
        />
      </label>
      <button
        v-for="f in offered"
        :key="f.key"
        type="button"
        class="chip"
        :class="{ 'chip--on': damageFlags[f.key] }"
        :aria-pressed="damageFlags[f.key]"
        :disabled="!canEdit"
        @click="flip(f.key)"
      >
        {{ f.label }}
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.target {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.target__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.target__ac {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;

  .input {
    width: 72px;
    min-height: 36px;
    padding: 4px 8px;
  }
}

.chip--on {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--page-text);
}

@media (pointer: coarse) {
  .target__ac .input {
    min-height: 44px;
  }
}
</style>
