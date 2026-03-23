import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '~/lib/supabase'
import type { Profile } from '~/types'

export const useAuthStore = defineStore('auth', () => {
    const session = ref<Session | null>(null)
    const profile = ref<Profile | null>(null)
    const loading = ref(true)

    const isAuthenticated = computed(() => session.value !== null)
    const isAdmin = computed(() => profile.value?.is_admin === true)

    async function fetchProfile() {
        if (!session.value) return
        const { data } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.value.user.id)
            .single()
        profile.value = data as Profile | null
    }

    async function init() {
        const { data } = await supabase.auth.getSession()
        session.value = data.session
        if (session.value) {
            await fetchProfile()
            if (profile.value?.is_active === false) {
                await logout()
                loading.value = false
                return
            }
        }

        supabase.auth.onAuthStateChange(async (_, newSession) => {
            session.value = newSession
            if (newSession) {
                await fetchProfile()
                if (profile.value?.is_active === false) {
                    await logout()
                }
            } else {
                profile.value = null
            }
        })

        loading.value = false
    }

    async function signUp(email: string, password: string, displayName: string) {
        const { error } = await supabase.auth.signUp({
            email,
            password,
            options: { data: { display_name: displayName } },
        })
        if (error) throw error
    }

    async function login(email: string, password: string) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        session.value = data.session
        await fetchProfile()
    }

    async function logout() {
        await supabase.auth.signOut()
        session.value = null
        profile.value = null
    }

    return { session, profile, loading, isAuthenticated, isAdmin, init, signUp, login, logout }
})
