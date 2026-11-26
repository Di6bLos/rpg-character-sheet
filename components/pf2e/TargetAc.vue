<script setup lang="ts">
// The target row above the PF2e Attacks (and the Spells panel's spell attacks), laid out like
// Nimble's Target armor row: the target's AC for the degree of each attack (Player Core
// p. 401), off-guard (−2 AC, and sneak attack's dice), concealed and hidden (a flat check
// first), and what the hero's abilities add damage for (your prey this round, Devise a
// Stratagem). PF2e attacks roll against an AC number where Nimble picks an armor kind.
// State in usePf2eStrikes.
const { canEdit } = useSheet()
const { targetAc, damageFlags, targetFlags, conditionsOffered } = usePf2eStrikes()

/** Off-guard always (−2 AC, p. 443); the hero's own (prey, stratagem) when they have them. */
const FLAGS = [
  { key: 'offGuard', label: 'Off-guard · −2 AC', always: true },
  { key: 'huntedPrey', label: 'Your prey: first hit this round', always: false },
  { key: 'stratagem', label: 'Devise a Stratagem (INT to the next attack)', always: false },
] as const
const offered = computed(() =>
  FLAGS.filter((f) => f.always || conditionsOffered.value.includes(f.key)),
)
/** A concealed or hidden target asks for a flat check (pp. 431, 443–444). */
const SEEN = [
  { key: 'concealed', label: 'Concealed · DC 5 flat' },
  { key: 'hidden', label: 'Hidden · DC 11 flat' },
] as const

function flip(key: (typeof FLAGS)[number]['key']) {
  if (canEdit.value) damageFlags.value[key] = !damageFlags.value[key]
}

function flipSeen(key: (typeof SEEN)[number]['key']) {
  if (!canEdit.value) return
  const on = !targetFlags.value[key]
  targetFlags.value = { concealed: false, hidden: false, [key]: on }
}
</script>

<template>
  <div class="target">
    <div class="target__row">
      <span class="caps">Target AC</span>
      <label class="target__ac">
        <span class="sr-only">AC</span>
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
      <button
        v-for="f in SEEN"
        :key="f.key"
        type="button"
        class="chip"
        :class="{ 'chip--on': targetFlags[f.key] }"
        :aria-pressed="targetFlags[f.key]"
        :disabled="!canEdit"
        @click="flipSeen(f.key)"
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
