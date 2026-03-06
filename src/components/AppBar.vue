<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useTheme } from 'vuetify'
import { useAuthStore } from '@/stores/auth'
import { useSnackbarStore } from '@/stores/snackbar'

const authStore = useAuthStore()
const snackbar = useSnackbarStore()
const router = useRouter()
const theme = useTheme()

const isDark = computed(() => theme.global.name.value === 'dark')

const initial = computed(() => {
  const name = authStore.profile?.display_name
  return name ? (name[0]?.toUpperCase() ?? '?') : '?'
})

function toggleTheme() {
  theme.change(isDark.value ? 'light' : 'dark')
}

async function handleLogout() {
  await authStore.logout()
  snackbar.show('Logged out')
  router.push({ name: 'login' })
}
</script>

<template>
  <v-app-bar>
    <v-app-bar-title>RPG Sheet</v-app-bar-title>
    <v-spacer />
    <v-btn icon @click="toggleTheme">
      <v-icon>{{ isDark ? 'mdi-weather-sunny' : 'mdi-weather-night' }}</v-icon>
    </v-btn>
    <v-avatar color="primary" size="36" class="mx-2">
      <span class="text-body-2 font-weight-bold">{{ initial }}</span>
    </v-avatar>
    <v-btn icon @click="handleLogout">
      <v-icon>mdi-logout</v-icon>
    </v-btn>
  </v-app-bar>
</template>
