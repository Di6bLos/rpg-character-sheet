<script setup lang="ts">
definePageMeta({ layout: 'auth', middleware: 'guest' })
useHead({ title: 'Reset password · Lantern' })

const auth = useAuthStore()

// The sign-in page passes what was typed in history state, not the URL, so the address
// stays out of browser history and request logs.
const prefill: unknown = window.history.state?.email
const email = ref(typeof prefill === 'string' ? prefill : '')
const busy = ref(false)
const error = ref('')
const sent = ref(false)

async function submit() {
  error.value = ''
  busy.value = true
  try {
    await auth.requestPasswordReset(email.value.trim())
    sent.value = true
  } catch (err) {
    const e = err as { message?: string; code?: string; status?: number }
    if (e.code === 'over_email_send_rate_limit' || e.status === 429) {
      error.value = 'Too many reset emails. Wait a few minutes and try again.'
    } else if (!e.message || (e.status ?? 0) >= 500) {
      // The mail service failed (e.g. no SMTP); its raw text means nothing to a player.
      error.value = 'Could not send the reset email right now. Try again in a few minutes.'
    } else {
      error.value = e.message
    }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="sent" class="stack">
    <h1 class="auth-title">Check your email</h1>
    <p>
      If an account exists for <strong>{{ email.trim() }}</strong
      >, we sent it a link to set a new password.
    </p>
    <NuxtLink to="/" class="btn btn--block">Back to sign in</NuxtLink>
  </div>

  <form v-else class="stack" novalidate @submit.prevent="submit">
    <h1 class="auth-title">Reset password</h1>
    <p class="muted">Enter your account’s email and we’ll send you a link to set a new password.</p>
    <div v-if="error" class="notice notice--error" role="alert">{{ error }}</div>
    <div class="field">
      <label for="forgot-email">Email</label>
      <input
        id="forgot-email"
        v-model="email"
        class="input"
        type="email"
        autocomplete="email"
        required
      />
    </div>
    <button class="btn btn--block" type="submit" :disabled="busy || !email.trim()">
      {{ busy ? 'Sending…' : 'Send reset link' }}
    </button>
    <p class="small muted">
      Remembered it?
      <NuxtLink to="/">Sign in</NuxtLink>
    </p>
  </form>
</template>

<style scoped lang="scss">
.auth-title {
  font-size: 28px;
}
</style>
