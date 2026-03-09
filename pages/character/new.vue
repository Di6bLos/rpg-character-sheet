<script setup lang="ts">
import { ref } from 'vue'
import AppBar from '~/components/AppBar.vue'
import { useAuthStore } from '~/stores/auth'
import { useSnackbarStore } from '~/stores/snackbar'
import { useCharacter } from '~/composables/useCharacter'
import type { CharacterFormData, LevelUpEditableField } from '~/types'

definePageMeta({ middleware: 'auth' })

const authStore = useAuthStore()
const snackbar = useSnackbarStore()
const { createCharacter, updateCharacter, uploadImage } = useCharacter()
const router = useRouter()

const form = ref<CharacterFormData>({
    name: '',
    image_url: null,
    level: 1,
    class: '',
    race: '',
    str: 10,
    dex: 10,
    int: 10,
    wil: 10,
    armor: 0,
    hit_points: 10,
    notes: '',
})

const imageFile = ref<File | null>(null)
const loading = ref(false)
const error = ref('')

const statFields = [
    { key: 'str' as const, label: 'STR' },
    { key: 'dex' as const, label: 'DEX' },
    { key: 'int' as const, label: 'INT' },
    { key: 'wil' as const, label: 'WIL' },
    { key: 'armor' as const, label: 'Armor' },
    { key: 'hit_points' as const, label: 'HP' },
] satisfies Array<{ key: LevelUpEditableField; label: string }>

const nameRules = [(v: string) => !!v || 'Name is required']

function handleImageChange(files: File | File[] | null | undefined) {
    if (!files) {
        imageFile.value = null
    } else if (Array.isArray(files)) {
        imageFile.value = files[0] ?? null
    } else {
        imageFile.value = files
    }
}

async function handleSubmit() {
    error.value = ''
    loading.value = true
    try {
        const id = await createCharacter(form.value)
        if (imageFile.value && authStore.session) {
            const imageUrl = await uploadImage(authStore.session.user.id, id, imageFile.value)
            await updateCharacter(id, { image_url: imageUrl })
        }
        snackbar.show('Character created!')
        router.push({ name: 'character-id', params: { id } })
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Failed to create character'
    } finally {
        loading.value = false
    }
}
</script>

<template>
    <AppBar />
    <v-main>
        <v-container max-width="600">
            <v-row align="center" class="mb-4">
                <v-col>
                    <h1 class="text-h5">New Character</h1>
                </v-col>
                <v-col cols="auto">
                    <v-btn variant="text" :to="{ name: 'dashboard' }">Cancel</v-btn>
                </v-col>
            </v-row>

            <v-alert v-if="error" type="error" class="mb-4" density="compact" closable>
                {{ error }}
            </v-alert>

            <v-form @submit.prevent="handleSubmit">
                <v-text-field v-model="form.name" label="Name" :rules="nameRules" class="mb-2" />
                <v-text-field v-model="form.race" label="Race" class="mb-2" />
                <v-text-field v-model="form.class" label="Class" class="mb-2" />
                <v-file-input
                    label="Character Image"
                    accept="image/*"
                    class="mb-2"
                    prepend-icon="mdi-image"
                    @update:model-value="handleImageChange"
                />

                <v-row class="mb-2">
                    <v-col v-for="stat in statFields" :key="stat.key" cols="6" sm="4">
                        <v-text-field
                            :model-value="form[stat.key]"
                            :label="stat.label"
                            type="number"
                            density="compact"
                            variant="outlined"
                            @update:model-value="(v) => (form[stat.key] = Number(v))"
                        />
                    </v-col>
                </v-row>

                <v-textarea v-model="form.notes" label="Notes" rows="3" class="mb-4" />
                <v-btn type="submit" color="primary" block :loading="loading" size="large">
                    Create Character
                </v-btn>
            </v-form>
        </v-container>
    </v-main>
</template>
