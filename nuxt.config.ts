// https://nuxt.com/docs/api/configuration/nuxt-config
const fonts =
  'https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&family=Inter:wght@400;500;600;700&family=UnifrakturMaguntia&family=Cormorant+Garamond:wght@600;700&family=Crimson+Pro:wght@400;600&family=Cinzel+Decorative:wght@700&family=Alegreya+Sans:wght@400;500;700&family=IM+Fell+English&family=IM+Fell+English+SC&family=Spectral:wght@400;600&display=swap'

// Public Supabase settings, resolved at build time. Local dev uses the VITE_ names
// from .env.local; on Vercel the Supabase integration provides SUPABASE_URL and
// SUPABASE_ANON_KEY. Only the URL and the anon key are ever read here.
const env = process.env
const supabaseUrl =
  env.VITE_SUPABASE_URL ||
  env.NUXT_PUBLIC_SUPABASE_URL ||
  env.SUPABASE_URL ||
  env.NEXT_PUBLIC_SUPABASE_URL ||
  ''
const supabaseAnonKey =
  env.VITE_SUPABASE_ANON_KEY ||
  env.NUXT_PUBLIC_SUPABASE_ANON_KEY ||
  env.SUPABASE_ANON_KEY ||
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  ''

export default defineNuxtConfig({
  ssr: false,

  runtimeConfig: {
    public: {
      supabaseUrl,
      supabaseAnonKey,
      // Where auth emails send people back to. Empty in dev = the current origin.
      // Override with NUXT_PUBLIC_SITE_URL (e.g. for preview deployments).
      siteUrl: process.env.NODE_ENV === 'production' ? 'https://lantern.antillia.studio' : '',
    },
  },

  compatibilityDate: '2024-11-01',
  devtools: { enabled: true },

  modules: ['@pinia/nuxt'],

  app: {
    head: {
      title: 'Lantern',
      htmlAttrs: { lang: 'en', 'data-theme': 'classic' },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Character sheets and campaign tools for your table.' },
        { name: 'theme-color', content: '#14110E' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', href: '/favicon.ico', sizes: '32x32' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        { rel: 'stylesheet', href: fonts },
      ],
    },
  },

  css: ['~/assets/styles/main.scss'],

  typescript: {
    strict: true,
  },

  imports: {
    dirs: ['stores', 'composables'],
  },
})
