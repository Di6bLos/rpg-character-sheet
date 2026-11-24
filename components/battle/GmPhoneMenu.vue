<script setup lang="ts">
// The GM's ⋯ menu at the right end of the phone bar: the encounter tools the desktop
// keeps on its top bar and turn bar's ⋯ that the phone's one-row turn bar has no room
// for. Previous turn, Add the party, Sync summons, Reroll NPC initiative, the initiative
// rules (GmModes) and End encounter (its confirm, GmEndEncounter). The same handlers as
// the desktop's (useGmEncounterTools, useInitiative).
import type { useInitiative } from '~/composables/useInitiative'
import { plural } from '~/utils/format'

const props = defineProps<{
  init: ReturnType<typeof useInitiative>
  /** Tablet bar: a 320px menu under the ⋯ button, not the phone's full-width sheet. */
  tablet?: boolean
}>()

const { roster } = useCampaignBoard()

const open = ref(false)
const menuEl = ref<HTMLElement | null>(null)
const btn = ref<HTMLButtonElement | null>(null)
const menuId = useId()
const endOpen = ref(false)

const hasOrder = computed(() => props.init.order.value.length > 0)

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

const { busy, partyMissing, addParty, syncSummons, reroll, setMode } = useGmEncounterTools(
  props.init,
  roster,
  () => close(),
)

function prevTurn() {
  close()
  props.init.prevTurn()
}

function askEnd() {
  close()
  endOpen.value = true
}
</script>

<template>
  <div ref="menuEl" class="gpm" :class="{ 'gpm--tablet': tablet }" @keydown.esc="close(true)">
    <button
      ref="btn"
      type="button"
      class="gpm__btn"
      :aria-expanded="open"
      :aria-controls="menuId"
      aria-label="More encounter tools"
      title="More encounter tools"
      @click="open = !open"
    >
      <span aria-hidden="true">⋯</span>
    </button>
    <div v-if="open" :id="menuId" class="gpm__menu panel">
      <button type="button" class="gpm__item" :disabled="!init.turnId.value" @click="prevTurn">
        ◀ Previous turn
      </button>
      <button type="button" class="gpm__item" :disabled="busy || !partyMissing" @click="addParty">
        Add the party
        <small>{{
          partyMissing ? `${plural(partyMissing, 'hero')} not seated` : 'Everyone is seated'
        }}</small>
      </button>
      <button type="button" class="gpm__item" :disabled="busy || !hasOrder" @click="syncSummons">
        Sync summons
        <small>Seat the heroes' summons, drop dismissed ones</small>
      </button>
      <button type="button" class="gpm__item" :disabled="busy || !hasOrder" @click="reroll">
        Reroll NPC initiative
        <small>Every monster and NPC rolls again</small>
      </button>
      <BattleGmModes compact :mode="init.mode.value" :disabled="busy" @pick="setMode" />
      <button
        type="button"
        class="gpm__item gpm__item--danger"
        :disabled="!hasOrder"
        @click="askEnd"
      >
        End encounter
      </button>
    </div>
    <BattleGmEndEncounter v-model="endOpen" :init="init" />
  </div>
</template>

<style scoped lang="scss">
.gpm {
  flex: none;
}

// On a tablet the app nav stays, so the menu hangs from the ⋯ button instead.
.gpm--tablet {
  position: relative;

  .gpm__menu {
    left: auto;
    right: 0;
    top: calc(100% + 6px);
    width: 320px;
    max-height: min(560px, 70dvh);
  }
}

.gpm__btn {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: none;
  color: var(--page-text);

  span {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    box-sizing: border-box;
    border-radius: 50%;
    border: 1px solid var(--line-strong);
    background: var(--inset);
    font-size: 18px;
    line-height: 1;
  }

  &[aria-expanded='true'] span {
    background: var(--accent-tint);
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
}

// A sheet under the bar like the campaign menu's (PhoneBar), opaque in every theme.
.gpm__menu {
  position: absolute;
  left: 8px;
  right: 8px;
  top: calc(52px + env(safe-area-inset-top) + 6px);
  z-index: 50;
  max-height: calc(100dvh - 52px - env(safe-area-inset-top) - 16px);
  overflow-y: auto;
  overscroll-behavior: contain;
  box-sizing: border-box;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  white-space: normal;
  box-shadow: var(--shadow-pop);
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

.gpm__item {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  gap: 2px;
  min-height: 44px;
  padding: 6px 12px;
  border: 0;
  border-radius: min(var(--radius-control), 8px);
  background: transparent;
  color: var(--page-text);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  text-align: left;

  small {
    font-size: 12px;
    font-weight: 400;
    color: var(--page-muted);
  }

  &:disabled {
    opacity: 0.5;
  }
}

.gpm__item--danger {
  margin-top: 4px;
  border-top: 1px solid var(--line);
  border-radius: 0;
  color: var(--danger);
}
</style>
