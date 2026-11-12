<script setup lang="ts">
import { supabase } from '~/lib/supabase'
import type { Character } from '~/types'
import type { AnySheet } from '~/types/sheets'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const auth = useAuthStore()
const store = useCharacterStore()

const character = ref<Character<AnySheet> | null>(null)
const campaignName = ref('Not in a campaign')
const campaignId = ref<string | null>(null)
const loading = ref(true)
const failed = ref(false)

async function load() {
  loading.value = true
  failed.value = false
  try {
    const id = String(route.params.id)
    // A character can sit in several campaigns; prefer the one the sheet was opened from.
    const from = typeof route.query.campaign === 'string' ? route.query.campaign : null
    let seatQuery = supabase
      .from('campaign_members')
      .select('campaign_id, campaigns(name)')
      .eq('character_id', id)
    if (from) seatQuery = seatQuery.eq('campaign_id', from)
    const [found, seat] = await Promise.all([store.fetchOne(id), seatQuery.limit(1)])
    character.value = found
    const row = seat.data?.[0] as
      | { campaign_id: string; campaigns: { name: string } | null }
      | undefined
    campaignName.value = row?.campaigns?.name ?? 'Not in a campaign'
    campaignId.value = row?.campaigns ? row.campaign_id : null
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}

onMounted(load)

const canEdit = computed(() => character.value?.user_id === auth.userId && !auth.isSuspended)
</script>

<template>
  <div v-if="loading" class="spinner" role="status" aria-label="Loading character" />
  <div v-else-if="!character" class="page page--narrow">
    <div class="empty">
      <h1 style="font-size: 24px; margin-bottom: 8px">
        {{ failed ? 'Could not load this character' : 'Character not found' }}
      </h1>
      <p style="margin-bottom: 16px">
        {{
          failed
            ? 'Check your connection and try again.'
            : 'It may have been deleted, or it belongs to someone else.'
        }}
      </p>
      <button v-if="failed" type="button" class="btn" @click="load">Try again</button>
      <NuxtLink v-else to="/characters" class="btn">All characters</NuxtLink>
    </div>
  </div>
  <SheetShell
    v-else
    :key="character.id"
    :character="character"
    :can-edit="canEdit"
    :campaign-name="campaignName"
    :campaign-id="campaignId"
    @deleted="navigateTo('/characters')"
  />
</template>
