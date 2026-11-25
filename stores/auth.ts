import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '~/lib/supabase'
import type { PermissionFlag, Profile, UserPermissions } from '~/types'
import { recoveryStillValid } from '~/utils/authLinks'

// Kept per tab so a reload of /reset-password keeps the form.
const RECOVERY_KEY = 'lantern-recovering'

export const useAuthStore = defineStore('auth', () => {
  const session = ref<Session | null>(null)
  const profile = ref<Profile | null>(null)
  const permissions = ref<UserPermissions | null>(null)
  const loading = ref(true)
  /** Signed in by a password reset link and not yet given a new password. */
  const recovering = ref(false)

  const isAuthenticated = computed(() => session.value !== null)
  const userId = computed(() => session.value?.user.id ?? null)
  const isAdmin = computed(() => profile.value?.role === 'admin')
  const isStaff = computed(
    () => profile.value?.role === 'admin' || profile.value?.role === 'moderator',
  )
  const isSuspended = computed(() => permissions.value?.suspended === true)

  /** Whether the signed-in user may perform a permission-gated action. */
  function can(flag: PermissionFlag): boolean {
    const p = permissions.value
    return !!p && !p.suspended && p[flag]
  }

  async function fetchProfile() {
    const id = session.value?.user.id
    if (!id) return
    const [profileRes, permRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', id).maybeSingle(),
      supabase.from('user_permissions').select('*').eq('user_id', id).maybeSingle(),
    ])
    // The session may have changed (sign-out, another account) while these ran.
    if (session.value?.user.id !== id) return
    profile.value = (profileRes.data as Profile | null) ?? null
    permissions.value = (permRes.data as UserPermissions | null) ?? null
  }

  /** Saves the reset mark for this user, or removes it when `userId` is null. */
  function rememberRecovery(userId: string | null) {
    try {
      if (userId) sessionStorage.setItem(RECOVERY_KEY, JSON.stringify({ userId, at: Date.now() }))
      else sessionStorage.removeItem(RECOVERY_KEY)
    } catch {
      // Storage blocked: the in-memory flag still covers this page load.
    }
  }

  /** Restores `recovering` from the saved mark when it fits this user and is still fresh. */
  function syncRecovering(userId: string | null) {
    let raw: string | null = null
    try {
      raw = sessionStorage.getItem(RECOVERY_KEY)
    } catch {
      // Storage blocked: nothing saved to restore.
    }
    recovering.value = recoveryStillValid(raw, userId, Date.now())
    if (!recovering.value) rememberRecovery(null)
  }

  /** Clears every store that caches the signed-in player's data. */
  function resetPlayerData() {
    useCharacterStore().reset()
    useCampaignStore().reset()
    useLibraryStore().reset()
  }

  async function init() {
    const router = useRouter()
    // Subscribed before getSession: PASSWORD_RECOVERY fires once, while the client reads
    // the link's hash, and would be missed if this waited for the session and profile.
    supabase.auth.onAuthStateChange((event, newSession) => {
      // Covers sign-out or a different account in another tab, not just logout() here.
      if (newSession?.user.id !== session.value?.user.id) {
        resetPlayerData()
        syncRecovering(newSession?.user.id ?? null)
      }
      session.value = newSession
      if (!newSession) {
        profile.value = null
        permissions.value = null
      } else if (event === 'PASSWORD_RECOVERY') {
        // The link may land on the Site URL root when /reset-password isn't an allowed
        // redirect; the guest middleware also sends this session there.
        recovering.value = true
        rememberRecovery(newSession.user.id)
        void router.push('/reset-password')
      } else if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        // Deferred: Supabase warns against awaiting its own client inside this callback.
        setTimeout(() => void fetchProfile(), 0)
      }
    })

    const { data } = await supabase.auth.getSession()
    session.value = data.session
    if (!recovering.value) syncRecovering(session.value?.user.id ?? null)
    if (session.value) await fetchProfile()

    loading.value = false
  }

  /** Returns true when a session was created (false = email confirmation required). */
  async function signUp(email: string, password: string, displayName: string, handle: string) {
    const siteUrl = useRuntimeConfig().public.siteUrl || window.location.origin
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName, handle },
        emailRedirectTo: `${siteUrl}/dashboard`,
      },
    })
    if (error) throw error
    if (data.session) {
      session.value = data.session
      await fetchProfile()
    }
    return data.session !== null
  }

  async function login(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    if (data.session?.user.id !== session.value?.user.id) resetPlayerData()
    session.value = data.session
    await fetchProfile()
  }

  /** Emails a link that signs the player in on /reset-password to set a new password. */
  async function requestPasswordReset(email: string) {
    const siteUrl = useRuntimeConfig().public.siteUrl || window.location.origin
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl}/reset-password`,
    })
    if (error) throw error
  }

  /** Returns false when the password changed but other devices could not be signed out. */
  async function updatePassword(password: string) {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw error
    // A reset often means the account may be compromised: end every other session.
    const { error: signOutError } = await supabase.auth.signOut({ scope: 'others' })
    recovering.value = false
    rememberRecovery(null)
    return !signOutError
  }

  async function logout() {
    // This browser only: the default ("global") ends the account's sessions in every
    // other tab and device too, which then fail with 401s until they sign in again.
    await supabase.auth.signOut({ scope: 'local' })
    session.value = null
    profile.value = null
    permissions.value = null
    recovering.value = false
    rememberRecovery(null)
    // Drop the previous player's cached data so the next sign-in starts clean.
    resetPlayerData()
  }

  async function updateProfile(patch: Partial<Profile>) {
    if (!profile.value) return
    const { data, error } = await supabase
      .from('profiles')
      .update(patch)
      .eq('id', profile.value.id)
      .select()
      .single()
    if (error) throw error
    profile.value = data as Profile
  }

  return {
    session,
    profile,
    permissions,
    loading,
    recovering,
    isAuthenticated,
    userId,
    isAdmin,
    isStaff,
    isSuspended,
    can,
    init,
    fetchProfile,
    signUp,
    login,
    logout,
    requestPasswordReset,
    updatePassword,
    updateProfile,
  }
})
