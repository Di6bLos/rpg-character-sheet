<script setup lang="ts">
// The phone board's 52px top bar: the campaign name opens a menu that stands in for the
// app nav (hidden on the phone board) and the desktop bar's tabs: the board sections,
// the campaign switcher and Playing as (CampaignMenu), the
// app nav's links (Dashboard, Characters, Campaigns, Library) and the account items
// (Settings, Manual dice, Sign out); a GM on the player board also gets
// "Open GM console", and the GM console gets Table (invites, session, players). Then the
// round chip and, for players, a link to the full sheet; for the GM, a ⋯ menu with the
// encounter tools, End encounter and the initiative rules (GmPhoneMenu).
// The `tools` slot holds the frame's own buttons at the right end.
import type { useInitiative } from '~/composables/useInitiative'
import type { PhoneRole } from '~/utils/boardLayout'

const props = defineProps<{
  init: ReturnType<typeof useInitiative>
  role: PhoneRole
}>()
defineSlots<{ tools?: () => unknown }>()

const route = useRoute()
const auth = useAuthStore()
const { campaign, campaignId, isGm, gmControls, base } = useCampaignBoard()
const { tabs, isCurrent } = useBoardNav()
const { ownDice, savingDice, toggleOwnDice, signOut } = useAccountMenu()

const hasOrder = computed(() => props.init.order.value.length > 0)

/** The board's sections, with the shorter Maps label for the phone menu. */
const SECTION_LABELS: Record<string, string> = { maps: 'Maps' }
const sections = computed(() =>
  tabs.value.map((t) => ({ ...t, label: SECTION_LABELS[t.id] ?? t.label })),
)

// --- Menu -------------------------------------------------------------------------------
const open = ref(false)
const menuEl = ref<HTMLElement | null>(null)
const btn = ref<HTMLButtonElement | null>(null)
const menuId = useId()

function close(refocus = false) {
  if (!open.value) return
  open.value = false
  if (refocus) btn.value?.focus()
}
function onDocClick(event: MouseEvent) {
  if (menuEl.value && !menuEl.value.contains(event.target as Node)) close()
}
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
watch(
  () => route.fullPath,
  () => close(),
)

// GM: Table (invites, session, players), as the desktop bar's campaign name opens.
const tableOpen = ref(false)
function openTable() {
  open.value = false
  tableOpen.value = true
}

async function onSignOut() {
  open.value = false
  await signOut()
}
</script>

<template>
  <header v-if="campaign" class="pbar" data-track-area="Top bar">
    <div ref="menuEl" class="pbar__camp" @keydown.esc="close(true)">
      <button
        ref="btn"
        type="button"
        class="pbar__title"
        :aria-expanded="open"
        :aria-controls="menuId"
        @click="open = !open"
      >
        <span class="pbar__name">{{ campaign.name }}</span>
        <span class="pbar__caret" aria-hidden="true">▾</span>
      </button>
      <div v-if="open" :id="menuId" class="pbar__menu panel">
        <nav aria-label="Board sections" class="pbar__links">
          <NuxtLink
            v-for="t in sections"
            :key="t.id"
            :to="`${base}/${t.id}`"
            :aria-current="isCurrent(t.id) ? 'page' : undefined"
          >
            {{ t.label }}
          </NuxtLink>
          <NuxtLink v-if="isGm && !gmControls" :to="`/campaigns/${campaignId}/gm/battle`">
            Open GM console
          </NuxtLink>
          <button v-if="gmControls" type="button" aria-haspopup="dialog" @click="openTable">
            Table
          </button>
        </nav>
        <BattleCampaignMenu @navigate="close()" />
        <nav aria-label="Primary" class="pbar__links">
          <NuxtLink to="/dashboard">Dashboard</NuxtLink>
          <NuxtLink to="/characters">Characters</NuxtLink>
          <NuxtLink to="/campaigns">Campaigns</NuxtLink>
          <NuxtLink to="/library">Library</NuxtLink>
        </nav>
        <div
          class="pbar__links"
          role="group"
          :aria-label="`Account: ${auth.profile?.display_name ?? ''}`"
        >
          <NuxtLink v-if="auth.isStaff" to="/admin">Admin area</NuxtLink>
          <NuxtLink to="/settings">Settings</NuxtLink>
          <button
            type="button"
            role="switch"
            class="pbar__toggle"
            :aria-checked="ownDice"
            :disabled="savingDice || auth.isSuspended"
            title="The app checks things off but rolls nothing; you roll at the table. For all your heroes."
            @click="toggleOwnDice"
          >
            Manual dice
            <span class="pbar__switch" aria-hidden="true"><span /></span>
          </button>
          <button type="button" @click="onSignOut">Sign out</button>
        </div>
      </div>
    </div>

    <span class="pbar__space" />

    <span v-if="hasOrder" class="pbar__round" role="status">
      <span>Round</span> <b>{{ init.round.value }}</b>
    </span>

    <NuxtLink
      v-if="role === 'player' && campaign.myCharacterId"
      :to="`/character/${campaign.myCharacterId}?campaign=${campaign.id}`"
      class="pbar__icon"
      aria-label="Open full sheet"
      title="Open full sheet"
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M7 3h8l4 4v14H7V3ZM15 3v4h4M10 12h6M10 16h6" />
      </svg>
    </NuxtLink>
    <BattleGmPhoneMenu v-if="role === 'gm'" :init="init" />
    <slot name="tools" />
    <UiDialog v-if="gmControls" v-model="tableOpen" title="Table" width="960px">
      <BoardTableAdmin />
    </UiDialog>
  </header>
</template>

<style scoped lang="scss">
.pbar {
  flex: none;
  height: calc(52px + env(safe-area-inset-top));
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px 0 12px;
  padding-top: env(safe-area-inset-top);
  border-bottom: 1px solid var(--line);
  background: var(--nav-bg);
  white-space: nowrap;
}

.pbar__camp {
  min-width: 0;
  flex: 0 1 auto;
}

.pbar__title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  min-height: 44px;
  padding: 0 8px;
  margin-left: -8px;
  border: 0;
  border-radius: min(var(--radius-control), 8px);
  background: none;
  color: var(--page-text);
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 700;
  letter-spacing: var(--display-spacing, 0.04em);

  &[aria-expanded='true'] {
    background: var(--accent-tint);
  }
}

.pbar__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pbar__caret {
  font-size: 12px;
  color: var(--page-muted);
}

// A sheet under the bar, the screen's width less a margin; long menus scroll inside.
.pbar__menu {
  position: absolute;
  left: 8px;
  right: 8px;
  top: calc(52px + env(safe-area-inset-top) + 6px);
  z-index: 50;
  max-height: calc(100dvh - 52px - env(safe-area-inset-top) - 16px);
  overflow-y: auto;
  overscroll-behavior: contain;
  box-sizing: border-box;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  white-space: normal;
  box-shadow: var(--shadow-pop);
  // Opaque: the panel colour is translucent in some themes, and the board shows through.
  // A solid nav colour underneath, the panel's own background laid over it.
  isolation: isolate;
  background: var(--nav-bg);

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    background: var(--panel-bg);
  }
}

.pbar__links {
  display: flex;
  flex-direction: column;
  gap: 2px;

  & + & {
    border-top: 1px solid var(--line);
    padding-top: 10px;
  }

  a,
  button {
    display: flex;
    align-items: center;
    min-height: 44px;
    padding: 0 12px;
    border: 0;
    border-radius: min(var(--radius-control), 8px);
    background: none;
    color: var(--page-text);
    font: inherit;
    text-align: left;
    text-decoration: none;

    &[aria-current='page'] {
      font-weight: 700;
      box-shadow: inset 3px 0 0 var(--accent);
    }
  }
}

// CampaignMenu's rows sit between the link groups.
.pbar__menu > :deep(.bar__meta) {
  border-top: 1px solid var(--line);
  padding-top: 10px;
}

.pbar__toggle {
  justify-content: space-between;
  gap: 12px;

  &:disabled {
    cursor: progress;
  }
}

// The same small switch as the account menu's.
.pbar__switch {
  position: relative;
  flex: none;
  width: 34px;
  height: 20px;
  border-radius: 999px;
  background: var(--track);
  box-shadow: inset 0 0 0 1px var(--line-strong);

  span {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--page-muted);
    transition: transform 0.15s;
  }

  [aria-checked='true'] > & {
    background: var(--accent);

    span {
      background: var(--on-accent);
      transform: translateX(14px);
    }
  }
}

@media (prefers-reduced-motion: reduce) {
  .pbar__switch span {
    transition: none;
  }
}

.pbar__space {
  flex: 1 1 0;
}

.pbar__round {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  font-size: 12px;
  color: var(--page-soft);

  b {
    font-family: var(--font-display);
    color: color-mix(in srgb, var(--accent) 70%, var(--page-text));
  }
}

.pbar__icon {
  flex: none;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: var(--page-text);

  svg {
    width: 34px;
    height: 34px;
    padding: 7px;
    box-sizing: border-box;
    border-radius: 50%;
    border: 1px solid var(--line-strong);
    background: var(--inset);
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
}
</style>
