import type { InjectionKey } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '~/lib/supabase'
import type { Message } from '~/types'
import { threadsOf, type ThreadId } from '~/utils/chat'

export type { ThreadId }

function readKey(campaignId: string, thread: ThreadId) {
  return `lantern:chat-read:${campaignId}:${thread}`
}

function readAt(campaignId: string, thread: ThreadId): string {
  try {
    return localStorage.getItem(readKey(campaignId, thread)) ?? ''
  } catch {
    return ''
  }
}

/** Party chat and private threads for one campaign, live, with unread counts per thread. */
export function useCampaignChat(campaignId: Ref<string>) {
  const auth = useAuthStore()
  const snackbar = useSnackbarStore()
  const messages = ref<Message[]>([])
  const thread = ref<ThreadId>('party')
  const lastRead = ref<Record<ThreadId, string>>({})
  const sending = ref(false)
  let channel: RealtimeChannel | null = null

  const me = computed(() => auth.userId ?? '')

  async function load() {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('campaign_id', campaignId.value)
      .order('created_at', { ascending: false })
      .limit(300)
    if (error) return snackbar.error(error, 'Could not load messages')
    messages.value = (data ?? []) as Message[]
  }

  function subscribe() {
    if (channel) void supabase.removeChannel(channel)
    channel = supabase
      .channel(`chat-${campaignId.value}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `campaign_id=eq.${campaignId.value}`,
        },
        (payload) => {
          const row = payload.new as Message
          if (!messages.value.some((m) => m.id === row.id)) messages.value.unshift(row)
          if (threadsOf(row, me.value).includes(thread.value)) markRead(thread.value)
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'messages',
          filter: `campaign_id=eq.${campaignId.value}`,
        },
        (payload) => {
          const id = (payload.old as { id?: string }).id
          messages.value = messages.value.filter((m) => m.id !== id)
        },
      )
      .subscribe()
  }

  /** Newest first, like the design's column-reverse log. */
  const inThread = computed(() =>
    messages.value.filter((m) => threadsOf(m, me.value).includes(thread.value)),
  )

  function unread(t: ThreadId): number {
    const since = lastRead.value[t] ?? readAt(campaignId.value, t)
    return messages.value.filter(
      (m) => m.sender_id !== me.value && threadsOf(m, me.value).includes(t) && m.created_at > since,
    ).length
  }

  const totalUnread = computed(() => {
    const ids = new Set<ThreadId>()
    for (const m of messages.value) for (const t of threadsOf(m, me.value)) ids.add(t)
    return [...ids].reduce((n, t) => n + unread(t), 0)
  })

  function markRead(t: ThreadId) {
    const newest = messages.value.find((m) => threadsOf(m, me.value).includes(t))?.created_at
    const stamp = newest && newest > new Date().toISOString() ? newest : new Date().toISOString()
    lastRead.value = { ...lastRead.value, [t]: stamp }
    try {
      localStorage.setItem(readKey(campaignId.value, t), stamp)
    } catch {
      // Private window: unread counts just reset next visit.
    }
  }

  function open(t: ThreadId) {
    thread.value = t
    markRead(t)
  }

  async function send(body: string): Promise<boolean> {
    const text = body.trim()
    if (!text) return false
    sending.value = true
    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          campaign_id: campaignId.value,
          body: text,
          recipient_ids: thread.value === 'party' ? null : [thread.value],
        })
        .select()
        .single()
      if (error) throw error
      const row = data as Message
      if (!messages.value.some((m) => m.id === row.id)) messages.value.unshift(row)
      markRead(thread.value)
      return true
    } catch (err) {
      snackbar.error(err, 'Could not send the message')
      return false
    } finally {
      sending.value = false
    }
  }

  async function init() {
    await load()
    subscribe()
    markRead(thread.value)
  }

  onMounted(init)
  watch(campaignId, init)
  onBeforeUnmount(() => {
    if (channel) void supabase.removeChannel(channel)
  })

  return { messages, thread, inThread, sending, unread, totalUnread, open, send, markRead }
}

export type CampaignChat = ReturnType<typeof useCampaignChat>
const CHAT_KEY: InjectionKey<CampaignChat> = Symbol('campaign-chat')

/** The board parent page owns the chat so the Party tab badge stays live on every tab. */
export function provideCampaignChat(campaignId: Ref<string>): CampaignChat {
  const chat = useCampaignChat(campaignId)
  provide(CHAT_KEY, chat)
  return chat
}

export function useBoardChat(): CampaignChat {
  const chat = inject(CHAT_KEY)
  if (!chat) throw new Error('useBoardChat() must be used inside a campaign board page')
  return chat
}
