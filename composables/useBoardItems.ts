import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '~/lib/supabase'
import type { BoardItem } from '~/types'
import { plural, safeFileName } from '~/utils/format'

export const CAMPAIGN_BUCKET = 'campaign-files'
export const MAX_CAMPAIGN_FILE = 25 * 1024 * 1024

export function titleFromFile(name: string) {
  return (
    name
      .replace(/\.[^.]+$/, '')
      .replace(/[-_]+/g, ' ')
      .trim()
      .slice(0, 120) || 'Untitled'
  )
}

/** Maps and images pinned to a campaign's board, live, with signed thumbnail URLs. */
export function useBoardItems(campaignId: Ref<string>) {
  const snackbar = useSnackbarStore()
  const items = ref<BoardItem[]>([])
  const urls = ref<Record<string, string>>({})
  const loading = ref(true)
  const uploading = ref(false)
  let channel: RealtimeChannel | null = null

  async function loadUrls() {
    const missing = items.value.filter((i) => !urls.value[i.id])
    const signed = await Promise.all(missing.map((i) => signedUrl(CAMPAIGN_BUCKET, i.file_path)))
    missing.forEach((item, idx) => {
      const url = signed[idx]
      if (url) urls.value[item.id] = url
    })
  }

  async function load() {
    const { data, error } = await supabase
      .from('board_items')
      .select('*')
      .eq('campaign_id', campaignId.value)
      .order('created_at', { ascending: false })
    if (error) throw error
    items.value = (data ?? []) as BoardItem[]
    await loadUrls()
  }

  async function init() {
    loading.value = true
    try {
      await load()
      if (channel) void supabase.removeChannel(channel)
      channel = supabase
        .channel(`board-items-${campaignId.value}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'board_items',
            filter: `campaign_id=eq.${campaignId.value}`,
          },
          () => void load(),
        )
        .subscribe()
    } catch (err) {
      snackbar.error(err, 'Could not load the board')
    } finally {
      loading.value = false
    }
  }

  onMounted(init)
  watch(campaignId, init)
  onBeforeUnmount(() => {
    if (channel) void supabase.removeChannel(channel)
  })

  /** Uploads images as `kind`; returns the id of the last one added. */
  async function upload(files: File[], kind: BoardItem['kind']): Promise<string | null> {
    if (!files.length) return null
    uploading.value = true
    let added = 0
    let lastId: string | null = null
    try {
      for (const file of files) {
        if (!file.type.startsWith('image/')) {
          snackbar.show(`${file.name} isn’t an image`, 'error')
          continue
        }
        if (file.size > MAX_CAMPAIGN_FILE) {
          snackbar.show(`${file.name} is over 25 MB`, 'error')
          continue
        }
        const path = `${campaignId.value}/board/${crypto.randomUUID()}-${safeFileName(file.name)}`
        const up = await supabase.storage
          .from(CAMPAIGN_BUCKET)
          .upload(path, file, { contentType: file.type })
        if (up.error) throw up.error
        const { data, error } = await supabase
          .from('board_items')
          .insert({
            campaign_id: campaignId.value,
            title: titleFromFile(file.name),
            kind,
            file_path: path,
          })
          .select()
          .single()
        if (error) throw error
        lastId = (data as BoardItem).id
        added++
      }
      if (added) {
        await load()
        snackbar.show(`${plural(added, kind === 'map' ? 'map' : 'image')} pinned to the board`)
      }
    } catch (err) {
      snackbar.error(err, 'Could not upload to the board')
    } finally {
      uploading.value = false
    }
    return lastId
  }

  async function toggleHidden(item: BoardItem) {
    const { error } = await supabase
      .from('board_items')
      .update({ hidden: !item.hidden })
      .eq('id', item.id)
    if (error) return snackbar.error(error, 'Could not change visibility')
    item.hidden = !item.hidden
    snackbar.show(item.hidden ? 'Hidden from players' : 'Revealed to the party')
  }

  async function rename(item: BoardItem, title: string) {
    const t = title.trim()
    if (!t || t === item.title) return
    const { error } = await supabase.from('board_items').update({ title: t }).eq('id', item.id)
    if (error) return snackbar.error(error, 'Could not rename')
    item.title = t
  }

  async function remove(item: BoardItem) {
    const { error } = await supabase.from('board_items').delete().eq('id', item.id)
    if (error) return snackbar.error(error, 'Could not remove from the board')
    await supabase.storage.from(CAMPAIGN_BUCKET).remove([item.file_path])
    items.value = items.value.filter((i) => i.id !== item.id)
  }

  return { items, urls, loading, uploading, upload, toggleHidden, rename, remove }
}
