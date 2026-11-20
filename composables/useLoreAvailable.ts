import type { ComputedRef } from 'vue'

/**
 * Whether the Lore Master is open to this user: AI is on site-wide and they have
 * saved a provider key, or the free agent (the site's Gemini key) is on. Fetches
 * both on mount; if either fails the Lore Master just stays hidden.
 */
export function useLoreAvailable(): ComputedRef<boolean> {
  const site = useSiteStore()
  const aiKeys = useAiKeysStore()

  onMounted(() => {
    site.fetch().catch(() => undefined)
    aiKeys.fetch().catch(() => undefined)
  })

  return computed(
    () =>
      site.settings.ai_enabled &&
      aiKeys.loaded &&
      (aiKeys.keys.length > 0 || site.settings.free_ai_enabled),
  )
}
