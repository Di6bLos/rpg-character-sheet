<script setup lang="ts">
import { watch } from 'vue'
import { useTheme } from 'vuetify'
import { VUETIFY_THEME_KEY } from '~/utils/theme'
import { useSnackbarStore } from '~/stores/snackbar'

const theme = useTheme()

// Restore saved theme preference on mount, then persist changes
const savedTheme = localStorage.getItem(VUETIFY_THEME_KEY) as 'dark' | 'light' | null
if (savedTheme) theme.global.name.value = savedTheme

watch(
    () => theme.global.name.value,
    (t) => localStorage.setItem(VUETIFY_THEME_KEY, t),
)

const snackbar = useSnackbarStore()
</script>

<template>
    <v-app>
        <NuxtPage />
        <v-snackbar v-model="snackbar.visible" :color="snackbar.color" :timeout="snackbar.timeout">
            {{ snackbar.message }}
        </v-snackbar>
    </v-app>
</template>
