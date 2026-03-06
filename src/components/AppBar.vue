<script setup lang="ts">
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useTheme } from 'vuetify'
import { useAuthStore } from '@/stores/auth'
import { useSnackbarStore } from '@/stores/snackbar'

const authStore = useAuthStore()
const snackbar = useSnackbarStore()
const router = useRouter()
const route = useRoute()
const theme = useTheme()

const isDark = computed(() => theme.global.name.value === 'dark')

const initial = computed(() => {
  const name = authStore.profile?.display_name
  return name ? (name[0]?.toUpperCase() ?? '?') : '?'
})

const routeTitle = computed(() => {
  const titles: Record<string, string> = {
    dashboard: 'Dashboard',
    documents: 'Document Library',
    'character-new': 'New Character',
    'character-view': 'Character',
    'character-edit': 'Edit Character',
  }
  return titles[route.name as string] ?? 'RPG Sheet'
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
    <v-app-bar-title>{{ routeTitle }}</v-app-bar-title>
    <v-spacer />
    <v-btn icon aria-label="Toggle theme" @click="toggleTheme">
      <v-icon>{{ isDark ? 'mdi-weather-sunny' : 'mdi-weather-night' }}</v-icon>
    </v-btn>
    <v-menu>
      <template #activator="{ props }">
        <v-avatar
          v-bind="props"
          color="primary"
          size="36"
          class="mx-2"
          style="cursor: pointer"
          role="button"
          aria-label="User menu"
        >
          <span class="text-body-2 font-weight-bold">{{ initial }}</span>
        </v-avatar>
      </template>
      <v-list density="compact" min-width="160">
        <v-list-item prepend-icon="mdi-view-dashboard" title="Dashboard" :to="{ name: 'dashboard' }" />
        <v-list-item prepend-icon="mdi-bookshelf" title="Library" :to="{ name: 'documents' }" />
        <v-divider />
        <v-list-item prepend-icon="mdi-logout" title="Log out" @click="handleLogout" />
      </v-list>
    </v-menu>
  </v-app-bar>
</template>
