<script setup lang="ts">
// The creature being attacked: its armor, whether it is vulnerable to this
// attack's damage, Sunder Armor, and the statuses the hero's spells need or set
// (Smoldering, Hampered). Damage on the cards and in results counts
// them (Core p. 14).
import type { NimbleSheet } from '~/types/sheets'
import { knownSpells } from '~/utils/nimbleBuild'
import { TARGET_ARMORS } from '~/utils/nimbleTargetArmor'

const { draft, canEdit } = useSheet<NimbleSheet>()
const target = useAttackTarget()

/** Statuses on the target that one of the hero's spells needs or changes. */
const spellStatuses = computed(() => {
  const text = knownSpells(draft.value.sheet)
    .map((s) => s.desc)
    .join(' ')
  return [
    /\bSmoldering\b/.test(text) && {
      key: 'smoldering' as const,
      label: 'Smoldering',
      title:
        'Some of your spells need a Smoldering target, set it or end it; spells change it as they land',
    },
    /\bHampered\b|On hit: Slowed/.test(text) && {
      key: 'hampered' as const,
      label: 'Hampered',
      title:
        'Slowed, Dazed, Grappled, Restrained or Prone; some of your spells do more against it or cause it',
    },
  ].filter((x) => !!x)
})

/** A known spell (Condemn) gives advantage on the next attack against its target. */
const canCondemn = computed(
  () =>
    (target.value.condemned ?? 0) > 0 ||
    knownSpells(draft.value.sheet).some((s) =>
      /\bThe next attack against that enemy is made with advantage\b/.test(s.desc),
    ),
)

const canSunder = computed(() =>
  draft.value.sheet.abilities.some((a) =>
    /\bALL melee attacks against that target ignore its armor\b/.test(a.desc),
  ),
)

function set(patch: Partial<typeof target.value>) {
  // Set by hand, Hampered stays until it's turned off (not just until your next turn).
  const byHand = 'hampered' in patch ? { hamperedUntilTurn: false } : {}
  target.value = { ...target.value, ...patch, ...byHand }
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
        :class="{ 'chip--on': !!target.covered }"
        :aria-pressed="!!target.covered"
        :disabled="!canEdit"
        title="Behind cover: your attacks against it take +1 disadvantage"
        @click="target = { ...target, covered: !target.covered }"
      >
        Covered
      </button>
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
      <button
        v-for="st in spellStatuses"
        :key="st.key"
        type="button"
        class="chip"
        :class="{ 'chip--on': target[st.key] }"
        :aria-pressed="target[st.key]"
        :disabled="!canEdit"
        :title="st.title"
        @click="set({ [st.key]: !target[st.key] })"
      >
        {{ st.label }}
      </button>
      <button
        v-if="canCondemn"
        type="button"
        class="chip"
        :class="{ 'chip--on': !!target.condemned }"
        :aria-pressed="!!target.condemned"
        :disabled="!canEdit"
        title="Condemn: the next attack against it is made with advantage"
        @click="target = { ...target, condemned: target.condemned ? 0 : 1 }"
      >
        Condemned{{ (target.condemned ?? 0) > 1 ? ` (${target.condemned}× advantage)` : '' }}
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
