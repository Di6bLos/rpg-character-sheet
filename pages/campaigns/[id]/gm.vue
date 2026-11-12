<script setup lang="ts">
// GM console: the board with GM controls always on, plus the NPCs tab (child routes).
definePageMeta({ middleware: 'auth' })

const board = provideCampaignBoard('console')
const chat = provideCampaignChat(board.campaignId)
const { campaign, isGm, loading, load, campaignId } = board

useHead({ title: () => `${campaign.value?.name ?? 'GM console'} · Lantern` })

onMounted(load)
watch(campaignId, load)
</script>

<template>
  <div v-if="loading" class="spinner" role="status" aria-label="Loading GM console" />
  <div v-else-if="!campaign || !isGm" class="page page--narrow">
    <div class="empty">
      <h1 style="font-size: 24px; margin-bottom: 8px">This console is for the Game Master</h1>
      <p style="margin-bottom: 16px">Only whoever runs the campaign can open it.</p>
      <NuxtLink to="/campaigns" class="btn">Go to campaigns</NuxtLink>
    </div>
  </div>
  <BoardShell v-else :unread="chat.totalUnread.value">
    <NuxtPage />
  </BoardShell>
</template>
