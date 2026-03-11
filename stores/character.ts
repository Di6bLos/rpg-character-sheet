import { ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '~/lib/supabase'
import { useAuthStore } from '~/stores/auth'
import type { Character, CharacterFormData } from '~/types'

export const useCharacterStore = defineStore('character', () => {
  const characters = ref<Character[]>([])
  const currentCharacter = ref<Character | null>(null)
  const loading = ref(false)

  async function fetchCharacters() {
    const authStore = useAuthStore()
    if (!authStore.session) return
    loading.value = true
    try {
      const { data, error } = await supabase
        .from('characters')
        .select('*')
        .eq('user_id', authStore.session.user.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      characters.value = (data as Character[] | null) ?? []
    } finally {
      loading.value = false
    }
  }

  async function fetchCharacter(id: string) {
    const { data } = await supabase.from('characters').select('*').eq('id', id).single()
    currentCharacter.value = data as Character | null
  }

  async function createCharacter(formData: CharacterFormData): Promise<string> {
    const authStore = useAuthStore()
    if (!authStore.session) throw new Error('Not authenticated')
    const { data, error } = await supabase
      .from('characters')
      .insert({ ...formData, user_id: authStore.session.user.id })
      .select('id')
      .single()
    if (error) throw error
    return (data as { id: string }).id
  }

  async function updateCharacter(id: string, updates: Partial<CharacterFormData>) {
    const { data, error } = await supabase
      .from('characters')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    const updated = data as Character
    if (currentCharacter.value?.id === id) {
      currentCharacter.value = updated
    }
    const idx = characters.value.findIndex((c) => c.id === id)
    if (idx !== -1) {
      characters.value.splice(idx, 1, updated)
    }
  }

  async function levelUp(id: string, currentLevel: number) {
    await updateCharacter(id, { level: currentLevel + 1 })
  }

  async function uploadImage(userId: string, characterId: string, file: File): Promise<string> {
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${userId}/${characterId}.${ext}`
    const { error } = await supabase.storage.from('character-images').upload(path, file, { upsert: true })
    if (error) throw error
    const { data } = supabase.storage.from('character-images').getPublicUrl(path)
    return data.publicUrl
  }

  async function deleteCharacter(id: string) {
    const { error } = await supabase.from('characters').delete().eq('id', id)
    if (error) throw error
    characters.value = characters.value.filter((c) => c.id !== id)
    if (currentCharacter.value?.id === id) {
      currentCharacter.value = null
    }
  }

  return {
    characters,
    currentCharacter,
    loading,
    fetchCharacters,
    fetchCharacter,
    createCharacter,
    updateCharacter,
    levelUp,
    uploadImage,
    deleteCharacter,
  }
})
