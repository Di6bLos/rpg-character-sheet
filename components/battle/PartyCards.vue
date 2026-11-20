<script setup lang="ts">
// The battle board's party: one compact card per hero (the other heroes for a player,
// all of them for the GM) with portrait, name, Acting tag, class and level, one status
// line, the HP bar and Armor. The GM's cards add action pips and mana. A card opens
// the hero's stats modal.
import type { RosterEntry } from '~/types'
import { plural } from '~/utils/format'
import { turnActionsFor } from '~/utils/nimblePlay'

const props = defineProps<{
  roster: RosterEntry[]
  gm: boolean
  /** The hero whose turn it is (a character id), for the Acting tag. */
  actingCharacterId?: string | null
}>()
const emit = defineEmits<{ open: [characterId: string] }>()

const auth = useAuthStore()
const right = useBattleRight()
const listId = useId()

const heroes = computed(() =>
  props.roster.filter(
    (r): r is RosterEntry & { character_id: string } =>
      !!r.character_id && (props.gm || r.user_id !== auth.userId),
  ),
)

function isDead(r: RosterEntry) {
  const s = r.summary
  return !!s && (s.woundsMax ?? 0) > 0 && (s.wounds ?? 0) >= (s.woundsMax ?? 0)
}

/** One line: dead or dying first, then summons, Wounds, or the first condition. */
function status(r: RosterEntry): string {
  const s = r.summary
  if (!s) return ''
  if (isDead(r)) return 'Dead'
  if (s.dying) return 'Dying'
  const summons = (s.summons ?? []).filter((m) => !m.hpMax || m.hp > 0).length
  if (summons) return plural(summons, 'summon')
  if (s.wounds) return `Wounds ${s.wounds}`
  return s.conditions?.[0] ?? ''
}

function sub(r: RosterEntry): string {
  const s = r.summary
  const who = [s?.class, r.character_level].filter((x) => x !== undefined && x !== null && x !== '')
  return [who.join(' '), status(r)].filter(Boolean).join(' · ')
}

function hpFill(r: RosterEntry): number {
  const s = r.summary
  if (!s?.hpMax) return 0
  return Math.min(1, Math.max(0, (s.hp ?? 0) / s.hpMax))
}

function hpText(r: RosterEntry): string {
  const s = r.summary
  if (!s || s.hp === undefined) return '—'
  return `${s.hp}/${s.hpMax ?? s.hp}`
}

function pips(r: RosterEntry): { total: number; used: number } | null {
  const s = r.summary
  if (!props.gm || !s) return null
  const max = turnActionsFor(s.abilityNames ?? [], !!s.dying)
  const spent = s.actionsSpent ?? 0
  return { total: Math.max(max, max - spent), used: Math.min(Math.max(0, spent), max) }
}

function mana(r: RosterEntry): string {
  const m = r.summary?.mana
  return props.gm && m && m.max > 0 ? `mana ${m.current}/${m.max}` : ''
}

/** The card's accessible name: everything it shows, since aria-label replaces its content. */
function label(r: RosterEntry): string {
  const name = r.character_name ?? r.display_name
  const acting = r.character_id === props.actingCharacterId ? 'acting' : ''
  const tempHp = r.summary?.tempHp
  const guard = tempHp ? `${tempHp} temp HP` : `Armor ${r.summary?.ac ?? 'unknown'}`
  const p = pips(r)
  const actions = p ? `${p.total - p.used} of ${p.total} actions left` : ''
  const hp = r.summary?.hp === undefined ? 'HP unknown' : `${hpText(r)} HP`
  const parts = [name, acting, sub(r), hp, guard, mana(r), actions]
  return `${parts.filter(Boolean).join(', ')}. Open stats`
}
</script>

<template>
  <section
    class="panel party-cards"
    :class="{
      'party-cards--empty': !heroes.length,
      'party-cards--folded': !right.state.value.party,
    }"
    aria-labelledby="party-h"
  >
    <header class="party__head">
      <h2 id="party-h">Party</h2>
      <!-- No one to show: the card is one line, so Chat below gets the room. -->
      <p v-if="!heroes.length" class="party__empty">
        {{ gm ? 'No heroes seated yet.' : 'No other heroes at this table yet.' }}
      </p>
      <span v-else class="party__count">{{
        `${heroes.length} ${heroes.length === 1 ? 'hero' : 'heroes'}`
      }}</span>
      <span class="party__tools">
        <BattlePanelToggle
          v-if="heroes.length"
          :dir="right.state.value.party ? 'up' : 'down'"
          :label="right.state.value.party ? 'Hide the party' : 'Show the party'"
          :aria-expanded="right.state.value.party"
          :aria-controls="listId"
          @click="right.toggleParty()"
        />
        <BattlePanelToggle
          id="battle-right-collapse"
          dir="right"
          label="Collapse party and chat"
          aria-expanded="true"
          @click="right.toggleColumn()"
        />
      </span>
    </header>
    <ul v-if="heroes.length" v-show="right.state.value.party" :id="listId" class="party__list">
      <li v-for="r in heroes" :key="r.character_id">
        <button
          type="button"
          class="pc"
          :class="{ 'is-acting': r.character_id === actingCharacterId, 'is-dead': isDead(r) }"
          :aria-label="label(r)"
          @click="emit('open', r.character_id)"
        >
          <UiAvatar
            :name="r.character_name ?? r.display_name"
            :portrait-path="r.summary?.portraitOverride || r.portrait_path"
            :class-slug="r.summary?.classSlug ?? null"
            :dead="isDead(r)"
            :faded="(r.summary?.hp ?? 1) <= 0"
            :size="34"
          />
          <span class="pc__main">
            <span class="pc__name">
              <span class="pc__label">{{ r.character_name ?? r.display_name }}</span>
              <span v-if="r.character_id === actingCharacterId" class="pc__tag">Acting</span>
            </span>
            <span class="pc__sub">
              <span class="pc__text">{{ sub(r) }}</span>
              <span v-if="mana(r)" class="pc__text">· {{ mana(r) }}</span>
              <span v-if="pips(r)" class="pc__pips" aria-hidden="true">
                <i
                  v-for="n in pips(r)?.total ?? 0"
                  :key="n"
                  :class="{ 'is-used': n <= (pips(r)?.used ?? 0) }"
                />
              </span>
            </span>
            <span class="pc__bar" aria-hidden="true">
              <span
                :class="{ 'is-low': hpFill(r) <= 0.5 }"
                :style="{ width: `${hpFill(r) * 100}%` }"
              />
            </span>
          </span>
          <span class="pc__right">
            <b>{{ hpText(r) }}</b>
            <span v-if="r.summary?.tempHp">+{{ r.summary.tempHp }} temp</span>
            <span v-else>Armor {{ r.summary?.ac ?? '—' }}</span>
          </span>
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped lang="scss">
// Not `.party`: PartyView's scoped `.party` (the narrow layout) would also style this root.
.party-cards {
  // Half the column, Chat the other half (both 50% with border-box, so the
  // padding counts inside); more heroes scroll inside.
  flex: 1 1 50%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 14px;
  min-height: 0;

  // No other heroes, or folded: one line, and Chat takes the rest.
  &--empty,
  &--folded {
    flex: none;
    padding-block: 8px;
  }
}

.party__head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;

  h2 {
    flex: none;
    margin: 0;
    font-family: var(--font-heading);
    font-size: 16px;
  }
}

.party__tools {
  flex: none;
  display: inline-flex;
  gap: 4px;
}

// The count (or the empty note) and the buttons sit at the right.
.party__count,
.party__empty {
  margin-left: auto;
}

.party__count,
.party__empty {
  font-size: 12px;
  color: var(--page-muted);
}

.party__empty {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.party__list {
  list-style: none;
  margin: 0;
  padding: 2px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
  min-height: 0;
  scrollbar-width: thin;
  scrollbar-color: var(--line-strong) transparent;
}

.pc {
  all: unset;
  box-sizing: border-box;
  width: 100%;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding: 5px 8px;
  border-radius: var(--radius-control);
  background: var(--inset);
  border: 1px solid var(--line);
  color: var(--page-text);
  cursor: pointer;

  &:hover {
    border-color: var(--line-strong);
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  &.is-acting {
    border-color: var(--accent);
  }

  &.is-dead {
    opacity: 0.7;
  }
}

.pc__main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.pc__name {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 13px;
  line-height: 18px;
  font-weight: 600;
}

.pc__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pc__tag {
  flex: none;
  font-size: 9px;
  line-height: 14px;
  padding: 0 5px;
  border-radius: 4px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  background: var(--accent);
  color: var(--on-accent);
}

.pc__sub {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  font-size: 11px;
  color: var(--page-muted);
  white-space: nowrap;
}

.pc__text {
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.pc__pips {
  display: inline-flex;
  gap: 3px;
  flex: none;
  margin-left: 2px;

  i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent);

    &.is-used {
      background: transparent;
      box-shadow: inset 0 0 0 1px var(--page-muted);
    }
  }
}

.pc__bar {
  display: block;
  height: 5px;
  margin-top: 2px;
  border-radius: 3px;
  background: var(--track);
  overflow: hidden;

  span {
    display: block;
    height: 100%;
    background: var(--secondary);

    &.is-low {
      background: var(--danger);
    }
  }
}

.pc__right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  font-size: 11px;
  color: var(--page-muted);
  white-space: nowrap;

  b {
    font-size: 12px;
    color: var(--page-text);
    font-variant-numeric: tabular-nums;
  }
}
</style>
