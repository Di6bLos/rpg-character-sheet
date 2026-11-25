<script setup lang="ts">
definePageMeta({ layout: 'auth', middleware: 'guest' })
useHead({ title: 'Sign in · Lantern' })

import { DEV_ACCOUNTS, DEV_PASSWORD, isLocalSupabase, type DevAccount } from '~/utils/devAccounts'

const auth = useAuthStore()
const route = useRoute()

// Local testing: one-click sign-in for the seeded accounts (npm run dev:local).
// Dev builds talking to the local Supabase stack only; never the hosted project.
const devAccounts =
  import.meta.dev && isLocalSupabase(useRuntimeConfig().public.supabaseUrl) ? DEV_ACCOUNTS : []

const email = ref('')
const password = ref('')
const showPassword = ref(false)
const busy = ref(false)
const error = ref('')

function devSignIn(account: DevAccount) {
  email.value = account.email
  password.value = DEV_PASSWORD
  void submit()
}

async function submit() {
  error.value = ''
  busy.value = true
  try {
    await auth.login(email.value.trim(), password.value)
    const next = typeof route.query.next === 'string' ? route.query.next : ''
    await navigateTo(next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard')
  } catch (err) {
    error.value =
      (err as { message?: string }).message === 'Invalid login credentials'
        ? 'That email and password don’t match an account.'
        : ((err as { message?: string }).message ?? 'Could not sign in. Try again.')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <form class="stack" novalidate @submit.prevent="submit">
    <h1 class="auth-title">Sign in</h1>
    <div v-if="error" class="notice notice--error" role="alert">{{ error }}</div>
    <div class="field">
      <label for="login-email">Email</label>
      <input
        id="login-email"
        v-model="email"
        class="input"
        type="email"
        autocomplete="email"
        required
      />
    </div>
    <div class="field">
      <div class="field__row">
        <label for="login-password">Password</label>
        <NuxtLink
          class="small"
          :to="{ path: '/forgot-password', query: email.trim() ? { email: email.trim() } : {} }"
        >
          Forgot password?
        </NuxtLink>
      </div>
      <div class="password">
        <input
          id="login-password"
          v-model="password"
          class="input"
          :type="showPassword ? 'text' : 'password'"
          autocomplete="current-password"
          required
        />
        <button
          type="button"
          class="btn btn--quiet btn--sm"
          :aria-pressed="showPassword"
          @click="showPassword = !showPassword"
        >
          {{ showPassword ? 'Hide' : 'Show' }}
        </button>
      </div>
    </div>
    <button class="btn btn--block" type="submit" :disabled="busy || !email || !password">
      {{ busy ? 'Signing in…' : 'Sign in' }}
    </button>
    <div v-if="devAccounts.length" class="dev-login">
      <p class="small muted">Local test accounts</p>
      <div class="dev-login__row">
        <button
          v-for="a in devAccounts"
          :key="a.key"
          type="button"
          class="btn btn--ghost btn--sm"
          :disabled="busy"
          @click="devSignIn(a)"
        >
          {{ a.label }}
        </button>
      </div>
    </div>
    <p class="small muted">
      New to Lantern?
      <NuxtLink :to="{ path: '/signup', query: route.query }">Create an account</NuxtLink>
    </p>
  </form>
</template>

<style scoped lang="scss">
.dev-login {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border: 1px dashed var(--line-strong);
  border-radius: 10px;
}

.dev-login__row {
  display: flex;
  gap: 8px;

  .btn {
    flex: 1;
  }
}

.auth-title {
  font-size: 28px;
}

.field__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.password {
  position: relative;

  .input {
    padding-right: 76px;
  }

  .btn {
    position: absolute;
    right: 4px;
    top: 4px;
  }
}
</style>
