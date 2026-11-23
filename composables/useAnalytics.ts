import { supabase } from '~/lib/supabase'
import type { AnalyticsEvent } from '~/utils/analytics'

const BATCH = 50
const MAX_QUEUE = 500

// One queue per tab; `plugins/analytics.client.ts` decides what goes in and when it flushes.
const queue: AnalyticsEvent[] = []
let sending = false
let session = ''

function sessionId(): string {
  if (session) return session
  try {
    session = sessionStorage.getItem('lantern-analytics-session') ?? ''
    if (!session) {
      session = crypto.randomUUID()
      sessionStorage.setItem('lantern-analytics-session', session)
    }
  } catch {
    session ||= crypto.randomUUID()
  }
  return session
}

/** Queues usage events (page views, clicks, active time) and sends them in batches. */
export function useAnalytics() {
  const auth = useAuthStore()
  const site = useSiteStore()

  function enabled() {
    return import.meta.client && !!auth.userId && site.settings.analytics_enabled
  }

  function track(event: AnalyticsEvent) {
    if (!enabled()) return
    queue.push({ ...event, session: sessionId() })
    // A stuck connection must not grow the queue forever; the oldest events go first.
    if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE)
    if (queue.length >= BATCH) void flush()
  }

  /** Sends what is queued. Failures drop the batch quietly: analytics never bother the player. */
  async function flush() {
    if (sending || queue.length === 0) return
    if (!enabled()) {
      queue.length = 0
      return
    }
    sending = true
    try {
      while (queue.length > 0) {
        const batch = queue.splice(0, BATCH)
        const { error } = await supabase.rpc('track_events', { p_events: batch })
        if (error) break
      }
    } catch {
      // Offline or signed out mid-flight: drop it.
    } finally {
      sending = false
    }
  }

  /**
   * Last-chance send while the page unloads (reload, tab close): a `keepalive` fetch
   * outlives the page, where the supabase-js call would be cut off.
   */
  function flushOnUnload() {
    const token = auth.session?.access_token
    if (queue.length === 0 || !token || !enabled()) return
    const config = useRuntimeConfig().public
    const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || config.supabaseUrl
    const key =
      (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || config.supabaseAnonKey
    if (!url || !key) return
    const batch = queue.splice(0, BATCH)
    void fetch(`${url}/rest/v1/rpc/track_events`, {
      method: 'POST',
      keepalive: true,
      headers: {
        apikey: String(key),
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_events: batch }),
    }).catch(() => undefined)
  }

  return { track, flush, flushOnUnload }
}
