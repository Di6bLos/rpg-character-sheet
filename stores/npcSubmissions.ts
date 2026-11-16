import { ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '~/lib/supabase'
import type {
  GameSystem,
  NpcKind,
  NpcSource,
  NpcSubmission,
  NpcSubmissionStatus,
  StatBlock,
} from '~/types'

export interface NpcSuggestionDraft {
  system: GameSystem
  kind: NpcKind
  name: string
  level: string
  stat_block: StatBlock
  image_path: string | null
  note: string
}

/** What a reviewer may change before approving (see `staff_approve_npc_submission`). */
export type NpcApprovalEdits = Partial<
  Pick<NpcSubmission, 'name' | 'kind' | 'level' | 'stat_block' | 'image_path'>
>

const QUEUE_SELECT = '*, submitter:profiles!npc_submissions_submitted_by_fkey(handle, display_name)'

/**
 * NPC suggestions: players send stat blocks for the shared pool from Settings;
 * staff approve them into `npcs` or send them back with a note.
 */
export const useNpcSubmissionStore = defineStore('npcSubmissions', () => {
  const mine = ref<NpcSubmission[]>([])
  const loadingMine = ref(false)
  /** Pending suggestions, for the admin navigation badge. */
  const pendingCount = ref(0)

  async function fetchMine() {
    const auth = useAuthStore()
    if (!auth.userId) return
    loadingMine.value = true
    try {
      const { data, error } = await supabase
        .from('npc_submissions')
        .select('*')
        .eq('submitted_by', auth.userId)
        .order('created_at', { ascending: false })
      if (error) throw error
      mine.value = (data ?? []) as NpcSubmission[]
    } finally {
      loadingMine.value = false
    }
  }

  async function get(id: string): Promise<NpcSubmission> {
    const { data, error } = await supabase
      .from('npc_submissions')
      .select(QUEUE_SELECT)
      .eq('id', id)
      .single()
    if (error) throw error
    return data as NpcSubmission
  }

  /** Sends a new suggestion, or edits one (a rejected one goes back into the queue). */
  async function submit(draft: NpcSuggestionDraft, id?: string | null): Promise<NpcSubmission> {
    const row = {
      system: draft.system,
      kind: draft.kind,
      name: draft.name,
      level: draft.level,
      stat_block: draft.stat_block,
      image_path: draft.image_path,
      note: draft.note,
    }
    const res = id
      ? await supabase
          .from('npc_submissions')
          .update({
            ...row,
            status: 'pending',
            review_note: null,
            reviewed_by: null,
            reviewed_at: null,
          })
          .eq('id', id)
          .select()
          .single()
      : await supabase.from('npc_submissions').insert(row).select().single()
    if (res.error) throw res.error
    const saved = res.data as NpcSubmission
    mine.value = [saved, ...mine.value.filter((s) => s.id !== saved.id)]
    return saved
  }

  async function withdraw(id: string) {
    const { data, error } = await supabase
      .from('npc_submissions')
      .delete()
      .eq('id', id)
      .select('id')
    if (error) throw error
    if (!data?.length) throw new Error('That suggestion was already reviewed or removed')
    mine.value = mine.value.filter((s) => s.id !== id)
  }

  // --- Staff --------------------------------------------------------------------------

  async function fetchQueue(status: NpcSubmissionStatus, limit = 100): Promise<NpcSubmission[]> {
    const { data, error } = await supabase
      .from('npc_submissions')
      .select(QUEUE_SELECT)
      .eq('status', status)
      // Oldest first while waiting; newest decisions first otherwise.
      .order(status === 'pending' ? 'created_at' : 'reviewed_at', {
        ascending: status === 'pending',
      })
      .limit(limit)
    if (error) throw error
    return (data ?? []) as NpcSubmission[]
  }

  async function refreshPendingCount() {
    const { count } = await supabase
      .from('npc_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
    pendingCount.value = count ?? 0
  }

  /**
   * Approves into the pool; returns the new pool id. A name the pool already has
   * in that system fails with code 23505 unless `allowDuplicate`.
   */
  async function approve(
    id: string,
    source: NpcSource,
    edits?: NpcApprovalEdits,
    allowDuplicate = false,
  ) {
    const { data, error } = await supabase.rpc('staff_approve_npc_submission', {
      p_id: id,
      p_source: source,
      p_edits: edits ?? null,
      p_allow_duplicate: allowDuplicate,
    })
    if (error) throw error
    // Re-count rather than decrement: another reviewer may be working the queue too.
    void refreshPendingCount()
    return data as string
  }

  async function reject(id: string, note: string) {
    const { error } = await supabase.rpc('staff_reject_npc_submission', { p_id: id, p_note: note })
    if (error) throw error
    void refreshPendingCount()
  }

  function reset() {
    mine.value = []
    loadingMine.value = false
    pendingCount.value = 0
  }

  return {
    mine,
    loadingMine,
    pendingCount,
    fetchMine,
    get,
    submit,
    withdraw,
    fetchQueue,
    refreshPendingCount,
    approve,
    reject,
    reset,
  }
})
