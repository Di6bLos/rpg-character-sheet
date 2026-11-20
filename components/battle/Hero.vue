<script setup lang="ts">
// The player's hero on the battle board (left column), top to bottom: who they are,
// HP and Wounds, Armor / Speed / Init / Hit dice, mana or the class resource,
// conditions, summons, stats with save marks, and rests. Runs inside HeroScope's
// sheet editor and uses the sheet's own rules (composables and utils); read-only
// when the player can't edit.
import type { NimbleSheet, NimbleStat } from '~/types/sheets'
import { sign } from '~/utils/dice'
import { sheetResource } from '~/utils/nimbleBuild'
import { encounterMana, isDead, isHollowOne } from '~/utils/nimblePlay'

const { draft, canEdit, portrait } = useSheet<NimbleSheet>()
// Statuses other heroes give this one (Helped) and HP changes from the GM; the
// quick-action panel does this below 1200px.
useHeroEffects()
useHeroHpChanges()
const sheet = computed(() => draft.value.sheet)
const { diceLeft, speed } = useNimbleVitals()

const dead = computed(() => isDead(sheet.value))
const identity = computed(() =>
  [
    [sheet.value.lineage, sheet.value.class].filter(Boolean).join(' '),
    sheet.value.subclass,
    `Lvl ${draft.value.level}`,
  ]
    .filter(Boolean)
    .join(' · '),
)

const tiles = computed(() => [
  { label: 'Armor', value: String(sheet.value.ac), title: 'Defend reduces a hit by your Armor' },
  {
    label: 'Speed',
    value: String(speed.value.value),
    title: speed.value.note || 'Spaces per move',
    changed: speed.value.changed,
  },
  { label: 'Init', value: sign(sheet.value.initMod), title: 'Added to your Initiative roll' },
  {
    label: 'Hit dice',
    value: `${diceLeft.value}/${sheet.value.hitDice}`,
    title: `d${sheet.value.hitDie} each; they come back on a Safe Rest`,
  },
])

// --- Mana or the class resource ---------------------------------------------------
const hasMana = computed(() => sheet.value.mana.max > 0 || encounterMana(sheet.value) > 0)

function setMana(value: number) {
  if (!canEdit.value) return
  const m = sheet.value.mana
  m.current = Math.max(0, Math.min(m.max, value))
}

const resource = computed(() => {
  const r = sheetResource(sheet.value, draft.value.level)
  return !r || r.kind === 'info' || (r.kind === 'uses' && isHollowOne(sheet.value)) ? null : r
})
const resourceValue = computed(() => {
  const r = resource.value
  const res = sheet.value.resource
  if (!r) return ''
  const total = res.rolls.reduce((a, b) => a + b, 0)
  if (r.kind === 'uses') return `${r.max - res.count} / ${r.max} left`
  if (r.kind === 'judgment') return res.rolls.length ? `+${total} held` : 'None held'
  if (r.kind === 'crit') return res.count ? 'Used this turn' : 'Ready'
  if (r.kind === 'rage') return res.active ? `Raging · +${total}` : 'Not raging'
  return r.max ? `${res.count} / ${r.max}` : String(res.count)
})

// --- Stats --------------------------------------------------------------------------
const STATS: NimbleStat[] = ['STR', 'DEX', 'INT', 'WIL']
const stats = computed(() =>
  STATS.map((k) => {
    const mode = sheet.value.saveAdv === k ? 'adv' : sheet.value.saveDis === k ? 'dis' : ''
    return {
      k,
      v: sign(sheet.value.stats[k]),
      mode,
      label: mode === 'adv' ? `${k} ▲` : mode === 'dis' ? `${k} ▼` : k,
      title:
        mode === 'adv'
          ? `${k} saves with advantage`
          : mode === 'dis'
            ? `${k} saves with disadvantage`
            : `${k} saves`,
    }
  }),
)
</script>

<template>
  <section class="panel hero" aria-label="Your hero">
    <header class="hero__id">
      <UiAvatar
        :name="draft.name"
        :src="portrait"
        :class-slug="sheet.classSlug || null"
        :dead="dead"
        :size="44"
      />
      <div class="hero__who">
        <h2 class="hero__name">
          {{ draft.name }}<span v-if="dead" class="hero__dead"> (dead)</span>
        </h2>
        <div class="hero__sub">{{ identity }}</div>
      </div>
    </header>

    <BattleHeroHp />

    <div class="hero__tiles">
      <div v-for="t in tiles" :key="t.label" class="hero__tile" :title="t.title">
        <b :class="{ 'is-changed': t.changed }">{{ t.value }}</b>
        <span>{{ t.label }}</span>
      </div>
    </div>

    <div v-if="hasMana" class="hero__mana">
      <BoardManaGauge class="hero__gauge" :mana="sheet.mana" :name="draft.name" />
      <button
        type="button"
        class="step hero__mini"
        aria-label="Spend 1 mana"
        :disabled="!canEdit || sheet.mana.current <= 0"
        @click="setMana(sheet.mana.current - 1)"
      >
        −
      </button>
      <button
        type="button"
        class="step hero__mini"
        aria-label="Regain 1 mana"
        :disabled="!canEdit || sheet.mana.current >= sheet.mana.max"
        @click="setMana(sheet.mana.current + 1)"
      >
        +
      </button>
    </div>
    <div v-if="resource" class="hero__res">
      <span class="title-help">
        <span class="sect">{{ resource.name }}</span>
        <UiHelp v-if="resource.desc" :label="`About ${resource.name}`" :text="resource.desc" />
      </span>
      <b>{{ resourceValue }}</b>
    </div>

    <BattleHeroConditions />
    <BattleHeroSummons />

    <div class="hero__block">
      <span class="sect">Stats &amp; saves</span>
      <div class="hero__stats">
        <div
          v-for="s in stats"
          :key="s.k"
          class="hero__stat"
          :class="s.mode && `hero__stat--${s.mode}`"
          :title="s.title"
        >
          <b>{{ s.v }}</b>
          <span>{{ s.label }}</span>
        </div>
      </div>
    </div>

    <BattleHeroRest />
  </section>
</template>

<style scoped lang="scss">
.hero {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 12px 14px;
}

.hero__id {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.hero__who {
  min-width: 0;
}

.hero.panel .hero__name {
  margin: 0;
  font-family: var(--font-heading);
  font-size: 17px;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.hero__dead {
  font-size: 13px;
  color: var(--page-muted);
}

.hero__sub {
  font-size: 12px;
  color: var(--page-muted);
}

.hero__tiles {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.hero__tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 4px;
  border-radius: min(var(--radius-control), 8px);
  background: var(--inset);
  border: 1px solid var(--line);

  b {
    font-family: var(--font-heading);
    font-size: 16px;
    font-variant-numeric: tabular-nums;
  }

  span {
    font-size: 9.5px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--page-muted);
  }
}

.is-changed {
  // Mixed with the text colour so it stays readable on the Cursed parchment panel.
  color: color-mix(in srgb, var(--warn-text) 55%, var(--page-text));
}

.hero__mana {
  display: flex;
  align-items: center;
  gap: 4px;
}

.hero__gauge {
  flex: 1 1 auto;
  min-width: 0;

  :deep(.mana__bar) {
    max-width: none;
  }
}

.hero__mini {
  width: 24px;
  height: 24px;
  font-size: 14px;
}

.hero__res {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
}

.hero__block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.hero__stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 4px;
}

.hero__stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 4px 0;
  border-radius: min(var(--radius-control), 6px);
  background: var(--inset);
  font-size: 11px;
  color: var(--page-soft);

  b {
    font-size: 13px;
    color: var(--page-text);
  }

  &--adv span {
    color: color-mix(in srgb, var(--secondary) 70%, var(--page-text));
    font-weight: 700;
  }

  &--dis span {
    color: color-mix(in srgb, var(--danger) 65%, var(--page-text));
    font-weight: 700;
  }
}

// Section labels, shared with the Hero* parts.
.hero :deep(.sect) {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--page-muted);
}
</style>
