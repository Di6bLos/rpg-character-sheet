<script setup lang="ts">
// The Scribe on the Party tab: an AI chat for GMs (co-GM with the whole
// campaign) and players (rules and their own hero only; enforced by the
// lore-master Edge Function). Shown when AI is on site-wide and the user has
// saved a provider key, or the free agent (site's Gemini key) is on. From 1200px it docks in the page's right margin and
// folds to a slim tab; below that a "Lore" tab under "Actions" opens it as a
// drawer from the left. Same one-<dialog> approach as the quick-action panel.
const visible = useLoreAvailable()

const panelId = useId()
const { el, wide, drawerOpen, folded, setCollapsed, onClose, onBackdrop, dismiss } = useDockedPanel(
  {
    collapsedKey: 'lantern:lore-panel-collapsed',
    unfoldSelector: '.lp__unfold',
    dismissSelector: '[data-lp-dismiss]',
  },
)
</script>

<template>
  <div v-if="visible" class="lp-slot" :class="{ 'lp-slot--folded': folded }">
    <Teleport to=".edge-tabs" defer>
      <button
        v-if="!wide"
        type="button"
        class="edge-tab edge-tab--lore"
        :aria-controls="panelId"
        :aria-expanded="drawerOpen"
        @click="drawerOpen = true"
      >
        Scribe
      </button>
    </Teleport>
    <dialog
      :id="panelId"
      ref="el"
      class="lp panel"
      :class="{ 'lp--folded': folded }"
      aria-label="Scribe"
      @close="onClose"
      @click="onBackdrop"
    >
      <button
        v-if="folded"
        type="button"
        class="lp__unfold"
        title="Show the Scribe"
        aria-expanded="false"
        :aria-controls="`${panelId}-inner`"
        @click="setCollapsed(false)"
      >
        <span aria-hidden="true">‹</span>
        <span class="lp__unfold-label">Scribe</span>
      </button>
      <div v-show="!folded" :id="`${panelId}-inner`" class="lp__inner">
        <BoardLorePanelChat :drawer="!wide" @dismiss="dismiss" />
      </div>
    </dialog>
  </div>
</template>

<style scoped lang="scss">
.lp {
  // Docked (non-modal): follows the scroll inside its slot, full viewport height.
  position: sticky;
  top: 16px;
  z-index: 5;
  inset-inline: auto;
  margin: 0;
  width: 100%;
  height: calc(100dvh - 32px);
  max-height: calc(100dvh - 32px);
  padding: 0;
  overflow: hidden;

  &--folded {
    height: auto;
    overflow: visible;
  }

  // Drawer (modal): pinned to the left edge, next to its tab.
  &:modal {
    position: fixed;
    inset: 0 auto 0 0;
    width: min(360px, calc(100vw - 48px));
    max-width: none;
    height: 100dvh;
    max-height: none;
    border-radius: 0 var(--radius-panel) var(--radius-panel) 0;
  }

  &::backdrop {
    background: rgb(0 0 0 / 50%);
  }
}

.lp__inner {
  height: 100%;
  padding: 14px;
}

.lp__unfold {
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

.lp__unfold-label {
  writing-mode: vertical-rl;
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

// Docked: a full-height slot just right of the Party content, in the page margin.
@media (min-width: 1200px) {
  .lp-slot {
    position: absolute;
    top: 0;
    bottom: 0;
    left: calc(100% + 24px);
    width: 300px;

    &--folded {
      width: 44px;
    }
  }
}

// Below: the slot takes no room; only the edge tab shows.
@media not all and (min-width: 1200px) {
  .lp-slot {
    position: absolute;
    width: 0;
  }

  .lp:not(:modal) {
    display: none;
  }
}
</style>
