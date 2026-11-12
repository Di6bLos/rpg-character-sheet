import { ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '~/lib/supabase'
import type { SiteSettings } from '~/types'

const STALE_MS = 60_000

/** Site-wide switches admins control (shared NPC pool, AI generator). */
export const useSiteStore = defineStore('site', () => {
  const settings = ref<SiteSettings>({
    npc_pool_campaign: true,
    npc_pool_library: true,
    npc_pool_publish: true,
    ai_enabled: true,
  })
  const loaded = ref(false)
  let fetchedAt = 0

  /** Reads the switches; a copy younger than a minute is reused unless `force`. */
  async function fetch(force = false) {
    if (loaded.value && !force && Date.now() - fetchedAt < STALE_MS) return
    fetchedAt = Date.now()
    const { data, error } = await supabase
      .from('site_settings')
      .select('npc_pool_campaign, npc_pool_library, npc_pool_publish, ai_enabled')
      .maybeSingle()
    if (error) {
      fetchedAt = 0
      throw error
    }
    if (data) settings.value = data as SiteSettings
    loaded.value = true
  }

  /** Admin only (enforced by `admin_set_site_setting`, which also logs the change). */
  async function set(key: keyof SiteSettings, value: boolean) {
    const { error } = await supabase.rpc('admin_set_site_setting', { p_key: key, p_value: value })
    if (error) throw error
    settings.value = { ...settings.value, [key]: value }
  }

  function reset() {
    loaded.value = false
    fetchedAt = 0
  }

  return { settings, loaded, fetch, set, reset }
})
