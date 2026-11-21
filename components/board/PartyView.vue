<script setup lang="ts">
// Party tab: shared initiative strip, roster and chat. In the console the GM
// also gets the add-combatants dialog and table management (invites, session, players).
// Side panels: the player's quick actions (left) and the Lore Master (right).
// The desktop battle board is its own tab (`components/battle/View.vue`).
import { downSummonKeys } from '~/utils/initiative'

const { mode, campaign, campaignId, isGm, gmControls, roster } = useCampaignBoard()

const init = useInitiative(campaignId, isGm)
useRosterRefresh(init.activeId)

const downSummons = computed(() => downSummonKeys(init.rows.value))

const turnCharacterId = computed(
  () => init.order.value.find((c) => c.id === init.activeId.value)?.character_id ?? null,
)
const encounterRound = computed(() => (init.turnId.value ? init.round.value : null))
const actingCharacterId = computed(
  () => init.order.value.find((c) => c.id === init.turnId.value)?.character_id ?? null,
)

// GM: the Initiative panel opens the add-combatants dialog.
const addOpen = ref(false)
</script>

<template>
  <div class="party-layout">
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
  <BoardAddCombatants v-if="gmControls" v-model="addOpen" :init="init" :roster="roster" />
</template>

<style scoped lang="scss">
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
