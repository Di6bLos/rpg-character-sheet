<script setup lang="ts">
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '~/lib/supabase'
import type { BoardItem, Message, RosterEntry } from '~/types'
import { plural, sessionDate, timeAgo } from '~/utils/format'
import { systemLabel } from '~/utils/systems'

definePageMeta({ middleware: 'auth' })
useHead({ title: 'Dashboard · Lantern' })

const auth = useAuthStore()
const campaigns = useCampaignStore()
const library = useLibraryStore()
const snackbar = useSnackbarStore()

type DashMessage = Message & { sender: { display_name: string } | null }

const messages = ref<DashMessage[]>([])
const roster = ref<RosterEntry[]>([])
const latestBoard = ref<BoardItem | null>(null)
const latestBoardUrl = ref<string | null>(null)
const draft = ref('')
const sending = ref(false)
let channel: RealtimeChannel | null = null

const current = computed(() => campaigns.current)
const campaignIds = computed(() => campaigns.campaigns.map((c) => c.id))
const canMessage = computed(() => auth.can('can_send_messages'))

function campaignOf(id: string) {
  return campaigns.byId(id)
}

const newCount = computed(
  () =>
    messages.value.filter((m) => {
      const c = campaignOf(m.campaign_id)
      return m.sender_id !== auth.userId && c && m.created_at > c.lastReadAt
    }).length,
)

function fromLabel(m: DashMessage) {
  const c = campaignOf(m.campaign_id)
  const name = m.sender_id === auth.userId ? 'You' : (m.sender?.display_name ?? 'Someone')
  const gm = c && m.sender_id === c.created_by ? ' (GM)' : ''
  return name + gm
}

function tagLabel(m: DashMessage) {
  const scope = m.recipient_ids
    ? m.sender_id === auth.userId
      ? 'Secret'
      : m.recipient_ids.length > 1
        ? 'Secret · you and others'
        : 'Secret · only you'
    : 'Party'
  return campaigns.campaigns.length > 1
    ? `${scope} · ${campaignOf(m.campaign_id)?.name ?? ''}`
    : scope
}

async function loadMessages() {
  if (!campaignIds.value.length) {
    messages.value = []
    return
  }
  const { data, error } = await supabase
    .from('messages')
    .select('*, sender:profiles!messages_sender_id_fkey(display_name)')
    .in('campaign_id', campaignIds.value)
    .order('created_at', { ascending: false })
    .limit(12)
  if (error) throw error
  messages.value = (data ?? []) as unknown as DashMessage[]
}

async function loadCurrent() {
  const c = current.value
  if (!c) return
  const [rosterRows, board] = await Promise.all([
    campaigns.roster(c.id),
    supabase
      .from('board_items')
      .select('*')
      .eq('campaign_id', c.id)
      .order('created_at', { ascending: false })
      .limit(1),
  ])
  roster.value = rosterRows
  latestBoard.value = ((board.data ?? [])[0] as BoardItem | undefined) ?? null
  latestBoardUrl.value = latestBoard.value
    ? await signedUrl('campaign-files', latestBoard.value.file_path)
    : null
}

function subscribe() {
  if (channel) void supabase.removeChannel(channel)
  if (!campaignIds.value.length) return
  channel = supabase
    .channel('dashboard-messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
      const row = payload.new as Message
      if (!campaignIds.value.includes(row.campaign_id)) return
      void loadMessages()
      if (row.sender_id !== auth.userId && row.recipient_ids && auth.profile?.notify_secret) {
        snackbar.show('You have a new secret message', 'info')
      }
    })
    .subscribe()
}

onMounted(async () => {
  try {
    await campaigns.fetchMine(true)
    await Promise.all([loadMessages(), loadCurrent(), library.fetchAll()])
    subscribe()
  } catch (err) {
    snackbar.error(err, 'Could not load your dashboard')
  }
})

onBeforeUnmount(() => {
  if (channel) void supabase.removeChannel(channel)
  // Leaving the dashboard counts as having read what was on it.
  for (const c of campaigns.campaigns) {
    if (messages.value.some((m) => m.campaign_id === c.id && m.created_at > c.lastReadAt)) {
      void campaigns.markRead(c.id)
    }
  }
})

async function send() {
  const body = draft.value.trim()
  const c = current.value
  if (!body || !c) return
  sending.value = true
  const { error } = await supabase.from('messages').insert({ campaign_id: c.id, body })
  sending.value = false
  if (error) return snackbar.error(error, 'Could not send the message')
  draft.value = ''
  await loadMessages()
}

const partyNames = computed(() =>
  roster.value.filter((r) => r.role === 'player').map((r) => r.character_name ?? r.display_name),
)
const libDocs = computed(() => library.documents.slice(0, 4))
</script>

<template>
  <div class="page">
    <header class="page-head">
      <div>
        <h1>Welcome back, {{ auth.profile?.display_name ?? 'adventurer' }}</h1>
        <p v-if="current?.next_session_at">
          Next session: <strong>{{ current.name }}</strong> ·
          {{ sessionDate(current.next_session_at) }}
        </p>
        <p v-else-if="current">
          Your table: <strong>{{ current.name }}</strong>
        </p>
        <p v-else>Create a character, then start or join a campaign.</p>
      </div>
      <NuxtLink v-if="current" :to="`/campaigns/${current.id}/board`" class="btn">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z" />
          <path d="M9 3v15M15 6v15" />
        </svg>
        Open campaign board
      </NuxtLink>
      <NuxtLink v-else to="/campaigns" class="btn">Find a campaign</NuxtLink>
    </header>

    <NuxtLink
      v-if="campaigns.invites.length"
      to="/campaigns"
      class="notice notice--ok invite-banner"
    >
      <strong>{{ plural(campaigns.invites.length, 'campaign invite') }} waiting</strong>
      {{ campaigns.invites[0]?.inviterName }} invited you to
      {{ campaigns.invites[0]?.campaign.name }}. Review it on the Campaigns page.
    </NuxtLink>

    <CharacterSlots heading-id="chars-h" />

    <div class="cols">
      <section class="panel panel--flush" aria-labelledby="msg-h">
        <div class="card-head">
          <h2 id="msg-h">Messages</h2>
          <span
            v-if="newCount"
            class="badge badge--accent"
            style="font-size: 12px; padding: 4px 10px"
            >{{ newCount }} new</span
          >
        </div>
        <article
          v-for="m in messages"
          :key="m.id"
          class="msg"
          :class="{ 'msg--secret': m.recipient_ids }"
        >
          <div class="msg__icon">
            <svg
              v-if="m.recipient_ids"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            <svg
              v-else
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <circle cx="9" cy="8" r="3" />
              <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
              <circle cx="17" cy="9" r="2.5" />
              <path d="M16 14.2c2.9.3 5 2.7 5 5.8" />
            </svg>
          </div>
          <div class="msg__body">
            <div class="row" style="gap: 8px">
              <strong>{{ fromLabel(m) }}</strong>
              <span class="msg__tag">{{ tagLabel(m) }}</span>
              <span class="small muted" style="font-size: 12px">{{ timeAgo(m.created_at) }}</span>
            </div>
            <p>{{ m.body }}</p>
          </div>
        </article>
        <p v-if="!messages.length" class="card-empty">
          {{
            current
              ? 'No messages yet. Say hello to your party.'
              : 'Messages from your campaigns show up here.'
          }}
        </p>
        <form v-if="current && canMessage" class="msg-form" @submit.prevent="send">
          <label for="dash-msg" class="sr-only">Message the party in {{ current.name }}</label>
          <input
            id="dash-msg"
            v-model="draft"
            class="input"
            maxlength="4000"
            :placeholder="`Message the party in ${current.name}…`"
          />
          <button type="submit" class="btn" :disabled="sending || !draft.trim()">Send</button>
        </form>
      </section>

      <section class="panel panel--flush" aria-labelledby="camp-h">
        <template v-if="current">
          <div
            class="cover"
            :style="latestBoardUrl ? { backgroundImage: `url('${latestBoardUrl}')` } : undefined"
          >
            <div v-if="latestBoard">Latest on the board: {{ latestBoard.title }}</div>
          </div>
          <div class="camp">
            <div>
              <div class="eyebrow" style="font-size: 11px; letter-spacing: 0.14em">
                Current campaign
              </div>
              <h2 id="camp-h" style="font-size: 22px; margin: 4px 0">{{ current.name }}</h2>
              <div class="small" style="color: var(--page-soft)">
                {{ systemLabel(current.system) }} ·
                {{ current.myRole === 'gm' ? 'You are the GM' : `GM ${current.gmName}` }} ·
                {{ plural(current.playerCount, 'player') }}
              </div>
            </div>
            <div v-if="partyNames.length" class="chips">
              <span v-for="n in partyNames" :key="n" class="party-chip">{{ n }}</span>
            </div>
            <div class="row" style="gap: 10px">
              <NuxtLink
                :to="`/campaigns/${current.id}/board`"
                class="btn btn--ghost"
                style="flex: 1 1 140px"
                >Campaign board</NuxtLink
              >
              <NuxtLink
                :to="`/campaigns/${current.id}/board#jr-h`"
                class="btn btn--ghost"
                style="flex: 1 1 140px"
                >Campaign journal</NuxtLink
              >
              <NuxtLink
                v-if="current.myRole === 'gm'"
                :to="`/campaigns/${current.id}/gm`"
                class="btn"
                style="flex: 1 1 100%"
                >GM console</NuxtLink
              >
            </div>
          </div>
        </template>
        <div v-else class="camp">
          <h2 id="camp-h" style="font-size: 22px">No campaign yet</h2>
          <p class="small muted">Run your own table or join a friend’s with an invite.</p>
          <NuxtLink to="/campaigns" class="btn btn--ghost">Go to campaigns</NuxtLink>
        </div>
      </section>

      <section class="panel panel--flush" aria-labelledby="lib-h">
        <div class="card-head">
          <h2 id="lib-h">Document library</h2>
          <span class="small muted" style="font-size: 12px">Shared with everyone</span>
        </div>
        <NuxtLink v-for="d in libDocs" :key="d.id" to="/library" class="doc">
          <span class="doc__ext">{{ d.ext.toUpperCase() }}</span>
          <span class="doc__text">
            <strong>{{ d.name }}</strong>
            <small>{{ systemLabel(d.system) }} · {{ d.category }}</small>
          </span>
        </NuxtLink>
        <p v-if="!libDocs.length" class="card-empty">Nothing in the library yet.</p>
        <div style="padding: 14px 20px">
          <NuxtLink to="/library" class="btn btn--ghost btn--block">Browse library</NuxtLink>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
.invite-banner {
  display: block;
  text-decoration: none;
}

.cols {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(340px, 100%), 1fr));
  gap: 24px;
  align-items: start;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 20px;
  border-bottom: 1px solid var(--line);

  h2 {
    font-size: 20px;
  }
}

.card-empty {
  padding: 20px;
  font-size: 14px;
  color: var(--page-muted);
}

.msg {
  display: flex;
  gap: 14px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--track);

  &--secret {
    background: var(--secret-bg);

    .msg__icon {
      background: var(--ok-bg);
      color: var(--secondary);
    }

    .msg__tag {
      color: var(--secondary);
    }
  }

  strong {
    font-size: 14px;
    font-weight: 600;
  }

  p {
    font-size: 14px;
    line-height: 1.55;
    color: var(--page-soft);
    text-wrap: pretty;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
}

.msg__icon {
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--track);
  color: var(--accent-text);
}

.msg__body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.msg__tag {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--page-muted);
}

.msg-form {
  display: flex;
  gap: 8px;
  padding: 14px 20px;
}

.cover {
  height: 150px;
  display: flex;
  align-items: flex-end;
  padding: 16px 20px;
  background:
    repeating-linear-gradient(0deg, transparent 0 23px, var(--track) 23px 24px),
    repeating-linear-gradient(90deg, var(--field) 0 23px, var(--track) 23px 24px);
  background-size: cover;
  background-position: center;

  div {
    font-size: 12px;
    color: #cdbfa6;
    background: #14110e;
    border: 1px solid #3a3127;
    padding: 6px 10px;
    border-radius: 6px;
    font-family: Inter, system-ui, sans-serif;
  }
}

.camp {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: stretch;
}

.party-chip {
  font-size: 13px;
  padding: 6px 10px;
  border-radius: 999px;
  background: var(--track);
  border: 1px solid var(--line);
}

.doc {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 56px;
  padding: 8px 20px;
  border-bottom: 1px solid var(--track);
  text-decoration: none;
  color: var(--page-text);

  &:hover {
    background: var(--accent-tint);
  }
}

.doc__ext {
  flex: none;
  font-size: 10px;
  font-weight: 800;
  padding: 4px 6px;
  border-radius: 4px;
  background: var(--warn-bg);
  color: var(--warn-text);
  font-family: Inter, system-ui, sans-serif;
}

.doc__text {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;

  strong {
    font-size: 14px;
    font-weight: 600;
  }

  small {
    font-size: 12px;
    color: var(--page-muted);
  }
}
</style>
