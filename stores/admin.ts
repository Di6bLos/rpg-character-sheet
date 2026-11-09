import { ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '~/lib/supabase'
import type {
  ModerationEvent,
  PermissionFlag,
  Report,
  RestrictionReason,
  StaffUser,
  UserRole,
} from '~/types'

export type ReportRow = Report & { uploader: { display_name: string; handle: string } | null }

export interface ReportGroup {
  key: string
  first: ReportRow
  ids: string[]
  reasons: string[]
  reporters: number
}

export const useAdminStore = defineStore('admin', () => {
  const users = ref<StaffUser[]>([])
  const reports = ref<ReportRow[]>([])
  const loading = ref(false)

  async function fetchUsers() {
    const { data, error } = await supabase.rpc('staff_list_users')
    if (error) throw error
    users.value = (data ?? []) as StaffUser[]
  }

  async function fetchReports() {
    const { data, error } = await supabase
      .from('reports')
      .select('*, uploader:profiles!reports_uploader_id_fkey(display_name, handle)')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
    if (error) throw error
    reports.value = (data ?? []) as unknown as ReportRow[]
    useOpenReports().openCount.value = groups().length
  }

  async function load() {
    loading.value = true
    try {
      await Promise.all([fetchUsers(), fetchReports()])
    } finally {
      loading.value = false
    }
  }

  /** Open reports collapsed to one row per reported file. */
  function groups(): ReportGroup[] {
    const map = new Map<string, ReportGroup>()
    for (const r of reports.value) {
      const key = `${r.target_type}:${r.target_id}`
      const group = map.get(key)
      if (group) {
        group.ids.push(r.id)
        group.reporters++
        if (!group.reasons.includes(r.reason)) group.reasons.push(r.reason)
      } else {
        map.set(key, { key, first: r, ids: [r.id], reasons: [r.reason], reporters: 1 })
      }
    }
    return [...map.values()]
  }

  async function history(userId: string): Promise<ModerationEvent[]> {
    const { data, error } = await supabase
      .from('moderation_history')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) throw error
    return (data ?? []) as ModerationEvent[]
  }

  async function setPermission(
    userId: string,
    flag: PermissionFlag,
    value: boolean,
    reason: RestrictionReason | null,
  ) {
    const { error } = await supabase.rpc('staff_set_permission', {
      p_user: userId,
      p_flag: flag,
      p_value: value,
      p_reason: reason,
    })
    if (error) throw error
    await fetchUsers()
  }

  async function setReason(userId: string, reason: RestrictionReason | '') {
    const { error } = await supabase.rpc('staff_set_reason', { p_user: userId, p_reason: reason })
    if (error) throw error
    await fetchUsers()
  }

  async function setRole(userId: string, role: UserRole) {
    const { error } = await supabase.rpc('admin_set_role', { p_user: userId, p_role: role })
    if (error) throw error
    await fetchUsers()
  }

  async function setSuspended(userId: string, suspended: boolean) {
    const { error } = await supabase.rpc('admin_set_suspended', {
      p_user: userId,
      p_suspended: suspended,
    })
    if (error) throw error
    await fetchUsers()
  }

  async function resolve(group: ReportGroup, action: 'dismiss' | 'remove' | 'remove_restrict') {
    if (action === 'dismiss') {
      // Dismiss every report on the file, not just the first.
      for (const id of group.ids) {
        const { error } = await supabase.rpc('staff_resolve_report', {
          p_report: id,
          p_action: 'dismiss',
        })
        if (error) throw error
      }
    } else {
      const { error } = await supabase.rpc('staff_resolve_report', {
        p_report: group.first.id,
        p_action: action,
      })
      if (error) throw error
      // Storage reports failures in `error` rather than throwing.
      const removed = await supabase.storage
        .from(group.first.bucket)
        .remove([group.first.file_path])
      await Promise.all([fetchReports(), fetchUsers()])
      if (removed.error) {
        throw new Error(
          `The report was resolved, but the file couldn’t be deleted from storage (${removed.error.message}). ` +
            `Delete ${group.first.bucket}/${group.first.file_path} in the Supabase dashboard.`,
        )
      }
      return
    }
    await Promise.all([fetchReports(), fetchUsers()])
  }

  return {
    users,
    reports,
    loading,
    load,
    fetchUsers,
    fetchReports,
    groups,
    history,
    setPermission,
    setReason,
    setRole,
    setSuspended,
    resolve,
  }
})
