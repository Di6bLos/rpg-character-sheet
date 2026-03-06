<script setup lang="ts">
import { watch } from 'vue'
import { useTheme } from 'vuetify'
import { VUETIFY_THEME_KEY } from '@/plugins/vuetify'
import { useSnackbarStore } from '@/stores/snackbar'

const theme = useTheme()
watch(
  () => theme.global.name.value,
  (t) => localStorage.setItem(VUETIFY_THEME_KEY, t),
)

const snackbar = useSnackbarStore()
</script>

<template>
  <v-app>
    <router-view />
    <v-snackbar v-model="snackbar.visible" :color="snackbar.color" :timeout="snackbar.timeout">
      {{ snackbar.message }}
    </v-snackbar>
  </v-app>
</template>
