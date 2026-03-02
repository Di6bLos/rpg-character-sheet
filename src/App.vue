<script setup lang="ts">
import { watch } from 'vue'
import { useTheme } from 'vuetify'
import { VUETIFY_THEME_KEY } from '@/plugins/vuetify'

const theme = useTheme()
watch(
  () => theme.global.name.value,
  (t) => localStorage.setItem(VUETIFY_THEME_KEY, t),
)
</script>

<template>
  <v-app>
    <router-view />
  </v-app>
</template>
