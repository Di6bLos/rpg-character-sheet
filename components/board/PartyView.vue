<script setup lang="ts">
// Party tab: shared initiative strip, roster and chat. In the console the GM
// also gets the add-combatants dialog and table management (invites, session, players).
// Side panels: the player's quick actions (left) and the Lore Master (right).
// Nimble campaigns at 1200px+ get the desktop battle board instead (no side panels).
import { downSummonKeys } from '~/utils/initiative'

const { mode, campaign, campaignId, isGm, gmControls, roster, reloadRoster } = useCampaignBoard()

const init = useInitiative(campaignId, isGm)
const wide = useWideBoard()

const downSummons = computed(() => downSummonKeys(init.rows.value))

const turnCharacterId = computed(
  () => init.order.value.find((c) => c.id === init.activeId.value)?.character_id ?? null,
)
const encounterRound = computed(() => (init.turnId.value ? init.round.value : null))
/** The hero whose stats modal is open (party cards and hero initiative tokens). */
const cardId = ref<string | null>(null)

const actingCharacterId = computed(
  () => init.order.value.find((c) => c.id === init.turnId.value)?.character_id ?? null,
)

// Roster HP and conditions change on the players' sheets; refresh with the turn,
// and every 30 seconds while the tab is visible so it stays current outside combat.
watch(init.activeId, () => void reloadRoster())
const ROSTER_REFRESH_MS = 30_000
let rosterTimer: ReturnType<typeof setInterval> | null = null
// A background refresh that fails just waits for the next one.
function refreshRoster() {
  if (document.visibilityState === 'visible') reloadRoster().catch(() => undefined)
}
onMounted(() => {
  rosterTimer = setInterval(refreshRoster, ROSTER_REFRESH_MS)
  document.addEventListener('visibilitychange', refreshRoster)
})
onBeforeUnmount(() => {
  if (rosterTimer) clearInterval(rosterTimer)
  document.removeEventListener('visibilitychange', refreshRoster)
})

// --- GM: add combatants (the Party tab's Initiative panel opens the dialog) -----------
const addOpen = ref(false)

// --- GM on the battle board: the creature in the stat block ----------------------------
/** The GM's pick (a card or token click); null follows the default. */
const gmPick = ref<string | null>(null)
const isCreature = (id: string | null) =>
  init.rows.value.some((c) => c.id === id && c.kind !== 'pc')
/** The pick, else the acting creature (not a hero), else the first enemy. */
const gmSelected = computed(() => {
  if (isCreature(gmPick.value)) return gmPick.value
  if (isCreature(init.turnId.value)) return init.turnId.value
  return init.order.value.find((c) => c.kind === 'monster' || c.kind === 'npc')?.id ?? null
})
function onToken(id: string) {
  if (gmControls.value && isCreature(id)) gmPick.value = id
}
</script>

<template>
  <!-- GM: stat block (left), turn bar and encounter grid (centre). -->
  <BattleBoard
    v-if="wide"
    :init="init"
    :turn-character-id="actingCharacterId"
    :round="encounterRound"
    :down-summons="downSummons"
  >
    <template #strip>
      <BattleInitiative
        :init="init"
        :roster="roster"
        :gm="gmControls"
        @hero="(id: string) => (cardId = id)"
        @select="onToken"
      />
    </template>
    <template #left="{ hero }">
      <BattleHero v-if="hero" />
      <BattleStatBlock v-else-if="gmControls" :init="init" :combatant-id="gmSelected" />
      <BoardRoster
        v-else-if="campaign"
        :roster="roster"
        :system="campaign.system"
        :turn-character-id="turnCharacterId"
      />
      <!-- Here so the viewer's own hero gets the hero column's HP (same sheet editor). -->
      <BattleHeroCardDialog v-model:character-id="cardId" :roster="roster" :gm="gmControls">
        <template v-if="hero" #own-hp><BattleHeroHp /></template>
      </BattleHeroCardDialog>
    </template>
    <template #centre="{ hero }">
      <template v-if="hero">
        <BattleTurnBar :init="init" />
        <BattleActions />
      </template>
      <template v-else-if="gmControls">
        <BattleGmTurnBar :init="init" :roster="roster" />
        <BattleEncounter
          :init="init"
          :roster="roster"
          :selected="gmSelected"
          @update:selected="(id: string | null) => (gmPick = id)"
          @hero="(id: string) => (cardId = id)"
        />
      </template>
      <p v-else-if="isGm" class="panel battle-empty">
        <NuxtLink :to="`/campaigns/${campaignId}/gm`">Open the GM console</NuxtLink> to run the
        encounter.
      </p>
      <p v-else class="panel battle-empty">
        Seat a hero (Playing as, in the campaign menu) to play from the battle board.
      </p>
    </template>
    <template #right>
      <BattlePartyCards
        :roster="roster"
        :gm="gmControls"
        :acting-character-id="turnCharacterId"
        @open="(id: string) => (cardId = id)"
      />
      <BattleComms :roster="roster" />
    </template>
  </BattleBoard>
  <div v-else class="party-layout">
    <!-- Below 1200px the side panels open from tabs stacked here (they teleport in). -->
    <div class="edge-tabs" />
    <BoardActionPanel
      v-if="mode === 'board'"
      :down-summons="downSummons"
      :turn-character-id="actingCharacterId"
      :round="encounterRound"
    />
    <BoardLorePanel />
    <div class="party">
      <BoardInitiative :init="init" :roster="roster" :gm="gmControls" @add="addOpen = true" />

      <div class="party__cols">
        <BoardRoster
          v-if="campaign"
          class="party__roster"
          :roster="roster"
          :system="campaign.system"
          :turn-character-id="turnCharacterId"
        />
        <BoardChat class="party__chat" :roster="roster" />
      </div>

      <BoardTableAdmin v-if="mode === 'console'" />
    </div>
  </div>
  <BoardAddCombatants v-if="!wide && gmControls" v-model="addOpen" :init="init" :roster="roster" />
</template>

<style scoped lang="scss">
.battle-empty {
  margin: 0;
  padding: 14px 16px;
  font-size: 13px;
  color: var(--page-muted);
}

// Anchor for the player's quick-action panel (board only), which docks in the
// page margin to the left of this content on wide screens.
.party-layout {
  position: relative;
}

.party {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.party__cols {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  align-items: flex-start;
}

.party__roster {
  flex: 999 1 560px;
}

.party__chat {
  flex: 1 1 380px;
  min-width: 0;
}
</style>
