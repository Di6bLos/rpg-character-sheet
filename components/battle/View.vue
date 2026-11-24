<script setup lang="ts">
// Battle tab: the battle board, for every game system. The initiative strip, the
// player's hero column and actions or the GM's stat block and encounter grid, and the
// party and chat on the right. On a phone the same parts go in the phone frame, one tab
// at a time (the GM's tabs: Encounter, Creature, Party, Chat). On a tablet (768–1279px)
// the tablet frame has the left and centre columns, with Party, Chat and Scribe in a
// drawer. Every frame sits inside one HeroScope, so switching frames (a rotation) keeps
// the hero's sheet editor and its automatic turn steps. Systems without the Nimble hero
// editor (5e, PF2e; `features.nimbleHero` false) give a seated player a read-only hero card
// (HeroBasic) and a basic turn line with Roll initiative (TurnBasic) above the roster.
import { downSummonKeys } from '~/utils/initiative'
import type { PhoneTab } from '~/utils/boardLayout'

const { campaign, campaignId, isGm, gmControls, roster } = useCampaignBoard()
const features = useBattleFeatures()
const { layout } = useBoardLayout()
const phone = computed(() => layout.value === 'phone')
const tablet = computed(() => layout.value === 'tablet')
/** The phone frame's open tab and tab switch (its exposed `tab` and `go`). */
const phoneFrame = ref<{ tab: PhoneTab; go: (tab: PhoneTab) => void } | null>(null)
const snackbar = useSnackbarStore()

const init = useInitiative(campaignId, isGm)
useRosterRefresh(init.activeId)

const downSummons = computed(() => downSummonKeys(init.rows.value))

const turnCharacterId = computed(
  () => init.order.value.find((c) => c.id === init.activeId.value)?.character_id ?? null,
)
const encounterRound = computed(() => (init.turnId.value ? init.round.value : null))
/** A seated player's hero in a system without the hero editor (5e, PF2e); else null. */
const basicHeroId = computed(() =>
  !gmControls.value && !features.value.nimbleHero ? (campaign.value?.myCharacterId ?? null) : null,
)
const basicEntry = computed(() =>
  basicHeroId.value ? roster.value.find((r) => r.character_id === basicHeroId.value) : undefined,
)

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
/**
 * Picks what the GM's left column shows, opening the column if it was closed. The phone
 * has no left column: the pick shows on the Creature tab, and from another tab a toast
 * names it with a button that opens Creature (the GM stays where they were).
 */
function gmShow(id: string) {
  gmPick.value = id
  if (phone.value) {
    const frame = phoneFrame.value
    if (frame && frame.tab !== 'creature') {
      snackbar.show(`Selected: ${rowOf(id)?.name ?? 'creature'}`, 'info', 5000, {
        label: 'Show',
        run: () => phoneFrame.value?.go('creature'),
      })
    }
    return
  }
  // The tablet's left column is always open (and the desktop's saved state stays as it is).
  if (!tablet.value && !left.state.value.column) left.setColumn(true)
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
  <!-- Keyed by `enabled`: HeroScope reads it once, at setup. -->
  <BattleHeroScope
    :key="features.nimbleHero ? 'hero' : 'basic'"
    v-slot="{ hero }"
    :enabled="features.nimbleHero"
    :turn-character-id="actingCharacterId"
    :round="encounterRound"
    :down-summons="downSummons"
  >
    <BattlePhone v-if="phone" ref="phoneFrame" :init="init" :hero="hero">
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
        <!-- GM: the encounter cards and the selected creature's stat block (or hero). -->
        <BattleEncounter
          v-if="tab === 'encounter' && gmControls"
          compact
          :init="init"
          :roster="roster"
          :selected="gmSelected"
          :picked="gmPick"
          @update:selected="(id: string | null) => (id ? gmShow(id) : (gmPick = null))"
          @hero="onGridHero"
        />
        <template v-else-if="tab === 'creature' && gmControls">
          <BattleGmHero v-if="gmHeroId" :character-id="gmHeroId" :roster="roster" />
          <BattleStatBlock v-else :init="init" :combatant-id="gmSelected" />
        </template>
        <BattleActions v-else-if="tab === 'actions' && hero" compact sheet />
        <BattleHero v-else-if="tab === 'hero' && hero" compact />
        <BattleHeroBasic v-else-if="tab === 'hero' && basicEntry" compact :entry="basicEntry" />
        <template v-else-if="tab === 'party'">
          <!-- A watcher gets the same hint as on the tablet and desktop boards. -->
          <template v-if="!hero && !gmControls && !basicHeroId">
            <p v-if="isGm" class="panel battle-empty">
              <NuxtLink :to="`/campaigns/${campaignId}/gm`">Open the GM console</NuxtLink> to run
              the encounter.
            </p>
            <p v-else class="panel battle-empty">
              Seat a hero (Playing as, in the campaign menu) to play from the battle board.
            </p>
          </template>
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
        <BattleGmTurnBar v-if="gmControls" compact :init="init" :roster="roster" />
        <BattleTurnBasic v-else-if="basicHeroId" :init="init" :character-id="basicHeroId" />
        <BattleTurnBar v-else compact :init="init" />
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
    <!-- Tablet: hero column or stat block (left), turn bar and actions or the
         encounter (centre), Party / Chat / Scribe in the drawer. -->
    <BattleTablet v-else-if="tablet" :init="init" :hero="hero">
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
        <BattleHeroBasic v-else-if="basicEntry" :entry="basicEntry" />
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
      <template #turn>
        <BattleTurnBar v-if="hero" :init="init" />
        <BattleGmTurnBar v-else-if="gmControls" compact :init="init" :roster="roster" />
        <BattleTurnBasic v-else-if="basicHeroId" :init="init" :character-id="basicHeroId" />
      </template>
      <template #centre>
        <BattleActions v-if="hero" compact />
        <BattleEncounter
          v-else-if="gmControls"
          compact
          :init="init"
          :roster="roster"
          :selected="gmSelected"
          :picked="gmPick"
          @update:selected="(id: string | null) => (id ? gmShow(id) : (gmPick = null))"
          @hero="onGridHero"
        />
        <BoardRoster
          v-else-if="basicHeroId && campaign"
          :roster="roster"
          :system="campaign.system"
          :turn-character-id="turnCharacterId"
        />
        <p v-else-if="isGm" class="panel battle-empty">
          <NuxtLink :to="`/campaigns/${campaignId}/gm`">Open the GM console</NuxtLink> to run the
          encounter.
        </p>
        <p v-else class="panel battle-empty">
          Seat a hero (Playing as, in the campaign menu) to play from the battle board.
        </p>
        <BattleHeroCardDialog v-model:character-id="cardId" :roster="roster" :gm="gmControls">
          <template v-if="hero" #own-hp><BattleHeroHp /></template>
        </BattleHeroCardDialog>
      </template>
      <template #drawer="{ tab }">
        <BattlePartyCards
          v-if="tab === 'party'"
          compact
          :roster="roster"
          :gm="gmControls"
          :acting-character-id="turnCharacterId"
          @open="(id: string) => (cardId = id)"
        />
        <BattleComms
          v-else
          compact
          bare
          :only="tab === 'scribe' ? 'lore' : 'chat'"
          :roster="roster"
        />
      </template>
    </BattleTablet>
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
        <BattleHeroBasic v-else-if="basicEntry" :entry="basicEntry" />
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
        <template v-else-if="basicHeroId && campaign">
          <BattleTurnBasic :init="init" :character-id="basicHeroId" />
          <BoardRoster
            :roster="roster"
            :system="campaign.system"
            :turn-character-id="turnCharacterId"
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
</template>

<style scoped lang="scss">
.battle-empty {
  margin: 0;
  padding: 14px 16px;
  font-size: 13px;
  color: var(--page-muted);
}
</style>
