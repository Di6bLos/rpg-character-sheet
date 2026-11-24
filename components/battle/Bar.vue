<script setup lang="ts">
// The battle board's one-line bar: campaign name, the board tabs, the round, and on the
// right "Open full sheet" for players or the GM's turn controls (Prev, Next turn, New
// round, End encounter). For the GM the campaign name opens
// Table (invites, session, players); for players it opens a menu with the campaign
// switcher and "Playing as".
import type { useInitiative } from '~/composables/useInitiative'
import { plural } from '~/utils/format'

const props = defineProps<{ init: ReturnType<typeof useInitiative> }>()

const { campaign, gmControls, base } = useCampaignBoard()
const { tabs, isCurrent } = useBoardNav()

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

// --- GM: Table and End encounter -------------------------------------------------
const tableOpen = ref(false)
const endOpen = ref(false)
const ending = ref(false)

async function endEncounter() {
  ending.value = true
  try {
    await props.init.endEncounter()
    endOpen.value = false
  } finally {
    ending.value = false
  }
}
</script>

<template>
  <header v-if="campaign" class="bar" data-track-area="Top bar" :class="{ 'bar--gm': gmControls }">
    <div ref="menuEl" class="bar__camp" @keydown.esc="closeMenu(true)">
      <!-- GM: the name opens Table (invites, session, players). -->
      <button
        v-if="gmControls"
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
      <div v-if="menuOpen && !gmControls" :id="menuId" class="bar__menu panel">
        <BattleCampaignMenu @navigate="closeMenu()" />
      </div>
    </div>

    <nav aria-label="Board sections" class="bar__tabs">
      <NuxtLink
        v-for="t in tabs"
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

    <div v-if="gmControls" class="bar__tools">
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
      >Open full sheet ↗</NuxtLink
    >

    <template v-if="gmControls">
      <UiDialog v-model="tableOpen" title="Table" width="960px">
        <BoardTableAdmin />
      </UiDialog>
      <UiDialog v-model="endOpen" title="End the encounter?" width="420px" alert>
        <div class="stack">
          <p>Every combatant leaves initiative and the round goes back to 1.</p>
          <div class="row" style="justify-content: flex-end">
            <button type="button" class="btn btn--ghost" @click="endOpen = false">Cancel</button>
            <button type="button" class="btn btn--danger" :disabled="ending" @click="endEncounter">
              End encounter
            </button>
          </div>
        </div>
      </UiDialog>
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
</style>
