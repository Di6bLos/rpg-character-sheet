<script setup lang="ts">
// The Target row above the 5e Attacks (and the Spells panel's spell attacks), laid out like
// Nimble's Target armor row and PF2e's Target AC: the target's AC, so each roll says hit or
// miss (SRD 5.2.1 p. 7); whether it resists, is vulnerable to or immune to the damage (p. 16);
// Prone (Advantage from within 5 ft, Disadvantage from farther, p. 180); and an ally beside it,
// which lets Sneak Attack land without Advantage. State in useDnd5eSheet.
const { canEdit } = useSheet()
const { target } = useDnd5eSheet()

const FLAGS = [
  { key: 'resist', label: 'Resists · ½' },
  { key: 'vulnerable', label: 'Vulnerable · ×2' },
  { key: 'immune', label: 'Immune' },
  { key: 'prone', label: 'Prone' },
  { key: 'allyNear', label: 'Ally beside it' },
] as const

const ac = computed({
  get: () => target.value.ac ?? '',
  set: (v: number | string) => {
    const n = Number(v)
    target.value = { ...target.value, ac: v === '' || !Number.isFinite(n) ? null : n }
  },
})

function flip(key: (typeof FLAGS)[number]['key']) {
  if (canEdit.value) target.value = { ...target.value, [key]: !target.value[key] }
}
</script>

<template>
  <div class="target">
    <div class="target__row">
      <span class="caps">Target</span>
      <label class="target__ac">
        AC
        <input
          v-model.number="ac"
          class="input"
          type="number"
          inputmode="numeric"
          min="0"
          placeholder="e.g. 13"
          aria-label="Target AC"
        />
      </label>
      <button
        v-for="f in FLAGS"
        :key="f.key"
        type="button"
        class="chip"
        :class="{ 'chip--on': target[f.key] }"
        :aria-pressed="!!target[f.key]"
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
