<script setup lang="ts">
// The reset email links here with a recovery session in the URL hash, which the
// Supabase client turns into a session while the auth plugin starts. No guest
// middleware: that session would bounce the player to the dashboard.
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
const expired = computed(() => linkError.value !== '' || !auth.isAuthenticated)

onMounted(() => {
  const hash = new URLSearchParams(window.location.hash.slice(1))
  if (hash.get('error') || hash.get('error_code')) {
    linkError.value = hash.get('error_description') ?? 'This reset link isn’t valid.'
  }
  // Keep tokens and errors out of the address bar and history.
  if (window.location.hash) {
    history.replaceState(history.state, '', window.location.pathname + window.location.search)
  }
})

async function submit() {
  if (!passwordValid.value || !matches.value) return
  error.value = ''
  busy.value = true
  try {
    await auth.updatePassword(password.value)
    snackbar.show('Password updated')
    await navigateTo('/dashboard')
  } catch (err) {
    error.value = (err as { message?: string }).message ?? 'Could not update the password.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="expired" class="stack">
    <h1 class="auth-title">Link expired</h1>
    <p>This reset link has expired or was already used. Ask for a new one.</p>
    <NuxtLink to="/forgot-password" class="btn btn--block">Send a new link</NuxtLink>
    <p class="small muted"><NuxtLink to="/">Back to sign in</NuxtLink></p>
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
