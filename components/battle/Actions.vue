<script setup lang="ts">
// The battle board's action panel (centre column): every action of the player's hero as
// a tile, filtered to Ready now (the default), All or a category, with a search box.
// The tiles come from useBattleActions (Nimble) or useBattleDnd5eActions (5e) and the sections
// from sectionsFor, so Ready now, All and the sheet agree; clicking does what the sheet does
// and posts to party chat. A 5e hero also gets the sheet's Target row and the next attack's
// Advantage / Disadvantage above the tiles, a dice entry while a Manual dice roll waits, and
// "Heal yourself" after a healing spell.
import type { BattleTile } from '~/composables/useBattleActions'
import type { AnySheet } from '~/types/sheets'
import { readyNote, sectionsFor, type ActionFilter } from '~/utils/battleActions'

defineProps<{
  /**
   * Phone and tablet layouts: two tiles per row (three on a tablet 1024px or wider),
   * touch-sized filter chips that scroll sideways.
   */
  compact?: boolean
  /**
   * Phone frame: the panel takes its natural height (the phone's tab scrolls, not the list)
   * and the tiles open their details as a bottom sheet instead of a popover.
   */
  sheet?: boolean
}>()

const FILTER_KEY = 'lantern-battle-filter'
const FILTERS: ActionFilter[] = ['ready', 'all', 'attack', 'spell', 'react', 'ability']

const { canEdit, draft } = useSheet<AnySheet>()
// On touch (touch desktops too) the filter chips and search are touch-sized too.
const { touch } = useBoardLayout()
const announce = useAnnounce()

/** The hero's system, fixed for this panel's life (HeroScope remounts it for a new hero). */
const dnd5e = draft.value.system === 'dnd5e'

/** Nimble's tiles with the note under Ready now. */
function nimbleTiles() {
  const n = useBattleActions({ onResult: announce })
  return {
    ...n,
    note: computed(() =>
      readyNote(n.actions.value, {
        onTurn: n.onTurn.value,
        actionsLeft: n.actionsLeft.value,
        mana: n.mana.value,
      }),
    ),
  }
}

const five = dnd5e ? useBattleDnd5eActions({ onResult: announce }) : null
const source: {
  actions: ComputedRef<BattleTile[]>
  onTurn: ComputedRef<boolean>
  note: ComputedRef<string>
  lastResult: Ref<string>
  lastDetail: Ref<string>
} = five ?? nimbleTiles()
const { actions, onTurn, note, lastResult, lastDetail } = source

function savedFilter(): ActionFilter {
  try {
    const v = localStorage.getItem(FILTER_KEY)
    return FILTERS.find((f) => f === v) ?? 'ready'
  } catch {
    return 'ready'
  }
}

const filter = ref<ActionFilter>(savedFilter())
watch(filter, (f) => {
  try {
    localStorage.setItem(FILTER_KEY, f)
  } catch {
    // Storage blocked: the filter just isn't remembered.
  }
})
const query = ref('')

/** The tile whose details are open (touch); it stays in Ready now while they are. */
const openKey = ref<string | null>(null)
function onDetails(key: string, open: boolean) {
  if (open) openKey.value = key
  else if (openKey.value === key) openKey.value = null
}
const sections = computed(() =>
  sectionsFor(actions.value, filter.value, query.value, onTurn.value, openKey.value),
)
const readyCount = computed(() =>
  sectionsFor(actions.value, 'ready', query.value, onTurn.value).reduce(
    (n, s) => n + s.actions.length,
    0,
  ),
)
const byKey = computed(() => new Map(actions.value.map((a) => [a.key, a])))
const empty = computed(() =>
  query.value.trim()
    ? 'No action matches that search.'
    : filter.value === 'ready'
      ? 'Nothing you can use right now.'
      : 'No actions here.',
)
</script>

<template>
  <section
    class="panel actions"
    :class="{
      'actions--compact': compact,
      'actions--sheet': sheet,
      'actions--touch': touch,
    }"
    aria-labelledby="battle-actions-h"
  >
    <h2 id="battle-actions-h" class="sr-only">Actions</h2>
    <details v-if="five" class="actions__target">
      <summary>Target &amp; odds</summary>
      <Dnd5eTargetAc />
      <SheetSituation
        chips-label="Next attack"
        :chips="five.chips.value"
        :steppers="[]"
        @toggle="five.toggleMode"
      />
    </details>
    <BattleActionFilters v-model:filter="filter" v-model:query="query" :ready-count="readyCount" />
    <p v-if="filter === 'ready'" class="actions__note">{{ note }}</p>
    <div class="actions__list">
      <section v-for="s in sections" :key="s.id" class="actions__group">
        <h3 class="actions__title">{{ s.title }}</h3>
        <div class="actions__tiles">
          <template v-for="t in s.actions" :key="t.key">
            <BattleActionTile
              v-if="byKey.get(t.key)"
              :action="byKey.get(t.key)!"
              :show-reason="filter !== 'ready'"
              :readonly="!canEdit"
              :sheet="sheet"
              @details="(open: boolean) => onDetails(t.key, open)"
            />
          </template>
        </div>
      </section>
      <p v-if="!sections.length" class="actions__empty">{{ empty }}</p>
    </div>
    <NimbleDiceEntry
      v-if="five?.prompt.value"
      :label="five.prompt.value"
      action="Roll"
      :disabled="!canEdit"
      @submit="five.submitDice"
    />
    <button
      v-if="five && five.healed.value > 0"
      type="button"
      class="btn btn--ghost btn--sm actions__heal"
      :disabled="!canEdit"
      @click="five.healSelf"
    >
      Heal yourself {{ five.healed.value }}
    </button>
    <!-- The phone shows it in its own result bar under the tab. -->
    <p v-if="lastResult && !sheet" class="actions__result" role="status">
      <span class="actions__last" :title="lastDetail || undefined">{{ lastResult }}</span>
      <span class="actions__posted">Posted to party chat</span>
    </p>
  </section>
</template>

<style scoped lang="scss">
.actions {
  flex: 1 1 0;
  min-height: 240px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
}

.actions__target {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 13px;

  > summary {
    cursor: pointer;
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--page-muted);
  }

  &[open] > summary {
    margin-bottom: 4px;
  }
}

.actions__heal {
  align-self: flex-start;
}

.actions__note {
  margin: 0;
  font-size: 12px;
  color: var(--page-muted);
}

.actions__list {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-right: 2px;
  scrollbar-width: thin;
  scrollbar-color: var(--line-strong) transparent;
}

.actions__title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 6px;
  font-family: var(--font-body, inherit);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--page-muted);

  &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--line);
  }
}

.actions__tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 6px;
}

.actions__empty {
  margin: 0;
  font-size: 13px;
  color: var(--page-muted);
}

.actions__result {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
  margin: 0;
  padding: 8px 12px;
  border-radius: min(var(--radius-control), 8px);
  background: var(--ok-bg);
  color: var(--ok-text);
  font-size: 12px;
}

.actions__last {
  min-width: 0;
  font-weight: 600;
}

.actions__posted {
  margin-left: auto;
  font-size: 11px;
  opacity: 0.85;
}

// --- Compact (phone, tablet) -------------------------------------------------------------
.actions--compact {
  padding: 12px;

  .actions__tiles {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

// A tablet 1024px or wider (landscape) has room for three per row.
@media (min-width: 1024px) {
  .actions--compact:not(.actions--sheet) .actions__tiles {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

// One row of chips that scrolls sideways, the search after them; both touch-sized.
// The search is 16px so phones don't zoom in when it takes focus.
.actions--compact,
.actions--touch {
  // Tiles are 44px touch targets, 8px apart.
  .actions__tiles {
    gap: 8px;
  }

  :deep(.act__btn) {
    min-height: 44px;
  }

  :deep(.filters__chip) {
    min-height: 44px;
    padding: 0 14px;
    font-size: 13px;
  }

  :deep(.filters__search) {
    min-height: 44px;
    flex-basis: 96px;
    font-size: 16px;

    &:focus,
    &:not(:placeholder-shown) {
      flex-basis: 150px;
    }
  }
}

// --- Sheet (phone) ---------------------------------------------------------------------
// The phone's tab scrolls, so the panel takes its natural height.
.actions--sheet {
  flex: none;
  min-height: 0;

  .actions__list {
    flex: none;
    overflow: visible;
    padding-right: 0;
  }
}
</style>
