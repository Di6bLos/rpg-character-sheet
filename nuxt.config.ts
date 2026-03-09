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
            supabaseUrl: '',
            supabaseAnonKey: '',
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
