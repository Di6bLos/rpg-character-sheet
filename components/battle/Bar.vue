<script setup lang="ts">
// The battle board's one-line bar: campaign name, the board tabs, the round, and on the
// right "Open full sheet" for players or the GM's turn controls (Prev, Next turn, New
// round, End encounter). For the GM the campaign name opens
// Table (invites, session, players); for players it opens a menu with the campaign
// switcher and "Playing as".
// The tablet variant (portrait, 768–1023px) has no right column to show: the tabs drop
// Party (classic), which moves into the campaign menu (for the GM too, with Table), and
// after the round come buttons that open the drawer on Party, Chat (with its unread
// badge) and Scribe; then "Sheet ↗" for players, or the GM's ⋯ menu (GmPhoneMenu:
// Previous turn, the encounter tools, the initiative rules and End encounter). Next turn
// and New round are on the GM's turn bar there.
import type { useInitiative } from '~/composables/useInitiative'
import type { DrawerTab } from '~/composables/useBattleRight'
import { plural } from '~/utils/format'

const props = withDefaults(
  defineProps<{
    init: ReturnType<typeof useInitiative>
    variant?: 'desktop' | 'tablet'
    /** Tablet: the Scribe is open to this user (the frame checks, useLoreAvailable). */
    scribe?: boolean
  }>(),
  { variant: 'desktop' },
)

const { campaign, gmControls, base } = useCampaignBoard()
const { tabs, isCurrent } = useBoardNav()
const tablet = computed(() => props.variant === 'tablet')

/** The tabs on the bar: the tablet's leave Party (classic) to the campaign menu. */
const barTabs = computed(() =>
  tablet.value
    ? tabs.value
        .filter((t) => t.id !== 'party')
        .map((t) => (t.id === 'maps' ? { ...t, label: 'Maps' } : t))
    : tabs.value,
)
const partyTab = computed(() => tabs.value.find((t) => t.id === 'party'))

// --- Tablet: the drawer's buttons ----------------------------------------------------------
const right = useBattleRight()
const chatBadge = useChatBadge(() => right.drawer.value === 'chat')
function toggleDrawer(tab: DrawerTab) {
  right.openDrawer(right.drawer.value === tab ? null : tab)
}

const hasOrder = computed(() => props.init.order.value.length > 0)
const acting = computed(
  () => props.init.order.value.find((c) => c.id === props.init.turnId.value)?.name ?? '',
)

// --- Campaign menu ------------------------------------------------------------------
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

// --- GM: Table and End encounter (its confirm is GmEndEncounter) -----------------
const tableOpen = ref(false)
const endOpen = ref(false)
</script>

<template>
  <header
    v-if="campaign"
    class="bar"
    data-track-area="Top bar"
    :class="{ 'bar--gm': gmControls, 'bar--tablet': tablet }"
  >
    <div ref="menuEl" class="bar__camp" @keydown.esc="closeMenu(true)">
      <!-- GM: the name opens Table (invites, session, players); on a tablet, the menu. -->
      <button
        v-if="gmControls && !tablet"
        type="button"
        class="bar__title"
        aria-haspopup="dialog"
        :title="`${campaign.name}: table, invites and players`"
        @click="tableOpen = true"
      >
        <span class="bar__name">{{ campaign.name }}</span>
        <span class="bar__caret" aria-hidden="true">▾</span>
      </button>
      <button
        v-else
        ref="menuBtn"
        type="button"
        class="bar__title"
        aria-haspopup="true"
        :aria-expanded="menuOpen"
        :aria-controls="menuId"
        @click="menuOpen = !menuOpen"
      >
        <span class="bar__name">{{ campaign.name }}</span>
        <span class="bar__caret" aria-hidden="true">▾</span>
      </button>
      <div v-if="menuOpen && (tablet || !gmControls)" :id="menuId" class="bar__menu panel">
        <nav v-if="tablet" aria-label="More board sections" class="bar__links">
          <NuxtLink
            v-if="partyTab"
            :to="`${base}/party`"
            :aria-current="isCurrent('party') ? 'page' : undefined"
            @click="closeMenu()"
          >
            Party (classic)
            <span
              v-if="partyTab.badge"
              class="bar__badge"
              :aria-label="plural(partyTab.badge, 'unread message')"
              >{{ partyTab.badge }}</span
            >
          </NuxtLink>
          <button
            v-if="gmControls"
            type="button"
            aria-haspopup="dialog"
            @click="(closeMenu(), (tableOpen = true))"
          >
            Table
          </button>
        </nav>
        <BattleCampaignMenu @navigate="closeMenu()" />
      </div>
    </div>

    <nav aria-label="Board sections" class="bar__tabs">
      <NuxtLink
        v-for="t in barTabs"
        :key="t.id"
        :to="`${base}/${t.id}`"
        :aria-current="isCurrent(t.id) ? 'page' : undefined"
      >
        {{ t.label }}
        <span v-if="t.badge" class="bar__badge" :aria-label="plural(t.badge, 'unread message')">{{
          t.badge
        }}</span>
      </NuxtLink>
    </nav>

    <span class="bar__space" />

    <div v-if="hasOrder" class="bar__round" role="status">
      <span class="small muted">Round</span>
      <b>{{ init.round.value }}</b>
      <span v-if="acting" class="bar__acting small muted">· {{ acting }} is acting</span>
    </div>

    <div v-if="tablet" class="bar__drawer" role="group" aria-label="Party and chat">
      <button
        type="button"
        class="bar__icon"
        aria-label="Party"
        title="Party"
        aria-haspopup="dialog"
        :aria-expanded="right.drawer.value === 'party'"
        @click="toggleDrawer('party')"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.8c2 .7 3.2 2.4 3.5 5.2"
          />
        </svg>
      </button>
      <button
        type="button"
        class="bar__icon"
        :aria-label="chatBadge ? `Chat, ${plural(chatBadge, 'unread message')}` : 'Chat'"
        title="Chat"
        aria-haspopup="dialog"
        :aria-expanded="right.drawer.value === 'chat'"
        @click="toggleDrawer('chat')"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 5h16v11H9l-5 4V5Z" />
        </svg>
        <span v-if="chatBadge" class="bar__badge bar__badge--dot" aria-hidden="true">{{
          chatBadge
        }}</span>
      </button>
      <button
        v-if="props.scribe"
        type="button"
        class="bar__icon"
        aria-label="Scribe"
        title="Scribe"
        aria-haspopup="dialog"
        :aria-expanded="right.drawer.value === 'scribe'"
        @click="toggleDrawer('scribe')"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2L12 3Z" />
        </svg>
      </button>
    </div>

    <BattleGmPhoneMenu v-if="tablet && gmControls" :init="init" />
    <div v-else-if="gmControls" class="bar__tools">
      <button
        type="button"
        class="btn btn--ghost btn--sm"
        title="Previous turn"
        :disabled="!init.turnId.value"
        @click="init.prevTurn"
      >
        ◀ Prev
      </button>
      <button type="button" class="btn btn--sm" :disabled="!hasOrder" @click="init.nextTurn">
        Next turn ▶
      </button>
      <button
        type="button"
        class="btn btn--ghost btn--sm"
        :title="`Start round ${init.round.value + 1} from the top of the order`"
        :disabled="!init.turnId.value"
        @click="init.newRound"
      >
        New round ⟳
      </button>
      <button
        type="button"
        class="btn btn--danger btn--sm"
        :disabled="!hasOrder"
        @click="endOpen = true"
      >
        End encounter
      </button>
    </div>
    <NuxtLink
      v-else-if="campaign.myCharacterId"
      :to="`/character/${campaign.myCharacterId}?campaign=${campaign.id}`"
      class="btn btn--ghost btn--sm"
      :class="{ bar__sheet: tablet }"
      >{{ tablet ? 'Sheet ↗' : 'Open full sheet ↗' }}</NuxtLink
    >

    <template v-if="gmControls">
      <UiDialog v-model="tableOpen" title="Table" width="960px">
        <BoardTableAdmin />
      </UiDialog>
      <BattleGmEndEncounter v-model="endOpen" :init="init" />
    </template>
  </header>
</template>

<style scoped lang="scss">
.bar {
  min-height: 48px;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 4px 20px;
  border-bottom: 1px solid var(--line);
  white-space: nowrap;
}

.bar__camp {
  position: relative;
  min-width: 0;
  flex: 0 1 auto;
}

.bar__title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 260px;
  min-height: 40px;
  padding: 0 8px;
  margin-left: -8px;
  border: 0;
  border-radius: min(var(--radius-control), 8px);
  background: none;
  color: var(--page-text);
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: var(--display-spacing, 0.04em);

  &:hover,
  &[aria-expanded='true'] {
    background: var(--accent-tint);
  }
}

.bar__name {
  overflow: hidden;
  text-overflow: ellipsis;
}

.bar__caret {
  font-size: 12px;
  color: var(--page-muted);
}

.bar__menu {
  position: absolute;
  left: -8px;
  top: calc(100% + 6px);
  z-index: 50;
  width: 300px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  white-space: normal;
  box-shadow: var(--shadow-pop);
}

.bar__tabs {
  display: flex;
  gap: 4px;
  flex: none;

  a {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 32px;
    padding: 0 12px;
    border-radius: 999px;
    color: var(--page-muted);
    font-size: 14px;
    font-weight: 600;
    text-decoration: none;

    &:hover {
      color: var(--page-text);
    }

    &[aria-current='page'] {
      background: var(--accent-tint);
      color: var(--accent-text);
    }
  }
}

.bar__badge {
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  box-sizing: border-box;
  border-radius: 999px;
  background: var(--accent);
  color: var(--on-accent);
  font-size: 11px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.bar__space {
  flex: 1 1 0;
}

.bar__round {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 999px;

  b {
    font-family: var(--font-display);
    color: var(--accent-text);
  }
}

.bar__acting {
  overflow: hidden;
  text-overflow: ellipsis;
}

.bar__tools {
  display: flex;
  gap: 6px;
  flex: none;
}

// Tight widths: drop the "· Marx is acting" note before anything wraps.
@media (max-width: 1360px) {
  .bar--gm .bar__acting {
    display: none;
  }
}

// --- Tablet ------------------------------------------------------------------------------
.bar--tablet {
  gap: 8px;
  padding: 4px 12px 4px 16px;
  min-height: 56px;

  .bar__title {
    max-width: 180px;
  }

  .bar__tabs a {
    min-height: 40px;
    padding: 0 10px;
  }

  .bar__round {
    flex: 0 1 auto;
    padding: 0 10px;
  }
}

// The campaign menu's extra sections (Party (classic), Table) above CampaignMenu's rows.
.bar__links {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--line);

  a,
  button {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding: 0 12px;
    border: 0;
    border-radius: min(var(--radius-control), 8px);
    background: none;
    color: var(--page-text);
    font: inherit;
    text-align: left;
    text-decoration: none;

    &:hover {
      background: var(--accent-tint);
    }

    &[aria-current='page'] {
      font-weight: 700;
      box-shadow: inset 3px 0 0 var(--accent);
    }
  }
}

.bar__drawer {
  flex: none;
  display: flex;
  gap: 4px;
}

.bar__icon {
  position: relative;
  flex: none;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: none;
  color: var(--page-text);

  svg {
    width: 36px;
    height: 36px;
    padding: 8px;
    box-sizing: border-box;
    border-radius: 50%;
    border: 1px solid var(--line-strong);
    background: var(--inset);
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  &[aria-expanded='true'] svg {
    border-color: var(--accent);
    background: var(--accent-tint);
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
}

.bar__badge--dot {
  position: absolute;
  top: 0;
  right: 0;
}

.bar__sheet {
  flex: none;
  min-height: 44px;
}
</style>
