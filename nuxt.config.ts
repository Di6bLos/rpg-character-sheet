// https://nuxt.com/docs/api/configuration/nuxt-config
const fonts =
  'https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&family=Inter:wght@400;500;600;700&family=UnifrakturMaguntia&family=Cormorant+Garamond:wght@600;700&family=Crimson+Pro:wght@400;600&family=Cinzel+Decorative:wght@700&family=Alegreya+Sans:wght@400;500;700&family=IM+Fell+English&family=IM+Fell+English+SC&family=Spectral:wght@400;600&display=swap'

export default defineNuxtConfig({
  ssr: false,
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
