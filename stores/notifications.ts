import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { Router } from 'vue-router'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '~/lib/supabase'
import type { JournalEntry, Message, RosterEntry } from '~/types'
import { authorLabel } from '~/utils/roster'

export interface Notice {
  id: number
  kind: 'journal' | 'party' | 'secret'
  title: string
  /** Who wrote it, e.g. "Brakka (Carlos) · The Sunken Crown". */
  subtitle: string
  body: string
  to: string
}

const MAX_SHOWN = 3
const NOTICE_MS = 9000

/**
 * New journal entries and messages from the player's campaigns, announced on every screen.
 * One realtime channel for the whole session; RLS already limits rows to what the player
 * may read (their campaigns, party or GM-only entries, secrets sent to them).
 */
export const useNotificationsStore = defineStore('notifications', () => {
  const notices = ref<Notice[]>([])
  let channel: RealtimeChannel | null = null
  let router: Router | null = null
  let nextId = 1
  const timers = new Map<number, ReturnType<typeof setTimeout>>()
  const rosters = new Map<string, Promise<RosterEntry[]>>()

  function dismiss(id: number) {
    notices.value = notices.value.filter((n) => n.id !== id)
    clearTimeout(timers.get(id))
    timers.delete(id)
  }

  /** Starts (or restarts) the countdown that closes a notice. */
  function resume(id: number) {
    clearTimeout(timers.get(id))
    timers.set(
      id,
      setTimeout(() => dismiss(id), NOTICE_MS),
    )
  }

  /** Holds a notice open while the pointer or keyboard focus is on it. */
  function pause(id: number) {
    clearTimeout(timers.get(id))
    timers.delete(id)
  }

  function push(notice: Omit<Notice, 'id'>) {
    const id = nextId++
    notices.value = [...notices.value, { ...notice, id }]
    while (notices.value.length > MAX_SHOWN) dismiss(notices.value[0]!.id)
    resume(id)
  }

  /** Rosters change rarely; cache one request per campaign for the session. */
  function rosterOf(campaignId: string) {
    let cached = rosters.get(campaignId)
    if (!cached) {
      cached = useCampaignStore()
        .roster(campaignId)
        .catch(() => {
          rosters.delete(campaignId)
          return []
        })
      rosters.set(campaignId, cached)
    }
    return cached
  }

  async function who(campaignId: string, userId: string) {
    const campaigns = useCampaignStore()
    if (!campaigns.byId(campaignId)) await campaigns.fetchMine(true).catch(() => undefined)
    const label = authorLabel(await rosterOf(campaignId), userId)
    const name = label.secondary ? `${label.primary} (${label.secondary})` : label.primary
    const campaign = campaigns.byId(campaignId)?.name
    return campaign ? `${name} · ${campaign}` : name
  }

  function currentPath() {
    return router?.currentRoute.value.path ?? ''
  }

  async function onJournal(row: JournalEntry) {
    const auth = useAuthStore()
    if (row.author_id === auth.userId || !auth.profile?.notify_journal) return
    const to = `/campaigns/${row.campaign_id}/board`
    // The board shows it as it arrives.
    if (currentPath() === to) return
    push({
      kind: 'journal',
      title: row.visibility === 'gm' ? 'Private journal entry' : 'New journal entry',
      subtitle: await who(row.campaign_id, row.author_id),
      body: row.title,
      to,
    })
  }

  async function onMessage(row: Message) {
    const auth = useAuthStore()
    if (row.sender_id === auth.userId) return
    const secret = Boolean(row.recipient_ids)
    if (secret ? !auth.profile?.notify_secret : !auth.profile?.notify_journal) return
    const to = '/dashboard'
    // The dashboard lists party messages as they arrive; a secret is still called out.
    if (!secret && currentPath() === to) return
    push({
      kind: secret ? 'secret' : 'party',
      title: secret ? 'Secret message' : 'Party message',
      subtitle: await who(row.campaign_id, row.sender_id),
      body: row.body,
      to,
    })
  }

  /** `appRouter` tells which screen is open, to skip notices that screen already shows. */
  function start(appRouter: Router) {
    if (channel) return
    router = appRouter
    channel = supabase
      .channel('user-notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'journal_entries' },
        (payload) => void onJournal(payload.new as JournalEntry),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => void onMessage(payload.new as Message),
      )
      .subscribe()
  }

  function stop() {
    if (channel) void supabase.removeChannel(channel)
    channel = null
    rosters.clear()
    for (const timer of timers.values()) clearTimeout(timer)
    timers.clear()
    notices.value = []
  }

  return { notices, dismiss, pause, resume, start, stop }
})
