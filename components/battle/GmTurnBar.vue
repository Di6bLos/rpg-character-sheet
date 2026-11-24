<script setup lang="ts">
// The GM's turn bar on the battle board (top of the centre column): who is acting and
// who is next, "+ Add creatures" (the add dialog), a menu with Add the party, Sync
// summons and Reroll NPC initiative, and Add party while out of an encounter with
// heroes not seated (Next turn is in the board's top bar). It also drops summons that left
// their hero's sheet as the roster refreshes (as the Party tab's Initiative panel does).
// The menu's tools are useGmEncounterTools, shared with the phone bar's ⋯ menu. Compact
// (phone, the bottom of the frame): one row with who is acting, up next, New round and
// Next ▶, the same handlers as the desktop top bar's buttons; "+ Add" is on the
// Encounter tab and the rest is in the phone bar's ⋯ menu.
import type { RosterEntry } from '~/types'
import type { useInitiative } from '~/composables/useInitiative'
import { plural } from '~/utils/format'

const props = defineProps<{
  init: ReturnType<typeof useInitiative>
  roster: RosterEntry[]
  /** Phone: one row (who is acting, up next, New round, Next ▶); the rest is in the bar's ⋯. */
  compact?: boolean
}>()

const order = computed(() => props.init.order.value)
const acting = computed(() => order.value.find((c) => c.id === props.init.turnId.value))

const title = computed(() => {
  if (!order.value.length) return 'No encounter running'
  if (acting.value) return `${acting.value.name} is acting`
  return `${order.value[0]?.name ?? 'Nobody'} is up first`
})

const upNext = computed(() => {
  const list = order.value
  if (!list.length) return 'Add the party and creatures, then press Next turn.'
  if (!acting.value) return `Round ${props.init.round.value} · Next turn starts the encounter`
  const at = list.findIndex((c) => c.id === acting.value?.id)
  const next = [1, 2]
    .map((k) => list[(at + k) % list.length])
    .filter((c, i, all) => !!c && c.id !== acting.value?.id && all.indexOf(c) === i)
    .map((c) => c?.name)
  return `Round ${props.init.round.value}${next.length ? ` · Up next: ${next.join(', then ')}` : ''}`
})

watch(
  () => props.roster,
  (roster) => void props.init.pruneSummons(roster),
)

// --- Add, and the menu ------------------------------------------------------------------
const addOpen = ref(false)
const menuOpen = ref(false)
const menuEl = ref<HTMLElement | null>(null)
const menuBtn = ref<HTMLButtonElement | null>(null)
const menuId = useId()

function closeMenu(refocus = false) {
  if (!menuOpen.value) return
  menuOpen.value = false
  if (refocus) menuBtn.value?.focus()
}
function onDocClick(event: MouseEvent) {
  if (menuEl.value && !menuEl.value.contains(event.target as Node)) closeMenu()
}
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))

const { busy, partyMissing, offerParty, addParty, syncSummons, reroll, setMode } =
  useGmEncounterTools(props.init, toRef(props, 'roster'), () => closeMenu())

// --- Compact (phone): one row with Next turn and New round, the same handlers as the
// desktop top bar's buttons. ------------------------------------------------------------
const hasOrder = computed(() => order.value.length > 0)
</script>

<template>
  <section class="panel gtb" :class="{ 'gtb--compact': compact }" aria-label="Turn">
    <div class="gtb__who">
      <strong class="gtb__title" role="status" :title="title">{{ title }}</strong>
      <span class="gtb__sub" :title="upNext">{{ upNext }}</span>
    </div>
    <div v-if="compact" class="gtb__tools">
      <button
        type="button"
        class="btn btn--ghost btn--sm gtb__step"
        :title="`Start round ${init.round.value + 1} from the top of the order`"
        :disabled="!init.turnId.value"
        @click="init.newRound"
      >
        New round
      </button>
      <button
        type="button"
        class="btn btn--sm gtb__step"
        :disabled="!hasOrder"
        @click="init.nextTurn"
      >
        Next ▶
      </button>
    </div>
    <div v-else class="gtb__tools">
      <button
        type="button"
        class="btn btn--ghost btn--sm"
        aria-label="Add creatures"
        @click="addOpen = true"
      >
        <span>+ Add<span class="gtb__long"> creatures</span></span>
      </button>
      <div ref="menuEl" class="gtb__more" @keydown.esc="closeMenu(true)">
        <button
          ref="menuBtn"
          type="button"
          class="btn btn--ghost btn--sm gtb__more-btn"
          aria-haspopup="true"
          :aria-expanded="menuOpen"
          :aria-controls="menuId"
          aria-label="More encounter tools"
          @click="menuOpen = !menuOpen"
        >
          ⋯
        </button>
        <div v-if="menuOpen" :id="menuId" class="gtb__menu panel">
          <button
            type="button"
            class="gtb__item"
            :disabled="busy || !partyMissing"
            @click="addParty"
          >
            Add the party
            <small>{{
              partyMissing ? `${plural(partyMissing, 'hero')} not seated` : 'Everyone is seated'
            }}</small>
          </button>
          <button
            type="button"
            class="gtb__item"
            :disabled="busy || !order.length"
            @click="syncSummons"
          >
            Sync summons
            <small>Seat the heroes' summons, drop dismissed ones</small>
          </button>
          <button type="button" class="gtb__item" :disabled="busy || !order.length" @click="reroll">
            Reroll NPC initiative
            <small>Every monster and NPC rolls again</small>
          </button>
          <BattleGmModes :mode="init.mode.value" :disabled="busy" @pick="setMode" />
        </div>
      </div>
      <!-- Out of combat with heroes still to seat, offer to seat the party
           (Next turn is in the top bar). -->
      <button
        v-if="offerParty"
        type="button"
        class="btn btn--sm"
        :disabled="busy"
        :title="`${plural(partyMissing, 'hero')} not seated`"
        @click="addParty"
      >
        Add party
      </button>
    </div>
    <BoardAddCombatants v-if="!compact" v-model="addOpen" :init="init" :roster="roster" />
  </section>
</template>

<style scoped lang="scss">
.gtb {
  container: gtb / inline-size;
  flex: none;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 12px;
  padding: 8px 12px;
}

// Takes what the tools leave, so the bar stays on one row at 1200px; long lines
// truncate (the full text is in their title).
.gtb__who {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 100px;
  flex: 1 1 0;
}

.gtb__title,
.gtb__sub {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gtb__title {
  font-family: var(--font-heading);
  font-size: 15px;
}

.gtb__sub {
  font-size: 12px;
  color: var(--page-muted);
}

// A narrow bar (1200–1280px windows) says just "+ Add", so the headline keeps its room.
@container gtb (max-width: 480px) {
  .gtb__long {
    display: none;
  }
}

.gtb__tools {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

.gtb__more {
  position: relative;
}

.gtb__more-btn {
  padding: 0 10px;
  font-size: 18px;
  line-height: 1;
}

.gtb__menu {
  position: absolute;
  z-index: 30;
  top: calc(100% + 6px);
  right: 0;
  width: 260px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.gtb__item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 8px 10px;
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--page-text);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  text-align: left;

  small {
    font-size: 11px;
    font-weight: 400;
    color: var(--page-muted);
  }

  &:hover:not(:disabled) {
    background: var(--accent-tint);
  }

  &:disabled {
    opacity: 0.5;
  }
}

// Phone: one row at the bottom of the frame, no panel edge; 44px buttons.
.gtb--compact {
  flex-wrap: nowrap;
  gap: 8px;
  padding: 8px 12px;
  border-width: 1px 0 0;
  border-radius: 0;

  .gtb__who {
    min-width: 0;
  }

  .gtb__title {
    font-size: 14px;
  }

  .gtb__tools {
    gap: 8px;
  }
}

.gtb__step {
  min-height: 44px;
  padding: 0 12px;
  font-size: 14px;
}
</style>
