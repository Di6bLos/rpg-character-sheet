import { ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '~/lib/supabase'
import type { SiteSettings } from '~/types'

/** Site-wide switches admins control (shared NPC pool, AI generator). */
export const useSiteStore = defineStore('site', () => {
  const settings = ref<SiteSettings>({ npc_pool_enabled: true, ai_enabled: true })
  const loaded = ref(false)

  async function fetch(force = false) {
    if (loaded.value && !force) return
    const { data, error } = await supabase
      .from('site_settings')
      .select('npc_pool_enabled, ai_enabled')
      .maybeSingle()
    if (error) throw error
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
  }

  return { settings, loaded, fetch, set, reset }
})
