<script setup lang="ts">
// One castable spell, folded to its name: its text, upgrades, upcast control and
// cast buttons (with alternate costs). Used by the Spells and Summons panels;
// `blocked` names why it can't be cast there right now (Not your turn, At the max).
import { SCHOOL_LABELS } from '~/data/nimble/spells'
import type { NimbleSheet } from '~/types/sheets'
import { keyStatValue } from '~/utils/nimbleBuild'

type CastableSpell = ReturnType<typeof useNimbleSpells>['tiers']['value'][number]['spells'][number]

defineProps<{ spell: CastableSpell; blocked?: string }>()
// The parent owns the upcast state that `spell.at` comes from, so tier changes go back to it.
const emit = defineEmits<{ upcast: [tier: number] }>()

const { draft, canEdit } = useSheet<NimbleSheet>()
const sheet = computed(() => draft.value.sheet)
const keyValue = computed(() => keyStatValue(sheet.value))
const { maxTier, cast } = useNimbleSpells()
</script>

<template>
  <details name="nimble-spell" class="tile spell">
    <summary class="spell__head">
      <strong>{{ spell.name }}</strong>
      <span class="school" :class="`school--${spell.school}`">{{
        SCHOOL_LABELS[spell.school]
      }}</span>
      <small>{{ spell.cast }}</small>
    </summary>
    <div class="spell__body">
      <p><NimbleRulesText :text="spell.desc" :key-value="keyValue" /></p>
      <NimbleModifiers :target="spell.name" />
      <NimbleTargetNeed :spell="spell" />
      <div class="row" style="gap: 8px">
        <div v-if="spell.canUpcast" class="row" style="gap: 4px">
          <button
            type="button"
            class="step step--xs"
            :aria-label="`Lower the cast tier of ${spell.name}`"
            :disabled="!canEdit || spell.at <= spell.tier"
            @click="emit('upcast', spell.at - 1)"
          >
            −
          </button>
          <span class="spell__tier" aria-live="polite">Tier {{ spell.at }}</span>
          <button
            type="button"
            class="step step--xs"
            :aria-label="`Upcast ${spell.name}`"
            :disabled="!canEdit || spell.at >= maxTier"
            @click="emit('upcast', spell.at + 1)"
          >
            +
          </button>
        </div>
        <button
          type="button"
          class="btn btn--sm cast"
          :class="{ 'btn--ghost': spell.tier === 0 }"
          :disabled="
            !canEdit ||
            !!(blocked || spell.notNow || spell.needs) ||
            spell.short ||
            spell.busy ||
            spell.noActions
          "
          :title="
            blocked ||
            spell.notNow ||
            spell.needs ||
            (spell.busy
              ? `Still casting ${sheet.casting.spell}`
              : spell.noActions
                ? 'No actions left'
                : spell.short
                  ? spell.usesMinions
                    ? `Not enough shadow minions (needs ${spell.cost})`
                    : 'Not enough mana'
                  : spell.spread
                    ? 'Spends the actions you have now and the rest on your next turns; it takes effect then. Keep Concentration and take no other actions or reactions meanwhile (Core p. 15).'
                    : undefined)
          "
          @click="cast(spell)"
        >
          {{ blocked || spell.notNow || spell.needs || spell.label }}
        </button>
        <button
          v-if="spell.bloodLabel"
          type="button"
          class="btn btn--sm btn--ghost cast"
          :disabled="!canEdit || !!(blocked || spell.notNow) || spell.busy || spell.noActions"
          @click="cast(spell, true)"
        >
          {{ spell.bloodLabel }}
        </button>
        <button
          v-for="a in spell.alts"
          :key="a.key"
          type="button"
          class="btn btn--ghost btn--sm btn--wrap"
          :disabled="
            !canEdit ||
            !!blocked ||
            (!a.free && (!!spell.notNow || spell.busy || spell.noActions)) ||
            !!a.why
          "
          :title="a.why || undefined"
          @click="cast(spell, false, a.key)"
        >
          {{ a.why || a.label }}
        </button>
      </div>
    </div>
  </details>
</template>

<style scoped lang="scss">
.spell {
  padding: 0;
  gap: 0;

  summary {
    min-height: 44px;
    padding: 10px 14px;
    cursor: pointer;
  }

  p {
    font-size: 13px;
    line-height: 1.5;
    color: var(--page-soft);
  }

  &[open] {
    border-color: var(--accent);
  }
}

.spell__body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 14px 12px;
}

.spell__head {
  display: flex;
  align-items: center;
  gap: 4px 8px;
  flex-wrap: wrap;

  strong {
    font-size: 14px;
  }

  small {
    margin-left: auto;
    font-size: 12px;
    color: var(--page-muted);
  }
}

.spell__tier {
  min-width: 52px;
  text-align: center;
  font-size: 13px;
  font-weight: 600;
}

.cast {
  margin-left: auto;
}

// Each school tints its chip; mixing with the theme's own field and text keeps
// it readable on dark panels and on Cursed parchment.
.school {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--school) 22%, var(--field));
  color: color-mix(in srgb, var(--school) 45%, var(--page-text));

  &--fire {
    --school: #e8703a;
  }

  &--ice {
    --school: #4f9fe0;
  }

  &--lightning {
    --school: #d8c02e;
  }

  &--wind {
    --school: #4fbf8c;
  }

  &--radiant {
    --school: #e0b84a;
  }

  &--necrotic {
    --school: #9a6fd6;
  }
}
</style>
