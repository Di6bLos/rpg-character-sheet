import { ref, computed } from 'vue'
import { useCharacterStore } from '~/stores/character'

export function useCharacter() {
    const store = useCharacterStore()
    const route = useRoute()

    const loading = ref(false)
    const error = ref('')

    const character = computed(() => store.currentCharacter)

    async function fetchCharacter(id?: string) {
        const charId = id ?? (route.params['id'] as string)
        loading.value = true
        error.value = ''
        try {
            await store.fetchCharacter(charId)
        } catch (e) {
            error.value = e instanceof Error ? e.message : 'Failed to load character'
        } finally {
            loading.value = false
        }
    }

    return {
        character,
        loading,
        error,
        fetchCharacter,
        createCharacter: store.createCharacter,
        updateCharacter: store.updateCharacter,
        deleteCharacter: store.deleteCharacter,
        levelUp: store.levelUp,
        uploadImage: store.uploadImage,
    }
}
