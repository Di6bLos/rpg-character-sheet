<script setup lang="ts">
definePageMeta({ layout: 'auth', middleware: 'guest' })
useHead({ title: 'Sign in · Lantern' })

const auth = useAuthStore()
const route = useRoute()

const email = ref('')
const password = ref('')
const showPassword = ref(false)
const busy = ref(false)
const error = ref('')

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
      <label for="login-password">Password</label>
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
    <p class="small muted">
      New to Lantern?
      <NuxtLink :to="{ path: '/signup', query: route.query }">Create an account</NuxtLink>
    </p>
  </form>
</template>

<style scoped lang="scss">
.auth-title {
  font-size: 28px;
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
