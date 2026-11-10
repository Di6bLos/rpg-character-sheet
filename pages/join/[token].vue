<script setup lang="ts">
import { supabase } from '~/lib/supabase'
import type { GameSystem } from '~/types'
import { systemLabel } from '~/utils/systems'

definePageMeta({ middleware: 'auth' })
useHead({ title: 'Join a campaign · Lantern' })

const route = useRoute()
const store = useCampaignStore()
const snackbar = useSnackbarStore()

const token = String(route.params.token)
const preview = ref<{
  campaign_id: string
  name: string
  system: GameSystem
  gm_name: string
} | null>(null)
const loading = ref(true)
const joining = ref(false)

onMounted(async () => {
  const { data } = await supabase.rpc('invite_preview', { p_token: token })
  preview.value = (data as (typeof preview.value)[] | null)?.[0] ?? null
  loading.value = false
})

async function join() {
  joining.value = true
  try {
    const { data, error } = await supabase.rpc('join_by_token', { p_token: token })
    if (error) throw error
    await store.fetchMine(true)
    snackbar.show(`You joined ${preview.value?.name ?? 'the campaign'}`)
    await navigateTo(`/campaigns/${data as string}/board`)
  } catch (err) {
    snackbar.error(err, 'Could not join the campaign')
  } finally {
    joining.value = false
  }
}
</script>

<template>
  <div class="page page--narrow">
    <div v-if="loading" class="spinner" role="status" aria-label="Checking invite" />
    <div v-else-if="!preview" class="empty">
      <h1 style="font-size: 24px; margin-bottom: 8px">This invite link isn’t valid</h1>
      <p style="margin-bottom: 16px">
        It may have been revoked. Ask the Game Master for a new one.
      </p>
      <NuxtLink to="/campaigns" class="btn">Go to campaigns</NuxtLink>
    </div>
    <section v-else class="panel stack" style="align-items: flex-start">
      <span class="badge" :class="`badge--${preview.system}`">{{
        systemLabel(preview.system)
      }}</span>
      <h1 style="font-size: 32px">Join {{ preview.name }}?</h1>
      <p class="muted">
        Run by {{ preview.gm_name }}. You’ll see its board, journal and party messages.
      </p>
      <div class="row">
        <NuxtLink to="/campaigns" class="btn btn--ghost">Not now</NuxtLink>
        <button type="button" class="btn" :disabled="joining" @click="join">
          {{ joining ? 'Joining…' : 'Join campaign' }}
        </button>
      </div>
    </section>
  </div>
</template>
