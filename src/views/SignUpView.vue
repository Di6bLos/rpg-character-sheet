<script setup lang="ts">
import { ref } from 'vue'
import type { VForm } from 'vuetify/components'
import { useAuthStore } from '@/stores/auth'
import { useSnackbarStore } from '@/stores/snackbar'

const authStore = useAuthStore()
const snackbar = useSnackbarStore()
const form = ref<InstanceType<typeof VForm> | null>(null)

const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const displayName = ref('')
const error = ref('')
const loading = ref(false)

const emailRules = [
  (v: string) => !!v || 'Email is required',
  (v: string) => /.+@.+\..+/.test(v) || 'Invalid email format',
]
const passwordRules = [(v: string) => !!v || 'Password is required']
const confirmPasswordRules = [
  (v: string) => !!v || 'Please confirm your password',
  (v: string) => v === password.value || 'Passwords do not match',
]
const nameRules = [(v: string) => !!v || 'Display name is required']

async function handleSignUp() {
  error.value = ''
  loading.value = true
  try {
    await authStore.signUp(email.value, password.value, displayName.value)
    snackbar.show('Account created! Check your email to confirm, then sign in.')
    email.value = ''
    password.value = ''
    confirmPassword.value = ''
    displayName.value = ''
    await form.value?.resetValidation()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Sign up failed'
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
          <v-card-title class="text-h5 text-center pt-6">Create Account</v-card-title>
          <v-card-subtitle class="text-center pb-2">Join the adventure</v-card-subtitle>
          <v-card-text>
            <v-alert v-if="error" type="error" class="mb-4" density="compact" closable>
              {{ error }}
            </v-alert>
            <v-form ref="form" @submit.prevent="handleSignUp">
              <v-text-field
                v-model="displayName"
                label="Display Name"
                :rules="nameRules"
                class="mb-2"
                autocomplete="nickname"
                required
              />
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
                class="mb-2"
                autocomplete="new-password"
                required
              />
              <v-text-field
                v-model="confirmPassword"
                label="Confirm Password"
                type="password"
                :rules="confirmPasswordRules"
                class="mb-4"
                autocomplete="new-password"
                required
              />
              <v-btn type="submit" color="primary" block :loading="loading">Create Account</v-btn>
            </v-form>
          </v-card-text>
          <v-card-actions class="justify-center pb-4">
            <span class="text-body-2">Already have an account?</span>
            <v-btn variant="text" :to="{ name: 'login' }" size="small">Sign In</v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>
