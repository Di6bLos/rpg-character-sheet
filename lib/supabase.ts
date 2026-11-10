import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

function getClient(): SupabaseClient {
  if (!_client) {
    // Vite exposes VITE_ variables from .env.local; hosted builds get the values
    // through runtimeConfig (see nuxt.config.ts).
    const config = useRuntimeConfig().public
    const supabaseUrl =
      (import.meta.env.VITE_SUPABASE_URL as string | undefined) || config.supabaseUrl
    const supabaseAnonKey =
      (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || config.supabaseAnonKey
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase URL and anon key are not configured (see README: Getting started)')
    }
    _client = createClient(supabaseUrl, supabaseAnonKey)
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
