// Usage analytics for the playtest: which page people play on (sheet, party, battle…),
// how long they stay active there and which buttons they press. Shown to staff on
// /admin/analytics. Admins turn it off in Site features (`site_settings.analytics_enabled`).
// Named to sort after `auth.client.ts`, which restores the session first.
import {
  areaFor,
  labelFor,
  seatFor,
  surfaceFor,
  trackTarget,
  untracked,
  viewportFor,
} from '~/utils/analytics'
import type { AnalyticsEvent } from '~/utils/analytics'

const FLUSH_MS = 15_000
const TIME_MS = 30_000
/** Seconds without a pointer or key press after which time stops counting as active. */
const IDLE_S = 60

export default defineNuxtPlugin({
  name: 'usage-analytics',
  setup() {
    const router = useRouter()
    const { track, flush, flushOnUnload } = useAnalytics()

    let path = router.currentRoute.value.path
    let activeSeconds = 0
    let lastInput = Date.now()

    function base(at = path): Omit<AnalyticsEvent, 'kind'> {
      return { surface: surfaceFor(at), seat: seatFor(at), viewport: viewportFor(innerWidth) }
    }

    /** Sends the active seconds gathered on `path` so far. */
    function sendTime() {
      if (activeSeconds > 0 && !untracked(path)) {
        track({ ...base(), kind: 'time', value: activeSeconds })
      }
      activeSeconds = 0
    }

    let viewed = ''
    function view(to: string) {
      if (to === viewed) return
      viewed = to
      if (!untracked(to)) track({ ...base(to), kind: 'view' })
    }

    router.afterEach((to) => {
      if (to.path === viewed) return
      sendTime()
      path = to.path
      view(to.path)
      void flush()
    })
    // The first page, in case the initial navigation finished before this plugin ran.
    view(path)

    document.addEventListener(
      'click',
      (e) => {
        if (untracked(path)) return
        const el = trackTarget(e.target)
        if (!el) return
        const label = labelFor(el)
        if (!label) return
        track({ ...base(), kind: 'click', area: areaFor(el), label })
      },
      { capture: true, passive: true },
    )

    const touch = () => (lastInput = Date.now())
    for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const) {
      addEventListener(type, touch, { capture: true, passive: true })
    }

    setInterval(() => {
      if (document.visibilityState === 'visible' && Date.now() - lastInput < IDLE_S * 1000) {
        activeSeconds += 1
      }
    }, 1000)
    setInterval(sendTime, TIME_MS)
    setInterval(() => void flush(), FLUSH_MS)

    addEventListener('pagehide', () => {
      sendTime()
      flushOnUnload()
    })

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'hidden') return
      sendTime()
      void flush()
    })
  },
})
