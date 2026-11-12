<script setup lang="ts">
// Campaign board: the frame for the Party, Journal and Maps & images tabs (child routes).
definePageMeta({ middleware: 'auth' })

const board = provideCampaignBoard('board')
const chat = provideCampaignChat(board.campaignId)
const { campaign, loading, load, campaignId } = board

useHead({ title: () => `${campaign.value?.name ?? 'Campaign board'} · Lantern` })

// The GM console shows everything the board does (and more), so GMs go there.
const route = useRoute()
async function enter() {
  await load()
  if (campaign.value?.myRole === 'gm') {
    await navigateTo(
      { path: route.path.replace(/\/board(\/|$)/, '/gm$1'), query: route.query, hash: route.hash },
      { replace: true },
    )
  }
}

onMounted(enter)
watch(campaignId, enter)
</script>

<template>
  <div v-if="loading" class="spinner" role="status" aria-label="Loading campaign board" />
  <div v-else-if="!campaign" class="page page--narrow">
    <div class="empty">
      <h1 style="font-size: 24px; margin-bottom: 8px">You’re not in this campaign</h1>
      <p style="margin-bottom: 16px">
        Boards and journals are only visible to a campaign’s members.
      </p>
      <NuxtLink to="/campaigns" class="btn">Go to campaigns</NuxtLink>
    </div>
  </div>
  <BoardShell v-else :unread="chat.totalUnread.value">
    <NuxtPage />
  </BoardShell>
</template>
