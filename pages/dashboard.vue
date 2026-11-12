<script setup lang="ts">
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '~/lib/supabase'
import type { BoardItem, Message, RosterEntry } from '~/types'
import { chatReadAt } from '~/composables/useCampaignChat'
import { threadsOf } from '~/utils/chat'
import { plural, sessionDate, timeAgo } from '~/utils/format'
import { authorLabel } from '~/utils/roster'
import { systemLabel } from '~/utils/systems'

definePageMeta({ middleware: 'auth' })
useHead({ title: 'Dashboard · Lantern' })

const auth = useAuthStore()
const campaigns = useCampaignStore()
const library = useLibraryStore()
const snackbar = useSnackbarStore()

type DashMessage = Message & { sender: { display_name: string } | null }

/** One row per campaign: its newest message and how many are unread. */
interface CampaignLatest {
  latest: DashMessage | null
  unread: number
}

/** Recent messages per campaign; enough to count what's unread since the last visit to the chat. */
const PER_CAMPAIGN = 50

const latest = ref<Record<string, CampaignLatest>>({})
const roster = ref<RosterEntry[]>([])
/** Rosters of campaigns with a message, to name senders by character. */
const rosters = ref<Record<string, RosterEntry[]>>({})
const latestBoard = ref<BoardItem | null>(null)
const latestBoardUrl = ref<string | null>(null)
let channel: RealtimeChannel | null = null

const current = computed(() => campaigns.current)
const campaignIds = computed(() => campaigns.campaigns.map((c) => c.id))

function campaignOf(id: string) {
  return campaigns.byId(id)
}

/** Campaigns with a message, newest first. */
const rows = computed(() =>
  campaigns.campaigns
    .map((c) => ({ campaign: c, ...(latest.value[c.id] ?? { latest: null, unread: 0 }) }))
    .filter((r) => r.latest)
    .sort((a, b) => b.latest!.created_at.localeCompare(a.latest!.created_at)),
)

const newCount = computed(() => rows.value.reduce((n, r) => n + r.unread, 0))

function boardLink(campaignId: string) {
  const c = campaignOf(campaignId)
  return `/campaigns/${campaignId}/${c?.myRole === 'gm' ? 'gm' : 'board'}/party`
}

function fromLabel(m: DashMessage) {
  const c = campaignOf(m.campaign_id)
  const gm = c && m.sender_id === c.created_by ? ' (GM)' : ''
  if (m.sender_id === auth.userId) return 'You' + gm
  const label = authorLabel(rosters.value[m.campaign_id] ?? [], m.sender_id, m.sender?.display_name)
  return label.primary + gm
}

/** Loads the rosters of campaigns in the list that aren't cached yet. */
async function loadRosters() {
  const missing = rows.value.map((r) => r.campaign.id).filter((id) => !rosters.value[id])
  const res = await Promise.allSettled(missing.map((id) => campaigns.roster(id)))
  // Only successes are cached, so a failed campaign is retried on the next refresh.
  missing.forEach((id, i) => {
    const row = res[i]
    if (row?.status === 'fulfilled') rosters.value[id] = row.value
  })
}

/** Counts messages from others newer than the board chat's read marker for their thread. */
function unreadIn(campaignId: string, list: DashMessage[]): number {
  const me = auth.userId ?? ''
  return list.filter(
    (m) =>
      m.sender_id !== me &&
      threadsOf(m, me).some((t) => m.created_at > chatReadAt(me, campaignId, t)),
  ).length
}

async function loadCampaign(campaignId: string) {
  const { data, error } = await supabase
    .from('messages')
    .select('*, sender:profiles!messages_sender_id_fkey(display_name)')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
    .limit(PER_CAMPAIGN)
  if (error) throw error
  const list = (data ?? []) as unknown as DashMessage[]
  latest.value = {
    ...latest.value,
    [campaignId]: { latest: list[0] ?? null, unread: unreadIn(campaignId, list) },
  }
}

async function loadMessages() {
  await Promise.all(campaignIds.value.map(loadCampaign))
  await loadRosters()
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
  rosters.value[c.id] = rosterRows
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
      // The global notifications store announces it; here that campaign's row refreshes.
      loadCampaign(row.campaign_id)
        .then(loadRosters)
        .catch(() => undefined)
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
})

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
      <NuxtLink
        v-if="current"
        :to="`/campaigns/${current.id}/${current.myRole === 'gm' ? 'gm' : 'board'}/party`"
        class="btn"
      >
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
        <ul v-if="rows.length" class="latest">
          <li v-for="r in rows" :key="r.campaign.id">
            <NuxtLink
              :to="boardLink(r.campaign.id)"
              class="latest__row"
              :class="{ 'is-unread': r.unread }"
            >
              <span
                class="latest__icon"
                role="img"
                :aria-label="r.unread ? plural(r.unread, 'unread message') : 'No unread messages'"
              >
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
                  <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
                </svg>
                <span v-if="r.unread" class="latest__count" aria-hidden="true">{{
                  r.unread > 9 ? '9+' : r.unread
                }}</span>
              </span>
              <span class="latest__body">
                <span class="latest__top">
                  <strong class="latest__campaign">{{ r.campaign.name }}</strong>
                  <span class="latest__time">{{ timeAgo(r.latest!.created_at) }}</span>
                </span>
                <span class="latest__text">
                  <svg
                    v-if="r.latest!.recipient_ids"
                    class="latest__lock"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    aria-label="Private"
                    role="img"
                  >
                    <rect x="5" y="11" width="14" height="9" rx="2" />
                    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                  </svg>
                  <b>{{ fromLabel(r.latest!) }}:</b> {{ r.latest!.body }}
                </span>
              </span>
            </NuxtLink>
          </li>
        </ul>
        <p v-else class="card-empty">
          {{
            current
              ? 'No messages yet. Say hello to your party on the campaign board.'
              : 'Messages from your campaigns show up here.'
          }}
        </p>
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
                :to="`/campaigns/${current.id}/${current.myRole === 'gm' ? 'gm' : 'board'}/party`"
                class="btn btn--ghost"
                style="flex: 1 1 140px"
                >{{ current.myRole === 'gm' ? 'GM console' : 'Campaign board' }}</NuxtLink
              >
              <NuxtLink
                :to="`/campaigns/${current.id}/${current.myRole === 'gm' ? 'gm' : 'board'}/journal`"
                class="btn btn--ghost"
                style="flex: 1 1 140px"
                >Campaign journal</NuxtLink
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

.latest {
  list-style: none;
  margin: 0;
  padding: 0;

  li + li {
    border-top: 1px solid var(--track);
  }
}

.latest__row {
  display: flex;
  gap: 14px;
  align-items: center;
  padding: 14px 20px;
  min-height: 44px;
  color: inherit;
  text-decoration: none;

  &:hover,
  &:focus-visible {
    background: var(--track);
  }

  &.is-unread {
    .latest__icon {
      background: var(--accent);
      color: var(--on-accent);
    }

    .latest__campaign,
    .latest__text {
      color: var(--page-text);
    }

    .latest__text b {
      font-weight: 700;
    }
  }
}

.latest__icon {
  position: relative;
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--track);
  color: var(--page-muted);
}

.latest__count {
  position: absolute;
  top: -4px;
  right: -6px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--danger-bg);
  border: 1px solid var(--danger);
  color: var(--danger-text);
  font-size: 11px;
  font-weight: 700;
  line-height: 16px;
  text-align: center;
}

.latest__body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}

.latest__top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.latest__campaign {
  font-size: 15px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.latest__time {
  flex: none;
  font-size: 12px;
  color: var(--page-muted);
}

.latest__text {
  font-size: 14px;
  line-height: 1.45;
  color: var(--page-soft);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;

  b {
    font-weight: 600;
  }
}

.latest__lock {
  vertical-align: -1px;
  margin-right: 2px;
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
