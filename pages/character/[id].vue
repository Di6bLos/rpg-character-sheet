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
const loading = ref(true)
const failed = ref(false)

async function load() {
  loading.value = true
  failed.value = false
  try {
    const id = String(route.params.id)
    const [found, seat] = await Promise.all([
      store.fetchOne(id),
      supabase.from('campaign_members').select('campaigns(name)').eq('character_id', id).limit(1),
    ])
    character.value = found
    const campaign = (seat.data?.[0] as { campaigns: { name: string } | null } | undefined)
      ?.campaigns
    campaignName.value = campaign?.name ?? 'Not in a campaign'
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
    @deleted="navigateTo('/characters')"
  />
</template>
