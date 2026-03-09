<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '~/stores/auth'

// Task 014: Vue Router Setup — redirect authenticated users away from login
definePageMeta({ middleware: 'guest' })

const authStore = useAuthStore()
const router = useRouter()

const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

const emailRules = [
    (v: string) => !!v || 'Email is required',
    (v: string) => /.+@.+\..+/.test(v) || 'Invalid email format',
]
const passwordRules = [(v: string) => !!v || 'Password is required']

async function handleLogin() {
    error.value = ''
    loading.value = true
    try {
        await authStore.login(email.value, password.value)
        router.push({ name: 'dashboard' })
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Login failed'
    } finally {
        loading.value = false
    }
}
</script>

<template>
    <v-container class="fill-height" fluid>
        <v-row align="center" justify="center">
            <v-col cols="12" sm="8" md="4">
                <v-card>
                    <v-card-title class="text-h5 text-center pt-6">
                        RPG Character Sheet
                    </v-card-title>
                    <v-card-subtitle class="text-center pb-2">
                        Sign in to your account
                    </v-card-subtitle>
                    <v-card-text>
                        <v-alert v-if="error" type="error" class="mb-4" density="compact" closable>
                            {{ error }}
                        </v-alert>
                        <v-form @submit.prevent="handleLogin">
                            <v-text-field
                                v-model="email"
                                label="Email"
                                type="email"
                                :rules="emailRules"
                                class="mb-2"
                                autocomplete="email"
                                required
                            />
                            <v-text-field
                                v-model="password"
                                label="Password"
                                type="password"
                                :rules="passwordRules"
                                class="mb-4"
                                autocomplete="current-password"
                                required
                            />
                            <v-btn type="submit" color="primary" block :loading="loading">
                                Sign In
                            </v-btn>
                        </v-form>
                    </v-card-text>
                    <v-card-actions class="justify-center pb-4">
                        <span class="text-body-2">Don't have an account?</span>
                        <v-btn variant="text" :to="{ name: 'signup' }" size="small">Sign Up</v-btn>
                    </v-card-actions>
                </v-card>
            </v-col>
        </v-row>
    </v-container>
</template>
