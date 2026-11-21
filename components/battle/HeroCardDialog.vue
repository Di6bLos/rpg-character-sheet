<script setup lang="ts">
// A hero's stats modal, opened from a party card (and, for players, a hero initiative
// token). Loads the public subset (campaign_hero_card, useHeroCard) and shows only
// what it returns. Side: HeroVitals (identity, HP with the GM's controls, Wounds,
// Armor / Speed / Init, conditions). Main: HeroCardStats. For the viewer's own hero
// the page passes the hero column's HP (`own-hp`). Footer: Whisper and Open full sheet.
import type { RosterEntry } from '~/types'

const props = defineProps<{
  roster: RosterEntry[]
  gm: boolean
}>()
const characterId = defineModel<string | null>('characterId', { required: true })
defineSlots<{ 'own-hp'?: () => unknown }>()

const auth = useAuthStore()
const { campaignId } = useCampaignBoard()
const chat = useBoardChat()
const commsTab = useCommsTab()
const right = useBattleRight()

const open = computed({
  get: () => characterId.value !== null,
  set: (on: boolean) => {
    if (!on) characterId.value = null
  },
})

const { card, loading, error, load, entry, title, live } = useHeroCard(
  characterId,
  toRef(props, 'roster'),
)
const own = computed(() => !!entry.value && entry.value.user_id === auth.userId)

// --- Footer ---------------------------------------------------------------------------
const canWhisper = computed(() => !!entry.value && entry.value.user_id !== auth.userId)

async function whisper() {
  const to = entry.value?.user_id
  if (!to) return
  chat.open(to)
  commsTab.value = 'chat'
  right.showChat()
  characterId.value = null
  // After the dialog closes (and hands focus back), put the cursor in the message box.
  await nextTick()
  await nextTick()
  document.getElementById('chat-in')?.focus()
}
</script>

<template>
  <UiDialog v-model="open" :title="title" width="820px">
    <p v-if="loading" class="hc__state" role="status">Loading stats…</p>
    <div v-else-if="error" class="notice notice--error hc__state" role="alert">
      <span>{{ error }}</span>
      <button
        type="button"
        class="btn btn--sm btn--ghost"
        @click="characterId && load(characterId)"
      >
        Try again
      </button>
    </div>
    <div v-else-if="card && live" class="hc">
      <BattleHeroVitals
        v-if="characterId"
        :character-id="characterId"
        :card="card"
        :live="live"
        :entry="entry"
        :gm="gm"
      >
        <template v-if="$slots['own-hp']" #own-hp><slot name="own-hp" /></template>
      </BattleHeroVitals>

      <BattleHeroCardStats :card="card" class="hc__main" />
    </div>

    <template #actions>
      <span class="hc__note">{{ gm ? 'GM view' : own ? 'Your hero' : 'Read only' }}</span>
      <button v-if="canWhisper" type="button" class="btn btn--ghost btn--sm" @click="whisper">
        Whisper
      </button>
      <NuxtLink
        v-if="characterId && (gm || own)"
        :to="`/character/${characterId}?campaign=${campaignId}`"
        class="btn btn--sm"
      >
        Open full sheet
      </NuxtLink>
    </template>
  </UiDialog>
</template>

<style scoped lang="scss">
.hc__state {
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--page-muted);
}

.hc {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}

.hc__note {
  margin-right: auto;
  align-self: center;
  font-size: 12px;
  color: var(--page-muted);
}

// The vitals sit in the modal's side column as a framed block.
.hc :deep(.hc__side) {
  padding: 14px;
  // Capped: a theme with pill-shaped controls would otherwise round this into a circle.
  border-radius: min(var(--radius-control), 14px);
  background: var(--inset);
  border: 1px solid var(--line);
}
</style>
