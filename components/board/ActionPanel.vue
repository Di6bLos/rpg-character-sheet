<script setup lang="ts">
// The player's quick-action panel on the Party tab (Nimble characters only).
// From 1200px: docked in the page's left margin, outside the content column,
// sticky and collapsible to a slim tab (the board shell moves right when the
// margin is too narrow). Below that: a tab on the left edge opens it as a drawer.
// One <dialog> serves both (non-modal when docked, modal as a drawer), so the
// sheet editor inside stays mounted and unsaved changes survive a resize.
import type { Character } from '~/types'
import type { AnySheet } from '~/types/sheets'

const WIDE_QUERY = '(min-width: 1200px)'
const COLLAPSED_KEY = 'lantern:action-panel-collapsed'

const auth = useAuthStore()
const characters = useCharacterStore()
const snackbar = useSnackbarStore()
const { campaign, isGm } = useCampaignBoard()

const characterId = computed(() =>
  !isGm.value && campaign.value?.system === 'nimble' ? campaign.value.myCharacterId : null,
)
const character = ref<Character<AnySheet> | null>(null)
const canEdit = computed(() => character.value?.user_id === auth.userId && !auth.isSuspended)

watch(
  characterId,
  async (id) => {
    character.value = null
    if (!id) return
    try {
      const found = await characters.fetchOne(id)
      if (characterId.value === id) character.value = found
    } catch (err) {
      snackbar.error(err, 'Could not load your character for quick actions')
    }
  },
  { immediate: true },
)

// --- Docked or drawer ------------------------------------------------------------
const panelId = useId()
const el = ref<HTMLDialogElement | null>(null)
const wide = ref(true)
const drawerOpen = ref(false)
const collapsed = ref(false)

let media: MediaQueryList | null = null
const onMedia = () => (wide.value = !!media?.matches)

onMounted(() => {
  media = window.matchMedia(WIDE_QUERY)
  onMedia()
  media.addEventListener('change', onMedia)
  try {
    collapsed.value = localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    // Storage blocked: start expanded.
  }
})
onBeforeUnmount(() => media?.removeEventListener('change', onMedia))

function setCollapsed(on: boolean) {
  collapsed.value = on
  try {
    localStorage.setItem(COLLAPSED_KEY, on ? '1' : '0')
  } catch {
    // Not remembered; fine.
  }
  // The button that was pressed is hidden now: hand focus to its counterpart.
  nextTick(() => {
    const target = on ? '.ap__unfold' : '[data-ap-dismiss]'
    el.value?.querySelector<HTMLElement>(target)?.focus()
  })
}

/** Opens the dialog in the mode the screen calls for. */
function sync() {
  const dialog = el.value
  if (!dialog) return
  const modal = dialog.open && dialog.matches(':modal')
  if (wide.value) {
    if (modal) dialog.close()
    if (!dialog.open) {
      // show() focuses the first control; docked, the panel shouldn't take focus from the page.
      const before = document.activeElement
      dialog.show()
      if (before instanceof HTMLElement && before !== document.body) before.focus()
      else (document.activeElement as HTMLElement | null)?.blur()
    }
  } else if (drawerOpen.value) {
    if (!modal) {
      if (dialog.open) dialog.close()
      dialog.showModal()
    }
  } else if (dialog.open) {
    dialog.close()
  }
}

watch([el, wide, drawerOpen], sync, { flush: 'post' })

function onClose() {
  drawerOpen.value = false
  // Closing the drawer when the screen widened mid-way: dock it again.
  if (wide.value) nextTick(sync)
}

function onBackdrop(event: MouseEvent) {
  if (!wide.value && event.target === el.value) drawerOpen.value = false
}

function dismiss() {
  if (wide.value) setCollapsed(true)
  else drawerOpen.value = false
}

const folded = computed(() => wide.value && collapsed.value)
</script>

<template>
  <div v-if="character" class="ap-slot" :class="{ 'ap-slot--folded': folded }">
    <button
      v-if="!wide"
      type="button"
      class="ap-tab"
      :aria-controls="panelId"
      :aria-expanded="drawerOpen"
      @click="drawerOpen = true"
    >
      Actions
    </button>
    <dialog
      :id="panelId"
      ref="el"
      class="ap panel"
      :class="{ 'ap--folded': folded }"
      aria-label="Quick actions"
      @close="onClose"
      @click="onBackdrop"
    >
      <button
        v-if="folded"
        type="button"
        class="ap__unfold"
        title="Show quick actions"
        aria-expanded="false"
        :aria-controls="`${panelId}-inner`"
        @click="setCollapsed(false)"
      >
        <span aria-hidden="true">›</span>
        <span class="ap__unfold-label">Actions</span>
      </button>
      <div v-show="!folded" :id="`${panelId}-inner`" class="ap__inner">
        <BoardActionPanelBody
          :key="character.id"
          :character="character"
          :can-edit="canEdit"
          :campaign-name="campaign?.name ?? ''"
          :drawer="!wide"
          @dismiss="dismiss"
        />
      </div>
    </dialog>
  </div>
</template>

<style scoped lang="scss">
.ap {
  // Docked (non-modal): follows the scroll inside its slot.
  position: sticky;
  top: 16px;
  // Sticky makes a stacking context; lift it so its tooltips paint over the roster.
  z-index: 5;
  inset-inline: auto;
  margin: 0;
  width: 100%;
  max-height: calc(100dvh - 32px);
  padding: 0;
  overflow: auto;
  overscroll-behavior: contain;

  &--folded {
    overflow: visible;
  }

  // Drawer (modal): pinned to the left edge.
  &:modal {
    position: fixed;
    inset: 0 auto 0 0;
    width: min(320px, calc(100vw - 48px));
    max-width: none;
    height: 100dvh;
    max-height: none;
    border-radius: 0 var(--radius-panel) var(--radius-panel) 0;
  }

  &::backdrop {
    background: rgb(0 0 0 / 50%);
  }
}

.ap__inner {
  padding: 14px;
}

.ap__unfold {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 0;
  border: 0;
  background: none;
  color: var(--page-soft);
  font-weight: 700;
  font-size: 18px;
}

.ap__unfold-label {
  writing-mode: vertical-rl;
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.ap-tab {
  position: fixed;
  left: 0;
  top: 50%;
  z-index: 40;
  translate: 0 -50%;
  writing-mode: vertical-rl;
  min-width: 44px;
  padding: 16px 12px;
  border: 1px solid var(--line-strong);
  border-left: 0;
  border-radius: 0 10px 10px 0;
  background: var(--accent);
  color: var(--on-accent);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
}

// Docked: a full-height slot just left of the Party content, in the page margin.
@media (min-width: 1200px) {
  .ap-slot {
    position: absolute;
    top: 0;
    bottom: 0;
    right: calc(100% + 24px);
    width: 264px;

    &--folded {
      width: 44px;
    }
  }
}

// Below: the slot takes no room; only the edge tab shows.
@media not all and (min-width: 1200px) {
  .ap-slot {
    position: absolute;
    width: 0;
  }

  .ap:not(:modal) {
    display: none;
  }
}
</style>

<style lang="scss">
// Docked panel: keep the board shell (max 1280px, 48px side padding) far enough
// right that the panel fits in its left margin: 16px edge + panel + 24px gap.
// `.page.shell` is the board frame (layouts/default.vue's root is a bare `.shell`).
@media (min-width: 1200px) {
  .page.shell:has(.ap-slot) {
    // Folded: 16 + 44 + 24 = 84px before the content, 48 of it the shell's padding.
    --ap-shift: max(calc((100% - 1280px) / 2), 40px);
    width: min(1280px, calc(100% - var(--ap-shift)));
    margin-left: var(--ap-shift);
    margin-right: auto;

    @media (prefers-reduced-motion: no-preference) {
      transition:
        margin-left 0.2s ease,
        width 0.2s ease;
    }
  }

  // Open: 16 + 264 + 24 = 304px.
  .page.shell:has(.ap-slot:not(.ap-slot--folded)) {
    --ap-shift: max(calc((100% - 1280px) / 2), 256px);
  }
}

// Edge tab: keep the content clear of it.
@media not all and (min-width: 1200px) {
  .page.shell:has(.ap-tab) {
    padding-left: 52px;
  }
}
</style>
