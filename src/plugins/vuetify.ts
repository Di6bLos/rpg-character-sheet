import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'
import { createVuetify } from 'vuetify'

export const VUETIFY_THEME_KEY = 'rpg-theme-preference'

const defaultTheme = (localStorage.getItem(VUETIFY_THEME_KEY) ?? 'dark') as 'dark' | 'light'

export const vuetify = createVuetify({
  theme: {
    defaultTheme,
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
})
