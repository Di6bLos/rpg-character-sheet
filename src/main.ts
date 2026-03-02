import '@/styles/main.scss'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { vuetify } from '@/plugins/vuetify'
import { useAuthStore } from '@/stores/auth'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia) // Pinia FIRST — stores needed by router guards
const authStore = useAuthStore()
await authStore.init() // Await session before mounting (prevents guard flash)
app.use(router)
app.use(vuetify)
app.mount('#app')
