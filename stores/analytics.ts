import { ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '~/lib/supabase'
import type { PageSeat, Surface, Viewport } from '~/utils/analytics'

export interface SurfaceStat {
  surface: Surface
  visits: number
  users: number
  seconds: number
  clicks: number
}

export interface SplitStat {
  surface: Surface
  seat: PageSeat | null
  viewport: Viewport
  visits: number
  users: number
  seconds: number
}

export interface DailyStat {
  day: string
  surface: Surface
  visits: number
  users: number
  seconds: number
}

export interface ButtonStat {
  surface: Surface
  area: string
  label: string
  clicks: number
  users: number
}

export interface AnalyticsFilter {
  days: number
  includeStaff: boolean
  seat: PageSeat | null
}

/** Staff: usage totals read through the `staff_analytics_*` RPCs (rows are never read directly). */
export const useAnalyticsStore = defineStore('analytics', () => {
  const surfaces = ref<SurfaceStat[]>([])
  const splits = ref<SplitStat[]>([])
  const daily = ref<DailyStat[]>([])
  const buttons = ref<ButtonStat[]>([])
  const loading = ref(false)
  let pruned = false

  function range(days: number) {
    const to = new Date()
    const from = new Date(to)
    from.setUTCDate(from.getUTCDate() - days + 1)
    from.setUTCHours(0, 0, 0, 0)
    to.setUTCMinutes(to.getUTCMinutes() + 1)
    return { p_from: from.toISOString(), p_to: to.toISOString() }
  }

  async function call<T>(fn: string, args: Record<string, unknown>): Promise<T[]> {
    const { data, error } = await supabase.rpc(fn, args)
    if (error) throw error
    // bigint columns come back as numbers or strings depending on size; coerce once here.
    return ((data ?? []) as Record<string, unknown>[]).map((row) => {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(row)) {
        out[k] = typeof v === 'string' && /^\d+$/.test(v) && k !== 'day' ? Number(v) : v
      }
      return out as T
    })
  }

  /** Drops events older than 180 days, once per visit to the page. */
  async function prune() {
    if (pruned) return
    pruned = true
    await supabase.rpc('staff_analytics_prune')
  }

  async function load(f: AnalyticsFilter) {
    loading.value = true
    const r = range(f.days)
    const scope = { ...r, p_include_staff: f.includeStaff }
    try {
      const [s, sp, d] = await Promise.all([
        call<SurfaceStat>('staff_analytics_surfaces', { ...scope, p_seat: f.seat }),
        call<SplitStat>('staff_analytics_splits', scope),
        call<DailyStat>('staff_analytics_daily', { ...scope, p_seat: f.seat }),
      ])
      surfaces.value = s
      splits.value = sp
      daily.value = d
    } finally {
      loading.value = false
    }
  }

  async function loadButtons(f: AnalyticsFilter, surface: Surface | null) {
    buttons.value = await call<ButtonStat>('staff_analytics_buttons', {
      ...range(f.days),
      p_include_staff: f.includeStaff,
      p_seat: f.seat,
      p_surface: surface,
      p_limit: 50,
    })
  }

  /** Admin only: deletes every event (logged in moderation history). Returns how many. */
  async function reset(): Promise<number> {
    const { data, error } = await supabase.rpc('admin_reset_analytics')
    if (error) throw error
    surfaces.value = []
    splits.value = []
    daily.value = []
    buttons.value = []
    return Number(data ?? 0)
  }

  return { surfaces, splits, daily, buttons, loading, range, prune, load, loadButtons, reset }
})
