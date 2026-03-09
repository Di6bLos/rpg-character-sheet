import { createClient } from '@supabase/supabase-js'

// TODO: migrate to useRuntimeConfig().public.supabaseUrl when env vars are renamed
// to NUXT_PUBLIC_SUPABASE_URL / NUXT_PUBLIC_SUPABASE_ANON_KEY.
// VITE_* vars continue to work in Nuxt because it uses Vite internally.
export const supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL as string,
    import.meta.env.VITE_SUPABASE_ANON_KEY as string,
)
