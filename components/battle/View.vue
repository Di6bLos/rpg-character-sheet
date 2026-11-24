<script setup lang="ts">
// Battle tab: the battle board (Nimble). The initiative strip, the
// player's hero column and actions or the GM's stat block and encounter grid, and the
// party and chat on the right. On a phone the same parts go in the phone frame, one tab
// at a time (the GM keeps the desktop frame for now). Both frames sit inside one
// HeroScope, so switching frames (a rotation) keeps the hero's sheet editor and its
// automatic turn steps. Other systems get a note pointing to the Party tab.
import { downSummonKeys } from '~/utils/initiative'

const { campaign, campaignId, isGm, gmControls, roster, base } = useCampaignBoard()
const { layout } = useBoardLayout()
const phone = computed(() => layout.value === 'phone' && !gmControls.value)

const init = useInitiative(campaignId, isGm)
useRosterRefresh(init.activeId)

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

// --- GM: the left column ----------------------------------------------------------------
// A creature shows its stat block; a hero picked on the initiative strip or the
// encounter grid shows its vitals (GmHero). Party cards open the stats modal instead.
/** The GM's pick (a card or token click); null follows the default. */
const gmPick = ref<string | null>(null)
const left = useBattleLeft()
const rowOf = (id: string | null) => init.rows.value.find((c) => c.id === id)
const isCreature = (id: string | null) => {
  const row = rowOf(id)
  return !!row && row.kind !== 'pc'
}
/** A hero row with a seated character (only those have vitals to load). */
function seatedHero(id: string | null): string | null {
  const row = rowOf(id)
  if (row?.kind !== 'pc' || !row.character_id) return null
  return roster.value.some((r) => r.character_id === row.character_id) ? row.character_id : null
}
/** The pick, else the acting creature (not a hero), else the first enemy. */
const gmSelected = computed(() => {
  if (isCreature(gmPick.value) || seatedHero(gmPick.value)) return gmPick.value
  if (isCreature(init.turnId.value)) return init.turnId.value
  return init.order.value.find((c) => c.kind === 'monster' || c.kind === 'npc')?.id ?? null
})
const gmHeroId = computed(() => seatedHero(gmSelected.value))
/** Picks what the GM's left column shows, opening the column if it was closed. */
function gmShow(id: string) {
  gmPick.value = id
  if (!left.state.value.column) left.setColumn(true)
}
function onToken(id: string) {
  if (gmControls.value && (isCreature(id) || seatedHero(id))) gmShow(id)
}
/** A hero token: the GM gets the vitals on the left (onToken), players the stats modal. */
function onHeroToken(characterId: string) {
  if (!gmControls.value) cardId.value = characterId
}
/** An encounter-grid hero card picks that hero's row. */
function onGridHero(characterId: string) {
  const row = init.rows.value.find((c) => c.kind === 'pc' && c.character_id === characterId)
  if (row) gmShow(row.id)
}
</script>

<template>
  <BattleHeroScope
    v-if="campaign?.system === 'nimble'"
    v-slot="{ hero }"
    :turn-character-id="actingCharacterId"
    :round="encounterRound"
    :down-summons="downSummons"
  >
    <BattlePhone v-if="phone" :init="init" :hero="hero">
      <template #strip>
        <BattleInitiative
          compact
          :init="init"
          :roster="roster"
          :gm="gmControls"
          @hero="onHeroToken"
          @select="onToken"
        />
      </template>
      <template #tab="{ tab }">
        <BattleActions v-if="tab === 'actions' && hero" compact />
        <BattleHero v-else-if="tab === 'hero' && hero" />
        <template v-else-if="tab === 'party'">
          <BattlePartyCards
            compact
            :roster="roster"
            :gm="gmControls"
            :acting-character-id="turnCharacterId"
            @open="(id: string) => (cardId = id)"
          />
          <BattleEnemies :init="init" :gm="gmControls" />
        </template>
        <BattleComms
          v-else-if="tab === 'chat' || tab === 'scribe'"
          compact
          :only="tab === 'scribe' ? 'lore' : 'chat'"
          :roster="roster"
        />
      </template>
      <template #turn>
        <BattleTurnBar compact :init="init" />
      </template>
      <template #dialogs="{ go }">
        <BattleHeroCardDialog
          v-model:character-id="cardId"
          sheet
          :roster="roster"
          :gm="gmControls"
          @whisper="go('chat')"
        >
          <template v-if="hero" #own-hp><BattleHeroHp /></template>
        </BattleHeroCardDialog>
      </template>
    </BattlePhone>
    <!-- GM: stat block (left), turn bar and encounter grid (centre). -->
    <BattleBoard v-else :init="init" :hero="hero">
      <template #strip>
        <BattleInitiative
          :init="init"
          :roster="roster"
          :gm="gmControls"
          @hero="onHeroToken"
          @select="onToken"
        />
      </template>
      <template #left>
        <BattleHero v-if="hero" />
        <BattleGmHero
          v-else-if="gmControls && gmHeroId"
          :character-id="gmHeroId"
          :roster="roster"
        />
        <BattleStatBlock v-else-if="gmControls" :init="init" :combatant-id="gmSelected" />
        <BoardRoster
          v-else-if="campaign"
          :roster="roster"
          :system="campaign.system"
          :turn-character-id="turnCharacterId"
        />
      </template>
      <template #centre>
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
            :picked="gmPick"
            @update:selected="(id: string | null) => (id ? gmShow(id) : (gmPick = null))"
            @hero="onGridHero"
          />
        </template>
        <p v-else-if="isGm" class="panel battle-empty">
          <NuxtLink :to="`/campaigns/${campaignId}/gm`">Open the GM console</NuxtLink> to run the
          encounter.
        </p>
        <p v-else class="panel battle-empty">
          Seat a hero (Playing as, in the campaign menu) to play from the battle board.
        </p>
        <!-- In the centre (inside the hero's sheet editor, so the viewer's own hero gets the
             hero column's HP) and not the left column, which may be closed (hidden). -->
        <BattleHeroCardDialog v-model:character-id="cardId" :roster="roster" :gm="gmControls">
          <template v-if="hero" #own-hp><BattleHeroHp /></template>
        </BattleHeroCardDialog>
      </template>
      <template #right>
        <BattlePartyCards
          :roster="roster"
          :gm="gmControls"
          :acting-character-id="turnCharacterId"
          @open="(id: string) => (cardId = id)"
        />
        <BattleRightSplit :roster="roster" :gm="gmControls" />
        <BattleComms :roster="roster" />
      </template>
    </BattleBoard>
  </BattleHeroScope>
  <div v-else class="panel battle-narrow">
    <p>The battle board is for Nimble campaigns.</p>
    <NuxtLink :to="`${base}/party`" class="btn">Go to Party</NuxtLink>
  </div>
</template>

<style scoped lang="scss">
.battle-empty {
  margin: 0;
  padding: 14px 16px;
  font-size: 13px;
  color: var(--page-muted);
}

.battle-narrow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;

  p {
    margin: 0;
    color: var(--page-muted);
  }
}
</style>
