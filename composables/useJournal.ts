import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '~/lib/supabase'
import type { JournalEntry, JournalFact, JournalFields, JournalSection } from '~/types'
import { safeFileName } from '~/utils/format'
import type { JournalStub } from '~/utils/npcJournal'
import { CAMPAIGN_BUCKET } from './useBoardItems'

const SELECT =
  '*, author:profiles!journal_entries_author_id_fkey(display_name), journal_attachments(*)'

export interface NewEntry {
  section: JournalSection
  title: string
  body: string
  visibility: 'party' | 'gm'
  files: File[]
  fields?: JournalFields
}

interface PendingFacts {
  facts: JournalFact[]
  write: Promise<void>
}

/** Public URL for an NPC image (bucket `npc-images`). */
export function npcImageUrl(path: string | null | undefined): string | null {
  if (!path) return null
  return supabase.storage.from('npc-images').getPublicUrl(path).data.publicUrl
}

/**
 * Inserts the party's journal entry for an NPC unless one already exists
 * (one per NPC per campaign, however many copies enter initiative).
 * Returns true when a new entry was created.
 */
export async function ensureNpcEntry(stub: JournalStub): Promise<boolean> {
  const { data: existing, error: findError } = await supabase
    .from('journal_entries')
    .select('id')
    .eq('campaign_id', stub.campaign_id)
    .eq('campaign_npc_id', stub.campaign_npc_id)
    .maybeSingle()
  if (findError) throw findError
  if (existing) return false
  const { error } = await supabase.from('journal_entries').insert(stub)
  // 23505: another tab added it first.
  if (error && error.code !== '23505') throw error
  return !error
}

/** A campaign's journal, live: entries of every section with their attachments. */
export function useJournal(campaignId: Ref<string>) {
  const snackbar = useSnackbarStore()
  const entries = ref<JournalEntry[]>([])
  const loading = ref(true)
  const posting = ref(false)
  let channel: RealtimeChannel | null = null
  /** The latest fact write per entry id, chained behind the ones before it. */
  const pendingFacts = new Map<string, PendingFacts>()

  async function load() {
    const { data, error } = await supabase
      .from('journal_entries')
      .select(SELECT)
      .eq('campaign_id', campaignId.value)
      .order('created_at', { ascending: false })
    if (error) throw error
    const fresh = (data ?? []) as unknown as JournalEntry[]
    // A fact write still in flight shows its facts, not the row from before it.
    for (const e of fresh) {
      const pending = pendingFacts.get(e.id)
      if (pending) e.fields = { ...e.fields, facts: pending.facts }
    }
    entries.value = fresh
  }

  async function init() {
    loading.value = true
    try {
      await load()
      if (channel) void supabase.removeChannel(channel)
      channel = supabase
        .channel(`journal-${campaignId.value}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'journal_entries',
            filter: `campaign_id=eq.${campaignId.value}`,
          },
          () => void load(),
        )
        // Sent by another member after a change realtime can't show them: an entry
        // made GM-only no longer passes their RLS, and attachments land after the entry.
        .on('broadcast', { event: 'refresh' }, () => void load())
        .subscribe()
    } catch (err) {
      snackbar.error(err, 'Could not load the journal')
    } finally {
      loading.value = false
    }
  }

  onMounted(init)
  watch(campaignId, init)
  onBeforeUnmount(() => {
    if (channel) void supabase.removeChannel(channel)
  })

  /** Asks every other open journal in this campaign to refetch. */
  function notifyOthers() {
    void channel?.send({ type: 'broadcast', event: 'refresh', payload: {} })
  }

  function inSection(section: JournalSection) {
    return entries.value.filter((e) => (e.section ?? 'log') === section)
  }

  async function post(entry: NewEntry): Promise<boolean> {
    const title = entry.title.trim()
    if (!title) return false
    posting.value = true
    try {
      const { data, error } = await supabase
        .from('journal_entries')
        .insert({
          campaign_id: campaignId.value,
          section: entry.section,
          title,
          body: entry.body.trim(),
          visibility: entry.visibility,
          fields: entry.fields ?? {},
        })
        .select('id')
        .single()
      if (error) throw error
      const entryId = (data as { id: string }).id
      for (const file of entry.files) {
        const path = `${campaignId.value}/journal/${entryId}/${crypto.randomUUID()}-${safeFileName(file.name)}`
        const up = await supabase.storage
          .from(CAMPAIGN_BUCKET)
          .upload(path, file, { contentType: file.type || 'application/octet-stream' })
        if (up.error) {
          snackbar.error(up.error, `Could not attach ${file.name}`)
          continue
        }
        const { error: attachError } = await supabase
          .from('journal_attachments')
          .insert({ entry_id: entryId, file_path: path, name: file.name, size: file.size })
        if (attachError) {
          snackbar.error(attachError, `Could not attach ${file.name}`)
          await supabase.storage.from(CAMPAIGN_BUCKET).remove([path])
        }
      }
      await load()
      if (entry.files.length) notifyOthers()
      snackbar.show('Added to the journal')
      return true
    } catch (err) {
      snackbar.error(err, 'Could not post the entry')
      return false
    } finally {
      posting.value = false
    }
  }

  /**
   * Saves a member's notes on an NPC or bestiary entry. The server merges them
   * into `fields` and keeps its own facts, so a reveal at the same moment isn't lost.
   */
  async function saveNotes(entry: JournalEntry, notes: Omit<JournalFields, 'facts'>) {
    const { data, error } = await supabase.rpc('journal_save_notes', {
      p_entry: entry.id,
      p_notes: notes,
    })
    if (error || !data)
      return snackbar.error(
        error ?? new Error('You can’t edit this entry'),
        'Could not save your notes',
      )
    entry.fields = data as JournalFields
    snackbar.show('Notes saved')
  }

  /**
   * GM only: replace the revealed facts (the server keeps everyone's notes as they are).
   * Writes for one entry go out one at a time so a reveal can't land after a later
   * "Hide all"; until the last one settles, its facts win over responses and reloads.
   */
  async function setFacts(entry: JournalEntry, facts: JournalFact[]) {
    const id = entry.id
    const current = () => entries.value.find((e) => e.id === id) ?? entry
    const target = current()
    target.fields = { ...target.fields, facts }
    const job: PendingFacts = { facts, write: Promise.resolve() }
    job.write = (pendingFacts.get(id)?.write ?? Promise.resolve()).then(async () => {
      // A newer click is queued behind this one: only its facts need to reach the server.
      if (pendingFacts.get(id) !== job) return
      const { data, error } = await supabase.rpc('journal_set_facts', {
        p_entry: id,
        p_facts: job.facts,
      })
      const latest = pendingFacts.get(id) === job
      if (latest) pendingFacts.delete(id)
      if (error || !data) {
        snackbar.error(error ?? new Error('You can’t edit this entry'), 'Could not reveal that')
        if (latest) await load().catch(() => undefined)
        return
      }
      if (latest) current().fields = data as JournalFields
    })
    pendingFacts.set(id, job)
    await job.write
  }

  /** Author or GM: change an entry's title, text and who can see it. */
  async function updateEntry(
    entry: JournalEntry,
    patch: { title: string; body: string; visibility: 'party' | 'gm' },
  ): Promise<boolean> {
    const title = patch.title.trim()
    if (!title) return false
    const { data, error } = await supabase
      .from('journal_entries')
      .update({ title, body: patch.body.trim(), visibility: patch.visibility })
      .eq('id', entry.id)
      .select('title, body, visibility, edited_at')
      .maybeSingle()
    if (error || !data) {
      snackbar.error(error ?? new Error('You can’t edit this entry'), 'Could not save your changes')
      return false
    }
    const visibilityChanged = entry.visibility !== data.visibility
    Object.assign(entry, data)
    if (visibilityChanged) notifyOthers()
    snackbar.show('Entry updated')
    return true
  }

  async function setVisibility(entry: JournalEntry, visibility: 'party' | 'gm') {
    const { error } = await supabase
      .from('journal_entries')
      .update({ visibility })
      .eq('id', entry.id)
    if (error) return snackbar.error(error, 'Could not change who sees this')
    entry.visibility = visibility
    notifyOthers()
  }

  async function remove(entry: JournalEntry) {
    const paths = entry.journal_attachments.map((a) => a.file_path)
    const { error } = await supabase.from('journal_entries').delete().eq('id', entry.id)
    if (error) return snackbar.error(error, 'Could not delete the entry')
    if (paths.length) await supabase.storage.from(CAMPAIGN_BUCKET).remove(paths)
    entries.value = entries.value.filter((e) => e.id !== entry.id)
  }

  return {
    entries,
    loading,
    posting,
    inSection,
    post,
    saveNotes,
    updateEntry,
    setFacts,
    setVisibility,
    remove,
    reload: load,
  }
}
