import { ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '~/lib/supabase'
import type { Character, GameSystem } from '~/types'
import type { AnySheet } from '~/types/sheets'
import { defaultSheet, normalizeSheet } from '~/utils/sheetDefaults'

export const MAX_CHARACTERS = 5

function hydrate(row: Character): Character<AnySheet> {
  return { ...row, sheet: normalizeSheet(row.system, row.sheet) }
}

export const useCharacterStore = defineStore('character', () => {
  const characters = ref<Character<AnySheet>[]>([])
  const loaded = ref(false)
  const loading = ref(false)

  async function fetchMine(force = false) {
    const auth = useAuthStore()
    if (!auth.userId || (loaded.value && !force)) return
    loading.value = true
    try {
      const { data, error } = await supabase
        .from('characters')
        .select('*')
        .eq('user_id', auth.userId)
        .order('created_at')
      if (error) throw error
      characters.value = (data as Character[]).map(hydrate)
      loaded.value = true
    } finally {
      loading.value = false
    }
  }

  /** Loads one character; works for the owner and for the GM of its campaign. */
  async function fetchOne(id: string): Promise<Character<AnySheet> | null> {
    const { data, error } = await supabase.from('characters').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data ? hydrate(data as Character) : null
  }

  async function create(system: GameSystem, name: string) {
    const { data, error } = await supabase
      .from('characters')
      .insert({ system, name, sheet: defaultSheet(system) })
      .select()
      .single()
    if (error) throw error
    const created = hydrate(data as Character)
    characters.value.push(created)
    return created
  }

  async function save(
    id: string,
    patch: Partial<Pick<Character<AnySheet>, 'name' | 'level' | 'sheet' | 'portrait_path'>>,
  ) {
    const { data, error } = await supabase
      .from('characters')
      .update(patch)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    const saved = hydrate(data as Character)
    const idx = characters.value.findIndex((c) => c.id === id)
    if (idx >= 0) characters.value.splice(idx, 1, saved)
    return saved
  }

  async function remove(id: string) {
    const target = characters.value.find((c) => c.id === id)
    const { error } = await supabase.from('characters').delete().eq('id', id)
    if (error) throw error
    if (target?.portrait_path) {
      await supabase.storage.from('portraits').remove([target.portrait_path])
    }
    characters.value = characters.value.filter((c) => c.id !== id)
  }

  /** Uploads a portrait and returns its storage path. */
  async function uploadPortrait(characterId: string, file: File) {
    const auth = useAuthStore()
    const ext = (file.name.split('.').pop() ?? 'png').toLowerCase().replace(/[^a-z0-9]/g, '')
    const path = `${auth.userId}/${characterId}-${Date.now()}.${ext || 'png'}`
    const { error } = await supabase.storage
      .from('portraits')
      .upload(path, file, { contentType: file.type, upsert: true })
    if (error) throw error
    return path
  }

  function reset() {
    characters.value = []
    loaded.value = false
  }

  return {
    characters,
    loaded,
    loading,
    fetchMine,
    fetchOne,
    create,
    save,
    remove,
    uploadPortrait,
    reset,
  }
})

export function portraitUrl(path: string | null | undefined): string | null {
  if (!path) return null
  return supabase.storage.from('portraits').getPublicUrl(path).data.publicUrl
}
