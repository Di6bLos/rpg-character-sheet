// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
    ssr: false,
    compatibilityDate: '2024-11-01',
    devtools: { enabled: true },

    modules: [
        '@pinia/nuxt',
        'vuetify-nuxt-module',
    ],

    vuetify: {
        moduleOptions: {},
        vuetifyOptions: {
            theme: {
                defaultTheme: 'dark',
                themes: {
                    dark: {
                        dark: true,
                        colors: {
                            primary: '#7C3AED',
                            secondary: '#D97706',
                        },
                    },
                    light: {
                        dark: false,
                        colors: {
                            primary: '#7C3AED',
                            secondary: '#D97706',
                        },
                    },
                },
            },
        },
    },

    runtimeConfig: {
        public: {
            // Default to VITE_* env vars so existing .env.local files keep working.
            // Override with NUXT_PUBLIC_SUPABASE_URL / NUXT_PUBLIC_SUPABASE_ANON_KEY
            // for production deployments.
            supabaseUrl: process.env.VITE_SUPABASE_URL ?? '',
            supabaseAnonKey: process.env.VITE_SUPABASE_ANON_KEY ?? '',
        },
    },

    css: ['@mdi/font/css/materialdesignicons.css', '~/assets/styles/main.scss'],

    typescript: {
        strict: true,
    },

    imports: {
        dirs: ['stores', 'composables'],
    },
})
