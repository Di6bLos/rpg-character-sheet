<script setup lang="ts">
// The phone board's strip with the player's hero, on every tab but Hero: portrait (the
// dead portrait once dead), name, an HP bar with temp HP, the first two conditions,
// and Armor and mana (or the class resource); a 5e hero's AC and spell slots (or Speed). A
// tap goes to the Hero tab.
import type { ComputedRef } from 'vue'
import type { AnySheet, Dnd5eSheet, NimbleSheet } from '~/types/sheets'
import { exhaustionOf } from '~/utils/dnd5eConditions'
import { acNow, isDead as dnd5eDead, speedNow } from '~/utils/dnd5ePlay'
import { slotsLeft } from '~/utils/dnd5eSpells'
import { armorNow } from '~/utils/nimblePlay'
import { hpClass } from '~/utils/roster'

const emit = defineEmits<{ 'go-hero': [] }>()

const { draft, portrait } = useSheet<AnySheet>()
const sheet = computed(() => draft.value.sheet)

interface Strip {
  dead: ComputedRef<boolean>
  /** The first two conditions and statuses, in the Hero tab's tones. */
  chips: ComputedRef<{ name: string; tone: string }[]>
  more: ComputedRef<number>
  armor: ComputedRef<{ label: string; value: number }>
  tile: ComputedRef<{ label: string; value: string; mana: boolean } | null>
}

/**
 * Nimble: conditions in the Hero tab's tones (HeroConditions): automatic ones plain, set
 * conditions `set`, spell and ability statuses `status`; Armor with spell statuses
 * (Electrocharge, Dragonform), as the hero column shows it; mana when the hero has any, else
 * the class resource's count (Fury Dice, charges…).
 */
function nimbleStrip(): Strip {
  const nimble = sheet as ComputedRef<NimbleSheet>
  const { dead } = useNimbleVitals()
  const { active, statuses } = useNimbleConditions()
  const { hasMana, resource, resourceShort } = useNimbleResource()
  return {
    dead,
    chips: computed(() =>
      [
        ...active.value
          .filter((c) => !c.fromEffect)
          .map((c) => ({ name: c.name, tone: c.automatic ? '' : 'set' })),
        ...statuses.value.map((s) => ({ name: s.label, tone: 'status' })),
      ].slice(0, 2),
    ),
    more: computed(
      () => active.value.filter((c) => !c.fromEffect).length + statuses.value.length - 2,
    ),
    armor: computed(() => ({
      label: 'Armor',
      value: armorNow(nimble.value, draft.value.level).value,
    })),
    tile: computed(() => {
      const m = nimble.value.mana
      if (hasMana.value) return { label: 'Mana', value: String(m.current + m.temp), mana: true }
      return resource.value
        ? { label: resource.value.name, value: resourceShort.value, mana: false }
        : null
    }),
  }
}

/** 5e: conditions (Exhaustion with its level) and effects, AC now, spell slots left (casters) or Speed. */
function dnd5eStrip(): Strip {
  const five = sheet as ComputedRef<Dnd5eSheet>
  const all = computed(() => [
    ...five.value.conditions.map((c) => ({
      name: c === 'Exhaustion' ? `Exhaustion ${exhaustionOf(five.value)}` : c,
      tone: 'set',
    })),
    ...(five.value.effects ?? []).map((e) => ({ name: e.name, tone: 'status' })),
  ])
  return {
    dead: computed(() => dnd5eDead(five.value)),
    chips: computed(() => all.value.slice(0, 2)),
    more: computed(() => all.value.length - 2),
    armor: computed(() => ({ label: 'AC', value: acNow(five.value, draft.value.level).value })),
    tile: computed(() => {
      const slots = slotsLeft(five.value).reduce((n, x) => n + x, 0)
      if (five.value.castingStats) return { label: 'Slots', value: String(slots), mana: true }
      return { label: 'Speed', value: String(speedNow(five.value).value), mana: false }
    }),
  }
}

const { dead, chips, more, armor, tile } =
  draft.value.system === 'dnd5e' ? dnd5eStrip() : nimbleStrip()

const hpMax = computed(() => Math.max(1, sheet.value.hpMax))
const hpPct = computed(() => Math.min(100, Math.max(0, (sheet.value.hp / hpMax.value) * 100)))
const tempPct = computed(() =>
  Math.min(100 - hpPct.value, Math.max(0, ((sheet.value.tempHp ?? 0) / hpMax.value) * 100)),
)

const label = computed(
  () =>
    [
      draft.value.name,
      dead.value ? 'dead' : `${sheet.value.hp} of ${sheet.value.hpMax} HP`,
      sheet.value.tempHp ? `${sheet.value.tempHp} temp HP` : '',
      `${armor.value.label} ${armor.value.value}`,
      tile.value ? `${tile.value.label} ${tile.value.value}` : '',
      chips.value.map((c) => c.name).join(', '),
    ]
      .filter(Boolean)
      .join(', ') + '. Open the Hero tab',
)
</script>

<template>
  <button
    type="button"
    class="hs"
    data-track="Hero strip"
    :aria-label="label"
    @click="emit('go-hero')"
  >
    <UiAvatar
      class="hs__face"
      :name="draft.name"
      :src="portrait"
      :class-slug="sheet.classSlug || null"
      :dead="dead"
      :size="36"
    />
    <span class="hs__mid" aria-hidden="true">
      <span class="hs__row">
        <span class="hs__name"
          ><b>{{ draft.name }}</b
          ><template v-if="dead"> (dead)</template
          ><template v-else-if="sheet.class"> · {{ sheet.class }} {{ draft.level }}</template></span
        >
        <span class="hs__hp"
          ><b>{{ sheet.hp }}</b
          >/{{ sheet.hpMax }}<template v-if="sheet.tempHp"> +{{ sheet.tempHp }}</template></span
        >
      </span>
      <span class="hs__bar" :class="hpClass(sheet.hp, sheet.hpMax)">
        <i :style="{ width: `${hpPct}%` }" />
        <em v-if="tempPct" :style="{ left: `${hpPct}%`, width: `${tempPct}%` }" />
      </span>
      <span v-if="chips.length" class="hs__chips">
        <span
          v-for="c in chips"
          :key="c.name"
          class="hs__chip"
          :class="c.tone && `hs__chip--${c.tone}`"
          >{{ c.name }}</span
        >
        <span v-if="more > 0" class="hs__more">+{{ more }}</span>
      </span>
    </span>
    <span class="hs__stats" aria-hidden="true">
      <span class="hs__mini">
        <b>{{ armor.value }}</b>
        <span>{{ armor.label }}</span>
      </span>
      <span v-if="tile" class="hs__mini" :class="{ 'hs__mini--mana': tile.mana }">
        <b>{{ tile.value }}</b>
        <span>{{ tile.label }}</span>
      </span>
    </span>
  </button>
</template>

<style scoped lang="scss">
.hs {
  all: unset;
  box-sizing: border-box;
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 56px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--line);
  background: var(--inset);
  color: var(--page-text);
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
}

.hs__face {
  flex: none;
}

.hs__mid {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.hs__row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--page-muted);

  b {
    font-family: var(--font-heading);
    color: var(--page-text);
  }
}

.hs__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hs__hp {
  flex: none;
  font-variant-numeric: tabular-nums;
}

.hs__bar {
  position: relative;
  display: block;
  height: 8px;
  border-radius: 4px;
  background: var(--track);
  overflow: hidden;

  i,
  em {
    position: absolute;
    top: 0;
    bottom: 0;
  }

  i {
    left: 0;
    background: var(--hp-fill, var(--secondary));
  }

  // Temp HP: a striped stretch after the HP, in its own colour.
  em {
    background: repeating-linear-gradient(
      45deg,
      var(--temp-hp) 0 3px,
      color-mix(in srgb, var(--temp-hp) 60%, transparent) 3px 6px
    );
  }
}

.hs__chips {
  display: flex;
  gap: 4px;
  min-width: 0;
  overflow: hidden;
}

.hs__chip,
.hs__more {
  flex: none;
  font-size: 10px;
  line-height: 15px;
  padding: 0 6px;
  border-radius: 999px;
  border: 1px solid var(--line-strong);
  color: var(--page-soft);
  white-space: nowrap;
}

.hs__chip--set {
  border-color: var(--accent);
  background: var(--warn-bg);
  color: var(--warn-text);
}

.hs__chip--status {
  border-color: var(--secondary);
  background: color-mix(in srgb, var(--secondary) 16%, transparent);
  color: var(--page-text);
}

.hs__stats {
  flex: none;
  display: flex;
  gap: 6px;
}

.hs__mini {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 40px;
  max-width: 64px;
  padding: 3px 4px;
  box-sizing: border-box;
  border-radius: min(var(--radius-control), 10px);
  background: var(--panel-bg);
  border: 1px solid var(--line);

  b {
    font-family: var(--font-heading);
    font-size: 14px;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }

  span {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 9px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--page-muted);
  }
}

.hs__mini--mana b {
  color: color-mix(in srgb, var(--secondary) 70%, var(--page-text));
}
</style>
