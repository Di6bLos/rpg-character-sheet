<script setup lang="ts">
// The player's quick-action panel on the Party tab (Nimble characters only).
// From 1200px: docked in the page's left margin, outside the content column,
// sticky and collapsible to a slim tab (the board shell moves right when the
// margin is too narrow). Below that: a tab on the left edge opens it as a drawer.
// One <dialog> serves both (useDockedPanel), so the sheet editor inside stays
// mounted and unsaved changes survive a resize. The edge tab joins the stack in
// PartyView's `.edge-tabs`, above the Lore Master's.
import type { Character } from '~/types'
import type { AnySheet } from '~/types/sheets'

const props = defineProps<{
  downSummons: string[]
  turnCharacterId: string | null
  round: number | null
}>()

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
const { el, wide, drawerOpen, folded, setCollapsed, onClose, onBackdrop, dismiss } = useDockedPanel(
  {
    collapsedKey: 'lantern:action-panel-collapsed',
    unfoldSelector: '.ap__unfold',
    dismissSelector: '[data-ap-dismiss]',
  },
)
</script>

<template>
  <div v-if="character" class="ap-slot" :class="{ 'ap-slot--folded': folded }">
    <Teleport to=".edge-tabs" defer>
      <button
        v-if="!wide"
        type="button"
        class="edge-tab edge-tab--actions"
        :aria-controls="panelId"
        :aria-expanded="drawerOpen"
        @click="drawerOpen = true"
      >
        Actions
      </button>
    </Teleport>
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
          :down-summons="props.downSummons"
          :turn-character-id="props.turnCharacterId"
          :round="props.round"
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
