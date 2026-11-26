<script setup lang="ts">
// The top bar's Undo, beside Open full sheet (players) or End encounter (GM). A player's
// takes back their last action tile or turn step (`useActionUndo`, Nimble heroes only);
// the GM's, their last turn change (`useGmUndo`). Greyed out with "Nothing to undo" when
// there is nothing; the tooltip names what it would take back. `icon` is the phone bar's
// round 44px button.
defineProps<{ icon?: boolean }>()

const { gmControls } = useCampaignBoard()
const player = useActionUndo()
const gm = useGmUndo()
const snackbar = useSnackbarStore()

/** Shown for the GM, and for players whose board has the hero editor (Nimble). */
const shown = computed(() => (gmControls.value ? !!gm : !!player))
const label = computed(() => (gmControls.value ? gm?.label.value : player?.label.value) ?? '')
const title = computed(() =>
  label.value
    ? gmControls.value
      ? `Undo ${label.value}: put the turn and round back`
      : `Undo ${label.value}: put your sheet back as it was (the dice stay rolled)`
    : 'Nothing to undo',
)

async function undo() {
  if (!label.value) return
  const name = label.value
  if (gmControls.value) {
    await gm?.undo()
    snackbar.show(`Undid ${name}`, 'info')
  } else player?.undo()
}
</script>

<template>
  <button
    v-if="shown"
    type="button"
    :class="icon ? 'undo-icon' : ['btn', 'btn--ghost', 'btn--sm']"
    data-track="Undo"
    :aria-label="label ? `Undo ${label}` : 'Undo (nothing to undo)'"
    :title="title"
    :disabled="!label"
    @click="undo"
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
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
    <span v-if="!icon">Undo</span>
  </button>
</template>

<style scoped lang="scss">
.btn svg {
  width: 14px;
  height: 14px;
  margin-right: 4px;
  vertical-align: -2px;
}

// The phone bar's round icon button, like its Open full sheet.
.undo-icon {
  all: unset;
  flex: none;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: var(--page-text);
  cursor: pointer;

  svg {
    width: 34px;
    height: 34px;
    padding: 8px;
    box-sizing: border-box;
    border-radius: 50%;
    border: 1px solid var(--line-strong);
    background: var(--inset);
  }

  &:disabled {
    cursor: default;
    opacity: 0.4;
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
}
</style>
