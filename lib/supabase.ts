import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Lazily initialise the Supabase client so that useRuntimeConfig() is only
// called after the Nuxt context has been set up (env vars mapped in nuxt.config.ts).
let _client: SupabaseClient | null = null

function getClient(): SupabaseClient {
  if (!_client) {
    const config = useRuntimeConfig()
    _client = createClient(config.public.supabaseUrl as string, config.public.supabaseAnonKey as string)
  }
  return _client
}

// Proxy so existing imports (`supabase.from(...)` etc.) continue to work unchanged.
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return getClient()[prop as keyof SupabaseClient]
  },
  has(_target, prop) {
    return prop in getClient()
  },
})
