<script setup lang="ts">
import { supabase } from '~/lib/supabase'
import type { Campaign } from '~/types'
import { plural, shortDate } from '~/utils/format'
import { systemLabel } from '~/utils/systems'

definePageMeta({ layout: 'admin', middleware: 'staff' })
useHead({ title: 'Campaigns · Lantern admin' })

type Row = Campaign & {
  campaign_members: { role: string; profiles: { display_name: string; handle: string } | null }[]
}

const auth = useAuthStore()
const snackbar = useSnackbarStore()
const campaignStore = useCampaignStore()
const rows = ref<Row[]>([])
const loading = ref(true)
const target = ref<Row | null>(null)
const open = computed({
  get: () => target.value !== null,
  set: (v) => {
    if (!v) target.value = null
  },
})

async function load() {
  const { data, error } = await supabase
    .from('campaigns')
    .select('*, campaign_members(role, profiles(display_name, handle))')
    .order('created_at', { ascending: false })
  loading.value = false
  if (error) return snackbar.error(error, 'Could not load campaigns')
  rows.value = (data ?? []) as unknown as Row[]
}
onMounted(load)

function gm(row: Row) {
  const member = row.campaign_members.find((m) => m.role === 'gm')
  return member?.profiles ? `${member.profiles.display_name} (@${member.profiles.handle})` : '—'
}

async function remove() {
  const row = target.value
  if (!row) return
  target.value = null
  try {
    await campaignStore.removeCampaign(row.id)
    rows.value = rows.value.filter((r) => r.id !== row.id)
    snackbar.show(`${row.name} was deleted`)
  } catch (err) {
    snackbar.error(err, 'Could not delete the campaign')
  }
}
</script>

<template>
  <div class="page" style="max-width: 1100px; gap: 24px">
    <header class="page-head">
      <div>
        <h1>Campaigns</h1>
        <p>Every table on the site. Boards, journals and messages stay private to their members.</p>
      </div>
    </header>
    <section class="panel panel--flush">
      <div v-if="loading" class="spinner" role="status" aria-label="Loading campaigns" />
      <div
        v-else
        class="table-wrap"
        tabindex="0"
        role="region"
        aria-label="Table, scroll sideways for more"
      >
        <table class="table" style="min-width: 680px; font-size: 14px">
          <thead>
            <tr>
              <th scope="col" style="padding-left: 20px">Campaign</th>
              <th scope="col">System</th>
              <th scope="col">Game Master</th>
              <th scope="col">Players</th>
              <th scope="col">Created</th>
              <th v-if="auth.isAdmin" scope="col" style="text-align: right; padding-right: 20px">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.id">
              <td style="padding-left: 20px">
                <strong>{{ r.name }}</strong>
              </td>
              <td>
                <span class="badge" :class="`badge--${r.system}`">{{ systemLabel(r.system) }}</span>
              </td>
              <td>{{ gm(r) }}</td>
              <td>
                {{ plural(r.campaign_members.filter((m) => m.role === 'player').length, 'player') }}
              </td>
              <td>{{ shortDate(r.created_at) }}</td>
              <td v-if="auth.isAdmin" style="text-align: right; padding-right: 20px">
                <button
                  type="button"
                  class="btn btn--quiet btn--sm"
                  :aria-label="`Delete ${r.name}`"
                  @click="target = r"
                >
                  Delete
                </button>
              </td>
            </tr>
            <tr v-if="!rows.length">
              <td colspan="6" class="muted" style="padding: 24px 20px">No campaigns yet.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <UiDialog v-model="open" :title="`Delete ${target?.name ?? 'campaign'}?`" alert width="460px">
      <p>
        Its board, journal, messages and initiative order are deleted for every member. This can’t
        be undone.
      </p>
      <template #actions>
        <button type="button" class="btn btn--ghost" @click="target = null">Keep campaign</button>
        <button type="button" class="btn btn--danger" @click="remove">Delete campaign</button>
      </template>
    </UiDialog>
  </div>
</template>
