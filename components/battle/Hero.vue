<script setup lang="ts">
// The player's hero on the battle board (left column), top to bottom: who they are,
// HP and Wounds, Armor / Speed / Init / Hit dice, mana or the class resource,
// conditions, summons, stats with save marks, and rests. Runs inside HeroScope's
// sheet editor and uses the sheet's own rules (composables and utils); read-only
// when the player can't edit. On touch every one-tap control here and in its parts is a
// 44px target with 8px between neighbours (the phone's Hero tab, tablets). Compact
// (phone): an Actions row with "+1 extra action", which the phone's one-row turn bar
// has no room for.
import type { NimbleSheet, NimbleStat } from '~/types/sheets'
import { sign } from '~/utils/dice'
import { isDead } from '~/utils/nimblePlay'

defineProps<{ compact?: boolean }>()

const { draft, canEdit, portrait } = useSheet<NimbleSheet>()
const { touch } = useBoardLayout()
// Statuses other heroes give and the GM's changes are applied by HeroEditor (HeroLive).
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
const { hasMana, resource, resourceValue } = useNimbleResource()

function setMana(value: number) {
  if (!canEdit.value) return
  const m = sheet.value.mana
  m.current = Math.max(0, Math.min(m.max, value))
}

// --- Actions (compact): the turn bar's +1, from the same turn steps ------------------
const { left, perTurn, extraAction } = useTurnSteps({ onResult: useAnnounce() })
const actionsText = computed(() =>
  left.value > perTurn.value
    ? `${left.value} left (${left.value - perTurn.value} extra)`
    : `${left.value} of ${perTurn.value} left`,
)

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
  <section class="panel hero" :class="{ 'hero--touch': touch }" aria-label="Your hero">
    <header class="hero__id">
      <UiAvatar
        :name="draft.name"
        :src="portrait"
        :class-slug="sheet.classSlug || null"
        :dead="dead"
        :size="38"
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

    <div v-if="compact" class="hero__acts">
      <span class="sect">Actions</span>
      <span class="hero__acts-left" role="status">{{ actionsText }}</span>
      <button
        type="button"
        class="btn btn--ghost btn--sm hero__extra"
        title="An ally or ability gave you an extra action (Stim Pack, Chorus of Champions…); it lasts until your turn ends."
        :disabled="!canEdit"
        @click="extraAction"
      >
        +1 extra action
      </button>
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
  gap: 7px;
  padding: 10px 14px;
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
  padding: 2px 4px;
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
  // The readable accent (the ink variant inside a panel), pulled toward the text colour
  // so it stays at AA on inset and tinted tiles too.
  color: color-mix(in srgb, var(--accent-text) 60%, var(--page-text));
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

  // Fading the whole button lost the glyph on Cursed parchment; mute the glyph instead.
  &:disabled {
    opacity: 1;
    color: var(--page-muted);
  }
}

.hero__res {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
}

.hero__acts {
  display: flex;
  align-items: center;
  gap: 8px;
}

.hero__acts-left {
  flex: 1 1 auto;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.hero__extra {
  min-height: 44px;
  padding: 0 14px;
}

.hero__block {
  display: flex;
  flex-direction: column;
  gap: 4px;
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
  padding: 2px 0;
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
    color: color-mix(in srgb, var(--danger) 35%, var(--page-text));
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

// --- Touch ------------------------------------------------------------------------------
// 44px targets, 8px apart. The parts (HeroHp, HeroConditions, HeroRest) are styled from
// here so the desktop column keeps its compact sizes. The amount field is 16px so phones
// don't zoom in when it takes focus.
.hero--touch {
  gap: 10px;
  padding: 12px 14px;

  .hero__mana {
    gap: 8px;
  }

  .hero__mini,
  :deep(.hp__mini),
  :deep(.hp__ctl .step) {
    width: 44px;
    height: 44px;
    font-size: 18px;
  }

  :deep(.hp__ctl),
  :deep(.hp__tempctl),
  :deep(.cond__chips),
  :deep(.rest__btns) {
    gap: 8px;
  }

  // The 16px value would clip the placeholder in a narrow column (240px, its minimum).
  :deep(.hp__amt) {
    min-height: 44px;
    padding-inline: 4px;
    font-size: 16px;

    &::placeholder {
      font-size: 13px;
    }
  }

  :deep(.hp__crit),
  :deep(.hp__notice .btn),
  :deep(.cond__add),
  :deep(.cond__chip),
  :deep(.rest__btns .btn) {
    min-height: 44px;
  }

  :deep(.cond__add) {
    padding: 0 14px;
  }

  :deep(.cond__chip) {
    padding: 0 14px;
    font-size: 13px;
  }

  // Wounds: each button is an upright 44px square to tap, 8px apart; the 20px diamond is
  // drawn inside it (::before), so the target stays square while the mark stays small.
  :deep(.hp__wounds) {
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
  }

  :deep(.wound) {
    position: relative;
    width: 44px;
    height: 44px;
    margin: 0;
    transform: none;
    border: 0;
    border-radius: 0;
    background: transparent;

    &::before {
      content: '';
      position: absolute;
      inset: 12px;
      transform: rotate(45deg);
      border: 1px solid var(--line-strong);
      border-radius: 2px;
    }

    &[aria-pressed='true'] {
      background: transparent;

      &::before {
        background: var(--danger);
        border-color: var(--danger);
      }
    }

    &:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: -4px;
    }
  }
}
</style>
