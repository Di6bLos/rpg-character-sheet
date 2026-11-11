import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '~/lib/supabase'
import type { PermissionFlag, Profile, UserPermissions } from '~/types'

export const useAuthStore = defineStore('auth', () => {
  const session = ref<Session | null>(null)
  const profile = ref<Profile | null>(null)
  const permissions = ref<UserPermissions | null>(null)
  const loading = ref(true)

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

  /** Clears every store that caches the signed-in player's data. */
  function resetPlayerData() {
    useCharacterStore().reset()
    useCampaignStore().reset()
    useLibraryStore().reset()
  }

  async function init() {
    const { data } = await supabase.auth.getSession()
    session.value = data.session
    if (session.value) await fetchProfile()

    supabase.auth.onAuthStateChange((event, newSession) => {
      // Covers sign-out or a different account in another tab, not just logout() here.
      if (newSession?.user.id !== session.value?.user.id) resetPlayerData()
      session.value = newSession
      if (!newSession) {
        profile.value = null
        permissions.value = null
      } else if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        // Deferred: Supabase warns against awaiting its own client inside this callback.
        setTimeout(() => void fetchProfile(), 0)
      }
    })

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

  async function logout() {
    await supabase.auth.signOut()
    session.value = null
    profile.value = null
    permissions.value = null
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
    updateProfile,
  }
})
