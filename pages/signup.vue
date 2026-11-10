<script setup lang="ts">
import { supabase } from '~/lib/supabase'

definePageMeta({ layout: 'auth', middleware: 'guest' })
useHead({ title: 'Create an account · Lantern' })

const auth = useAuthStore()
const route = useRoute()

const displayName = ref('')
const handle = ref('')
const email = ref('')
const password = ref('')
const showPassword = ref(false)
const busy = ref(false)
const error = ref('')
const confirmSent = ref(false)

const handleClean = computed(() => handle.value.trim().toLowerCase())
const handleValid = computed(() => /^[a-z0-9_]{3,24}$/.test(handleClean.value))
const passwordValid = computed(() => password.value.length >= 8)
const ready = computed(
  () => displayName.value.trim() && handleValid.value && email.value.trim() && passwordValid.value,
)

async function submit() {
  error.value = ''
  busy.value = true
  try {
    const { data: free, error: checkError } = await supabase.rpc('handle_available', {
      candidate: handleClean.value,
    })
    if (checkError) throw checkError
    if (!free) {
      error.value = `@${handleClean.value} is taken. Pick another username.`
      return
    }
    const signedIn = await auth.signUp(
      email.value.trim(),
      password.value,
      displayName.value.trim(),
      handleClean.value,
    )
    if (!signedIn) {
      confirmSent.value = true
      return
    }
    const next = typeof route.query.next === 'string' ? route.query.next : ''
    await navigateTo(next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard')
  } catch (err) {
    error.value = (err as { message?: string }).message ?? 'Could not create the account.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="confirmSent" class="stack">
    <h1 class="auth-title">Check your email</h1>
    <p>
      We sent a confirmation link to <strong>{{ email }}</strong
      >. Open it to finish creating your account, then sign in.
    </p>
    <NuxtLink to="/" class="btn btn--block">Back to sign in</NuxtLink>
  </div>

  <form v-else class="stack" novalidate @submit.prevent="submit">
    <h1 class="auth-title">Create an account</h1>
    <div v-if="error" class="notice notice--error" role="alert">{{ error }}</div>
    <div class="field">
      <label for="signup-name">Display name</label>
      <input
        id="signup-name"
        v-model="displayName"
        class="input"
        type="text"
        autocomplete="name"
        maxlength="60"
        required
      />
    </div>
    <div class="field">
      <label for="signup-handle">Username</label>
      <input
        id="signup-handle"
        v-model="handle"
        class="input"
        type="text"
        autocomplete="username"
        autocapitalize="none"
        spellcheck="false"
        maxlength="24"
        aria-describedby="signup-handle-hint"
        required
      />
      <span id="signup-handle-hint" class="hint" :class="{ error: handle && !handleValid }">
        3–24 characters: lowercase letters, numbers and underscores. GMs use it to invite you.
      </span>
    </div>
    <div class="field">
      <label for="signup-email">Email</label>
      <input
        id="signup-email"
        v-model="email"
        class="input"
        type="email"
        autocomplete="email"
        required
      />
    </div>
    <div class="field">
      <label for="signup-password">Password</label>
      <div class="password">
        <input
          id="signup-password"
          v-model="password"
          class="input"
          :type="showPassword ? 'text' : 'password'"
          autocomplete="new-password"
          aria-describedby="signup-password-hint"
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
      <span id="signup-password-hint" class="hint" :class="{ error: password && !passwordValid }">
        At least 8 characters.
      </span>
    </div>
    <button class="btn btn--block" type="submit" :disabled="busy || !ready">
      {{ busy ? 'Creating account…' : 'Create account' }}
    </button>
    <p class="small muted">
      Already have an account?
      <NuxtLink :to="{ path: '/', query: route.query }">Sign in</NuxtLink>
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
