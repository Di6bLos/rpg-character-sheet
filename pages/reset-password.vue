<script setup lang="ts">
import { readAuthLink } from '~/utils/authLinks'

// The reset email links here with a recovery session in the URL hash, which the
// Supabase client turns into a session while the auth plugin starts; the auth store
// marks it `recovering` (and comes here from wherever the link landed). No guest
// middleware: it would send that session straight back here.
definePageMeta({ layout: 'auth' })
useHead({ title: 'Set a new password · Lantern' })

const auth = useAuthStore()
const snackbar = useSnackbarStore()

const password = ref('')
const confirm = ref('')
const showPassword = ref(false)
const busy = ref(false)
const error = ref('')
const linkError = ref('')

const passwordValid = computed(() => password.value.length >= 8)
const matches = computed(() => password.value === confirm.value)
const mismatch = computed(() => confirm.value.length > 0 && !matches.value)
const view = computed(() => {
  if (linkError.value) return 'expired'
  // busy: saving clears `recovering` just before the page moves on to the dashboard.
  if (auth.recovering || busy.value) return 'form'
  return auth.isAuthenticated ? 'signed-in' : 'expired'
})

onMounted(() => {
  const link = readAuthLink(window.location)
  linkError.value = link.error
  // Keep tokens and errors out of the address bar and history.
  if (link.cleanUrl) history.replaceState(history.state, '', link.cleanUrl)
})

async function submit() {
  if (!passwordValid.value || !matches.value) return
  error.value = ''
  busy.value = true
  try {
    const othersSignedOut = await auth.updatePassword(password.value)
    snackbar.show(
      othersSignedOut
        ? 'Password updated'
        : 'Password updated, but other devices could not be signed out',
      othersSignedOut ? 'success' : 'error',
    )
    await navigateTo('/dashboard')
  } catch (err) {
    error.value = (err as { message?: string }).message ?? 'Could not update the password.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="view === 'expired'" class="stack">
    <h1 class="auth-title">Link expired</h1>
    <p>This reset link has expired or was already used. Ask for a new one.</p>
    <NuxtLink to="/forgot-password" class="btn btn--block">Send a new link</NuxtLink>
    <p class="small muted"><NuxtLink to="/">Back to sign in</NuxtLink></p>
  </div>

  <div v-else-if="view === 'signed-in'" class="stack">
    <h1 class="auth-title">No reset in progress</h1>
    <p>To set a new password, open the link in a password reset email.</p>
    <NuxtLink to="/dashboard" class="btn btn--block">Back to the dashboard</NuxtLink>
  </div>

  <form v-else class="stack" novalidate @submit.prevent="submit">
    <h1 class="auth-title">Set a new password</h1>
    <div v-if="error" class="notice notice--error" role="alert">{{ error }}</div>
    <!-- Lets password managers file the new password under this account. -->
    <input
      type="email"
      name="username"
      autocomplete="username"
      :value="auth.session?.user.email ?? ''"
      readonly
      hidden
    />
    <div class="field">
      <label for="reset-password">New password</label>
      <div class="password">
        <input
          id="reset-password"
          v-model="password"
          class="input"
          :type="showPassword ? 'text' : 'password'"
          autocomplete="new-password"
          aria-describedby="reset-password-hint"
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
      <span id="reset-password-hint" class="hint" :class="{ error: password && !passwordValid }">
        At least 8 characters.
      </span>
    </div>
    <div class="field">
      <label for="reset-confirm">Confirm password</label>
      <input
        id="reset-confirm"
        v-model="confirm"
        class="input"
        :type="showPassword ? 'text' : 'password'"
        autocomplete="new-password"
        :aria-invalid="mismatch"
        :aria-describedby="mismatch ? 'reset-confirm-error' : undefined"
        required
      />
      <span v-if="mismatch" id="reset-confirm-error" class="error">
        The passwords don’t match.
      </span>
    </div>
    <button class="btn btn--block" type="submit" :disabled="busy || !passwordValid || !matches">
      {{ busy ? 'Saving…' : 'Save password' }}
    </button>
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
