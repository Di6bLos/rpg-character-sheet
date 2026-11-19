<script setup lang="ts">
// The creature being attacked: its armor, whether it is vulnerable to this
// attack's damage, and Sunder Armor. Damage on the cards and in results counts
// them (Core p. 14).
import type { NimbleSheet } from '~/types/sheets'
import { TARGET_ARMORS } from '~/utils/nimbleTargetArmor'

const { draft, canEdit } = useSheet<NimbleSheet>()
const target = useAttackTarget()

const canSunder = computed(() =>
  draft.value.sheet.abilities.some((a) =>
    /\bALL melee attacks against that target ignore its armor\b/.test(a.desc),
  ),
)

function set(patch: Partial<typeof target.value>) {
  target.value = { ...target.value, ...patch }
}
</script>

<template>
  <div class="target">
    <div class="target__row" role="radiogroup" aria-label="Target armor">
      <span class="caps">Target armor</span>
      <button
        v-for="a in TARGET_ARMORS"
        :key="a.value"
        type="button"
        role="radio"
        class="chip"
        :class="{ 'chip--on': target.armor === a.value }"
        :aria-checked="target.armor === a.value"
        :disabled="!canEdit"
        @click="set({ armor: a.value })"
      >
        {{ a.label }}
      </button>
      <UiHelp
        label="About target armor"
        text="Medium armor takes only the dice (positive modifiers are ignored); Heavy armor takes half the dice. Crits, damage the target is vulnerable to and attacks that ignore armor deal full damage; a vulnerable unarmored target takes double. Damage on the cards shows what lands; hover it for the unarmored damage."
      />
    </div>
    <div class="target__row">
      <button
        type="button"
        class="chip"
        :class="{ 'chip--on': target.vulnerable }"
        :aria-pressed="target.vulnerable"
        :disabled="!canEdit"
        title="Vulnerable damage ignores armor; an unarmored target takes double"
        @click="set({ vulnerable: !target.vulnerable })"
      >
        Vulnerable to this damage
      </button>
      <button
        v-if="canSunder && target.armor !== 'none'"
        type="button"
        class="chip"
        :class="{ 'chip--on': target.sundered }"
        :aria-pressed="target.sundered"
        :disabled="!canEdit"
        title="Sunder Armor: melee attacks ignore its armor until the start of your next turn"
        @click="set({ sundered: !target.sundered })"
      >
        Sundered (melee ignores armor)
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

.chip--on {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--page-text);
}
</style>
