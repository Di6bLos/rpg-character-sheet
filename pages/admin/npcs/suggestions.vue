<script setup lang="ts">
// Admin → NPC suggestions: stat blocks players sent for the shared pool. Staff
// approve them (as Homebrew or Official, optionally after editing) or send them
// back with a note the player sees in Settings.
import type { NpcSource, NpcSubmission, NpcSubmissionStatus, PoolNpc } from '~/types'
import { shortDate } from '~/utils/format'
import { systemLabel } from '~/utils/systems'

definePageMeta({ layout: 'admin', middleware: 'staff' })
useHead({ title: 'NPC suggestions · Lantern admin' })

const store = useNpcSubmissionStore()
const npcs = useNpcStore()
const snackbar = useSnackbarStore()

const TABS: { value: NpcSubmissionStatus; label: string }[] = [
  { value: 'pending', label: 'Waiting' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Not approved' },
]
const status = ref<NpcSubmissionStatus>('pending')
const list = ref<NpcSubmission[]>([])
const loading = ref(true)

async function load() {
  loading.value = true
  try {
    list.value = await store.fetchQueue(status.value)
  } catch (err) {
    snackbar.error(err, 'Could not load the suggestions')
  } finally {
    loading.value = false
  }
}
watch(status, load)
onMounted(() => {
  void load()
  void store.refreshPendingCount()
})

const who = (s: NpcSubmission) => (s.submitter ? `@${s.submitter.handle}` : 'a deleted account')

// --- Review dialog ------------------------------------------------------------------
const open = ref<NpcSubmission | null>(null)
const detailOpen = computed({
  get: () => open.value !== null,
  set: (v) => {
    if (!v) open.value = null
  },
})
const matches = ref<PoolNpc[]>([])
const rejecting = ref(false)
const rejectNote = ref('')
const busy = ref(false)

watch(open, async (s) => {
  matches.value = []
  rejecting.value = false
  rejectNote.value = ''
  if (!s) return
  // Same system, similar name: likely the same creature already in the pool.
  try {
    matches.value = await npcs.searchPool({ system: s.system, q: s.name }, 5)
  } catch {
    // Only a hint; the review works without it.
  }
})

function drop(id: string) {
  list.value = list.value.filter((s) => s.id !== id)
  open.value = null
}

async function approve(source: NpcSource) {
  const s = open.value
  if (!s) return
  busy.value = true
  try {
    await store.approve(s.id, source)
    snackbar.show(
      `${s.name} added to the pool as ${source === 'official' ? 'Official' : 'Homebrew'}`,
    )
    drop(s.id)
  } catch (err) {
    snackbar.error(err, 'Could not approve it')
  } finally {
    busy.value = false
  }
}

async function reject() {
  const s = open.value
  if (!s || !rejectNote.value.trim()) return
  busy.value = true
  try {
    await store.reject(s.id, rejectNote.value.trim())
    snackbar.show(`${s.name} sent back to ${who(s)}`)
    drop(s.id)
  } catch (err) {
    snackbar.error(err, 'Could not send it back')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="page" style="max-width: 1200px; gap: 24px">
    <header class="page-head">
      <div>
        <h1>NPC suggestions</h1>
        <p>Stat blocks players sent for the shared pool. Approved ones are credited to them.</p>
      </div>
      <NuxtLink to="/admin/npcs" class="btn btn--ghost">Back to NPCs</NuxtLink>
    </header>

    <section class="panel panel--flush" aria-labelledby="sugg-h">
      <div class="head">
        <h2 id="sugg-h" class="sr-only">Suggestions</h2>
        <div role="tablist" aria-label="Status" class="seg">
          <button
            v-for="t in TABS"
            :key="t.value"
            type="button"
            role="tab"
            :aria-selected="status === t.value"
            @click="status = t.value"
          >
            {{ t.label }}
            <span v-if="t.value === 'pending' && store.pendingCount" class="badge badge--accent">{{
              store.pendingCount
            }}</span>
          </button>
        </div>
      </div>

      <div v-if="loading" class="spinner" role="status" aria-label="Loading suggestions" />
      <div
        v-else
        class="table-wrap"
        tabindex="0"
        role="region"
        aria-label="Table, scroll sideways for more"
      >
        <table class="table" style="min-width: 720px; font-size: 14px">
          <thead>
            <tr>
              <th scope="col" style="padding-left: 20px">Name</th>
              <th scope="col">System</th>
              <th scope="col">From</th>
              <th scope="col">{{ status === 'pending' ? 'Sent' : 'Decided' }}</th>
              <th scope="col" style="text-align: right; padding-right: 20px">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in list" :key="s.id">
              <td style="padding-left: 20px">
                <div class="row" style="flex-wrap: nowrap">
                  <UiAvatar
                    :name="s.name"
                    :src="npcImageUrl(s.image_path)"
                    :square="s.kind === 'monster'"
                    :size="36"
                  />
                  <div class="stack" style="gap: 0; min-width: 0">
                    <strong>{{ s.name }}</strong>
                    <span class="small muted" style="font-size: 12px">
                      {{
                        [s.stat_block.creatureType, s.level ? `Level ${s.level}` : '']
                          .filter(Boolean)
                          .join(' · ')
                      }}
                    </span>
                  </div>
                </div>
              </td>
              <td>
                <span class="badge" :class="`badge--${s.system}`">{{ systemLabel(s.system) }}</span>
              </td>
              <td>{{ who(s) }}</td>
              <td>
                {{
                  shortDate(status === 'pending' ? s.created_at : (s.reviewed_at ?? s.updated_at))
                }}
              </td>
              <td style="padding-right: 20px; text-align: right">
                <button
                  type="button"
                  class="btn btn--ghost btn--sm"
                  :aria-label="`Review ${s.name}`"
                  @click="open = s"
                >
                  {{ status === 'pending' ? 'Review' : 'View' }}
                </button>
              </td>
            </tr>
            <tr v-if="!list.length">
              <td colspan="5" class="muted" style="padding: 24px 20px">
                {{ status === 'pending' ? 'Nothing waiting. All caught up.' : 'None yet.' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <UiDialog v-model="detailOpen" :title="open?.name ?? ''" width="720px">
      <div v-if="open" class="stack">
        <p class="small muted" style="margin: 0">
          From {{ who(open) }}, sent {{ shortDate(open.created_at) }}
        </p>
        <blockquote v-if="open.note" class="review__note">{{ open.note }}</blockquote>
        <NpcStatBlock
          :name="open.name"
          :system="open.system"
          :level="open.level"
          :block="open.stat_block"
          :image-path="open.image_path"
          source="homebrew"
        />
        <div v-if="matches.length" class="review__matches" role="note">
          <strong class="small">Already in the pool with a similar name</strong>
          <ul>
            <li v-for="m in matches" :key="m.id" class="small">
              <NuxtLink :to="{ path: '/admin/npcs/new', query: { edit: m.id } }" target="_blank">{{
                m.name
              }}</NuxtLink>
              <span class="muted">
                · {{ m.source === 'official' ? 'Official' : 'Homebrew'
                }}{{ m.level ? ` · Level ${m.level}` : '' }}</span
              >
            </li>
          </ul>
        </div>
        <p v-if="open.status === 'rejected' && open.review_note" class="small review__why">
          <strong>Sent back:</strong> {{ open.review_note }}
        </p>
        <form
          v-if="open.status === 'pending' && rejecting"
          class="field"
          style="margin: 0"
          @submit.prevent="reject"
        >
          <label for="reject-note">What should they change? (they’ll see this)</label>
          <textarea
            id="reject-note"
            v-model="rejectNote"
            class="input"
            rows="3"
            maxlength="1000"
            required
          />
        </form>
      </div>
      <template #actions>
        <template v-if="open?.status === 'pending'">
          <template v-if="rejecting">
            <button type="button" class="btn btn--ghost" @click="rejecting = false">Back</button>
            <button
              type="button"
              class="btn btn--danger"
              :disabled="busy || !rejectNote.trim()"
              @click="reject"
            >
              Send back
            </button>
          </template>
          <template v-else>
            <button type="button" class="btn btn--quiet" :disabled="busy" @click="rejecting = true">
              Don’t approve…
            </button>
            <NuxtLink
              :to="{ path: '/admin/npcs/new', query: { submission: open.id } }"
              class="btn btn--ghost"
              >Edit &amp; approve</NuxtLink
            >
            <button
              type="button"
              class="btn btn--ghost"
              :disabled="busy"
              @click="approve('official')"
            >
              Approve as Official
            </button>
            <button type="button" class="btn" :disabled="busy" @click="approve('homebrew')">
              Approve as Homebrew
            </button>
          </template>
        </template>
        <template v-else>
          <NuxtLink
            v-if="open?.pool_npc_id"
            :to="{ path: '/admin/npcs/new', query: { edit: open.pool_npc_id } }"
            class="btn btn--ghost"
            >Open pool entry</NuxtLink
          >
          <button type="button" class="btn" @click="open = null">Close</button>
        </template>
      </template>
    </UiDialog>
  </div>
</template>

<style scoped lang="scss">
.head {
  padding: 14px 20px;
  border-bottom: 1px solid var(--line);
}

.seg {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  border-radius: var(--radius-control);
  border: 1px solid var(--line);

  button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 38px;
    padding: 0 14px;
    border: 0;
    border-radius: min(var(--radius-control), 7px);
    background: transparent;
    color: var(--page-soft);
    font-size: 14px;
    font-weight: 600;

    &[aria-selected='true'] {
      background: var(--accent);
      color: var(--on-accent);
    }
  }
}

.review__note {
  margin: 0;
  padding: 10px 14px;
  border-left: 3px solid var(--accent);
  background: var(--inset);
  white-space: pre-line;
}

.review__matches {
  padding: 10px 14px;
  border-radius: min(var(--radius-control), 8px);
  background: var(--warn-bg);
  color: var(--warn-text);

  ul {
    margin: 4px 0 0;
    padding-left: 18px;
  }
}

.review__why {
  margin: 0;
}
</style>
