import { ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '~/lib/supabase'
import type { AdminProfile, Group, FeedbackItem } from '~/types'

export const useAdminStore = defineStore('admin', () => {
    const allProfiles = ref<AdminProfile[]>([])
    const groups = ref<Group[]>([])
    const feedback = ref<FeedbackItem[]>([])
    const loading = ref(false)
    const error = ref<string | null>(null)

    async function fetchAllProfiles() {
        loading.value = true
        error.value = null
        try {
            const { data, error: fetchError } = await supabase
                .from('profiles')
                .select('*, user_groups(group_id, groups(id, name, created_at))')
                .order('created_at', { ascending: true })
            if (fetchError) throw fetchError
            allProfiles.value = (data ?? []).map((p) => ({
                ...p,
                groups: (p.user_groups ?? []).map(
                    (ug: { group_id: string; groups: Group | null }) => ug.groups,
                ).filter((g: Group | null): g is Group => g !== null),
            })) as AdminProfile[]
        } catch (e) {
            error.value = e instanceof Error ? e.message : 'Failed to load profiles'
        } finally {
            loading.value = false
        }
    }

    async function fetchGroups() {
        const { data, error: fetchError } = await supabase
            .from('groups')
            .select('*')
            .order('name')
        if (fetchError) throw fetchError
        groups.value = (data ?? []) as Group[]
    }

    async function createGroup(name: string) {
        const { data, error: insertError } = await supabase
            .from('groups')
            .insert({ name })
            .select()
            .single()
        if (insertError) throw insertError
        groups.value.push(data as Group)
    }

    async function deleteGroup(id: string) {
        const { error: deleteError } = await supabase.from('groups').delete().eq('id', id)
        if (deleteError) throw deleteError
        groups.value = groups.value.filter((g) => g.id !== id)
        // Remove group from local profiles
        allProfiles.value = allProfiles.value.map((p) => ({
            ...p,
            groups: p.groups.filter((g) => g.id !== id),
        }))
    }

    async function assignUserToGroup(userId: string, groupId: string) {
        const { error: upsertError } = await supabase
            .from('user_groups')
            .upsert({ user_id: userId, group_id: groupId })
        if (upsertError) throw upsertError
        const group = groups.value.find((g) => g.id === groupId)
        if (!group) return
        const idx = allProfiles.value.findIndex((p) => p.id === userId)
        if (idx !== -1) {
            const profile = allProfiles.value[idx]!
            if (!profile.groups.some((g) => g.id === groupId)) {
                allProfiles.value.splice(idx, 1, {
                    ...profile,
                    groups: [...profile.groups, group],
                })
            }
        }
    }

    async function removeUserFromGroup(userId: string, groupId: string) {
        const { error: deleteError } = await supabase
            .from('user_groups')
            .delete()
            .eq('user_id', userId)
            .eq('group_id', groupId)
        if (deleteError) throw deleteError
        const idx = allProfiles.value.findIndex((p) => p.id === userId)
        if (idx !== -1) {
            const profile = allProfiles.value[idx]!
            allProfiles.value.splice(idx, 1, {
                ...profile,
                groups: profile.groups.filter((g) => g.id !== groupId),
            })
        }
    }

    async function inviteUser(email: string) {
        const { error: fnError } = await supabase.functions.invoke('invite-user', {
            body: { email },
        })
        if (fnError) throw fnError
    }

    async function deactivateUser(userId: string) {
        const { error: updateError } = await supabase
            .from('profiles')
            .update({ is_active: false })
            .eq('id', userId)
        if (updateError) throw updateError
        const idx = allProfiles.value.findIndex((p) => p.id === userId)
        if (idx !== -1) {
            allProfiles.value.splice(idx, 1, { ...allProfiles.value[idx]!, is_active: false })
        }
    }

    async function reactivateUser(userId: string) {
        const { error: updateError } = await supabase
            .from('profiles')
            .update({ is_active: true })
            .eq('id', userId)
        if (updateError) throw updateError
        const idx = allProfiles.value.findIndex((p) => p.id === userId)
        if (idx !== -1) {
            allProfiles.value.splice(idx, 1, { ...allProfiles.value[idx]!, is_active: true })
        }
    }

    async function deleteUser(userId: string) {
        const { error: fnError } = await supabase.functions.invoke('delete-user', {
            body: { userId },
        })
        if (fnError) throw fnError
        allProfiles.value = allProfiles.value.filter((p) => p.id !== userId)
    }

    async function fetchFeedback() {
        const { data, error: fetchError } = await supabase
            .from('feedback')
            .select('*')
            .order('created_at', { ascending: false })
        if (fetchError) throw fetchError
        feedback.value = (data ?? []) as FeedbackItem[]
    }

    return {
        allProfiles,
        groups,
        feedback,
        loading,
        error,
        fetchAllProfiles,
        fetchGroups,
        createGroup,
        deleteGroup,
        assignUserToGroup,
        removeUserFromGroup,
        inviteUser,
        deactivateUser,
        reactivateUser,
        deleteUser,
        fetchFeedback,
    }
})
