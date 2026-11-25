<script setup lang="ts">
// The battle board's party: one compact card per hero (the other heroes for a player,
// all of them for the GM) with portrait, name, Acting tag, class and level, one status
// line, the HP bar and Armor. The GM's cards add action pips and mana (PF2e: hero and
// focus points, `gmPoints`). A card opens
// the hero's stats modal. Compact (phone): full-width touch-sized cards in the tab's
// own scroll, free of the right column's Party / Chat split. Off Nimble
// (`useBattleFeatures`) the GM's cards have no pips or mana; a hero at 0 HP gets a
// DownStatus row ("Down · 1 saved · 2 failed" for 5e, "Down · Dying 2" for PF2e),
// concentration is a chip, and the GM's cards show Passive Perception.
import type { RosterEntry } from '~/types'
import { heroArmor } from '~/utils/nimbleConditions'
import { plural } from '~/utils/format'
import { heroTurnActions } from '~/utils/nimblePlay'
import { dyingLine, heroDown } from '~/utils/roster'
import { pf2ePointsLine } from '~/utils/heroCardStats'

const props = defineProps<{
  roster: RosterEntry[]
  gm: boolean
  /** The hero whose turn it is (a character id), for the Acting tag. */
  actingCharacterId?: string | null
  compact?: boolean
}>()
const emit = defineEmits<{ open: [characterId: string] }>()

const auth = useAuthStore()
const right = useBattleRight()
const features = useBattleFeatures()

const heroes = computed(() =>
  props.roster.filter(
    (r): r is RosterEntry & { character_id: string } =>
      !!r.character_id && (props.gm || r.user_id !== auth.userId),
  ),
)

/** In the right column with heroes to list (the Party / Chat handle shows then). */
const toggles = computed(() => !props.compact && heroes.value.length > 0)
const partyClosed = computed(() => right.state.value.split <= 0)

function isDead(r: RosterEntry) {
  const s = r.summary
  return !!s && (s.woundsMax ?? 0) > 0 && (s.wounds ?? 0) >= (s.woundsMax ?? 0)
}

/** One line: dead, dying or down first, then summons or Wounds. Conditions get their own row. */
function status(r: RosterEntry): string {
  const s = r.summary
  if (!s) return ''
  if (isDead(r)) return 'Dead'
  // 5e and PF2e: down at 0 HP, on the DownStatus row of its own.
  if (basicDown(r)) return ''
  if (s.dying) return 'Dying'
  const summons = (s.summons ?? []).filter((m) => !m.hpMax || m.hp > 0).length
  if (summons) return plural(summons, 'summon')
  return s.wounds ? `Wounds ${s.wounds}` : ''
}

/** A 5e / PF2e hero at 0 HP. */
function basicDown(r: RosterEntry): boolean {
  return !features.value.nimbleHero && heroDown(r.summary?.hp, r.summary?.hpMax)
}

/** A downed 5e / PF2e hero, for the card's accessible name: "Down, Death saves 1 success, …". */
function downLabel(r: RosterEntry): string {
  if (!basicDown(r)) return ''
  return ['Down', dyingLine(r.summary, true)].filter(Boolean).join(', ')
}

function conditions(r: RosterEntry): string[] {
  const list = r.summary?.conditions ?? []
  const conc = r.summary?.concentration
  return !features.value.nimbleHero && conc ? [...list, `Concentrating · ${conc}`] : list
}

function sub(r: RosterEntry): string {
  const s = r.summary
  const who = [s?.class, r.character_level].filter((x) => x !== undefined && x !== null && x !== '')
  return [who.join(' '), status(r)].filter(Boolean).join(' · ')
}

/** The GM's 5e / PF2e cards: Passive Perception under the armor. */
function passive(r: RosterEntry): number | null {
  const p = r.summary?.passivePerception
  return props.gm && !features.value.nimbleHero && typeof p === 'number' ? p : null
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
  if (!props.gm || !s || !features.value.pips) return null
  const max = heroTurnActions(s.abilityNames ?? [], !!s.dying, s.conditions)
  const spent = s.actionsSpent ?? 0
  return { total: Math.max(max, max - spent), used: Math.min(Math.max(0, spent), max) }
}

/** The GM's resource line: Nimble mana, PF2e hero and focus points. */
function mana(r: RosterEntry): string {
  if (!props.gm) return ''
  if (features.value.gmPoints) return pf2ePointsLine(r.summary)
  const m = r.summary?.mana
  return features.value.nimbleHero && m && m.max > 0 ? `mana ${m.current}/${m.max}` : ''
}

/** The card's accessible name: everything it shows, since aria-label replaces its content. */
function armorOf(r: RosterEntry) {
  return heroArmor(r.summary?.ac, r.summary?.conditions, r.character_level)
}

function label(r: RosterEntry): string {
  const name = r.character_name ?? r.display_name
  const acting = r.character_id === props.actingCharacterId ? 'acting' : ''
  const tempHp = r.summary?.tempHp
  const guard = tempHp ? `${tempHp} temp HP` : `Armor ${armorOf(r) ?? 'unknown'}`
  const p = pips(r)
  const actions = p ? `${p.total - p.used} of ${p.total} actions left` : ''
  const hp = r.summary?.hp === undefined ? 'HP unknown' : `${hpText(r)} HP`
  const conds = conditions(r).join(', ')
  const pp = passive(r)
  const passiveText = pp === null ? '' : `Passive Perception ${pp}`
  const parts = [name, acting, sub(r), downLabel(r), hp, guard, passiveText, mana(r)]
  parts.push(actions, conds)
  return `${parts.filter(Boolean).join(', ')}. Open stats`
}
</script>

<template>
  <section
    class="panel party-cards"
    :class="
      compact
        ? { 'party-cards--compact': true, 'party-cards--empty': !heroes.length }
        : {
            'party-cards--empty': !heroes.length,
            'party-cards--folded': right.partyClosed.value,
            'party-cards--fill': right.chatClosed.value,
          }
    "
    :style="compact ? undefined : { '--party-split': right.state.value.split }"
    aria-labelledby="party-h"
  >
    <!-- In the right column, a click on the header opens the Party fully or closes it. -->
    <header
      class="party__head"
      :class="{ 'party__head--toggle': toggles }"
      @click="toggles && right.toggle('party')"
    >
      <h2 id="party-h">
        <button
          v-if="toggles"
          type="button"
          class="party__toggle"
          :aria-label="partyClosed ? 'Party: open' : 'Party: close'"
          :title="partyClosed ? 'Open the party' : 'Close the party'"
        >
          Party
        </button>
        <template v-else>Party</template>
      </h2>
      <!-- No one to show: the card is one line, so Chat below gets the room. -->
      <p v-if="!heroes.length" class="party__empty">
        {{ gm ? 'No heroes seated yet.' : 'No other heroes at this table yet.' }}
      </p>
      <span v-else class="party__count">{{
        `${heroes.length} ${heroes.length === 1 ? 'hero' : 'heroes'}`
      }}</span>
    </header>
    <!-- Closed (dragged to the top): just the header line. -->
    <ul v-if="heroes.length" v-show="compact || !right.partyClosed.value" class="party__list">
      <li v-for="r in heroes" :key="r.character_id">
        <button
          type="button"
          class="pc"
          data-track="Open hero card"
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
            :size="compact ? 42 : 34"
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
            <BattleDownStatus v-if="basicDown(r)" class="pc__down" :summary="r.summary" />
            <span class="pc__bar" aria-hidden="true">
              <span
                :class="{ 'is-low': hpFill(r) <= 0.5 }"
                :style="{ width: `${hpFill(r) * 100}%` }"
              />
            </span>
            <span v-if="conditions(r).length" class="pc__conds" aria-hidden="true">
              <span v-for="cond in conditions(r)" :key="cond" class="pc__cond">{{ cond }}</span>
            </span>
          </span>
          <span class="pc__right">
            <b>{{ hpText(r) }}</b>
            <span v-if="r.summary?.tempHp">+{{ r.summary.tempHp }} temp</span>
            <span v-else>Armor {{ armorOf(r) ?? '—' }}</span>
            <span v-if="passive(r) !== null">Passive {{ passive(r) }}</span>
          </span>
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped lang="scss">
.party-cards {
  // Its dragged share of the column (half by default; RightSplit moves it), and
  // Chat takes the rest; more heroes scroll inside. The 14px is the gap between them.
  flex: 0 1 calc((100% - 14px) * var(--party-split, 0.5));
  box-sizing: border-box;

  // Chat folded: the Party takes the column.
  &--fill {
    flex: 1 1 0;
  }
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 14px;
  min-height: 0;

  // No other heroes, or closed: one line, and Chat takes the rest.
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

  &--toggle {
    cursor: pointer;

    h2 {
      transition: color 0.15s;
    }

    &:hover h2 {
      color: var(--accent);
    }
  }
}

.party__toggle {
  all: unset;
  cursor: pointer;
  border-radius: 4px;

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
}

// The count (or the empty note) sits at the right.
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

.pc__down {
  margin-block: 1px;
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

.pc__conds {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  margin-top: 3px;
}

.pc__cond {
  font-size: 10px;
  line-height: 14px;
  padding: 0 5px;
  border-radius: 7px;
  background: var(--panel-bg);
  border: 1px solid var(--line);
  color: var(--page-soft);
  white-space: nowrap;
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

// --- Compact (phone) -------------------------------------------------------------------
// Natural height in the tab's scroll; bigger cards for a thumb.
.party-cards--compact {
  flex: none;
  gap: 8px;
  padding: 12px;

  .party__list {
    overflow: visible;
    gap: 8px;
  }

  .pc {
    grid-template-columns: 42px minmax(0, 1fr) auto;
    gap: 10px;
    min-height: 60px;
    padding: 8px 12px;
  }

  .pc__name {
    font-size: 15px;
    line-height: 20px;
  }

  .pc__sub {
    font-size: 12px;
  }

  .pc__bar {
    height: 6px;
  }

  .pc__cond {
    font-size: 11px;
    line-height: 16px;
  }

  .pc__right {
    font-size: 12px;

    b {
      font-size: 14px;
    }
  }
}
</style>
