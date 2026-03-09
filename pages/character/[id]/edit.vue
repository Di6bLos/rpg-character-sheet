<script setup lang="ts">
import { ref, onMounted } from 'vue'
import AppBar from '~/components/AppBar.vue'
import { useAuthStore } from '~/stores/auth'
import { useSnackbarStore } from '~/stores/snackbar'
import { useCharacter } from '~/composables/useCharacter'
import type { CharacterFormData, LevelUpEditableField } from '~/types'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const snackbar = useSnackbarStore()
const { character, fetchCharacter, updateCharacter, deleteCharacter, uploadImage } = useCharacter()

const id = route.params['id'] as string

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
const deleteDialog = ref(false)

const statFields = [
    { key: 'str' as const, label: 'STR' },
    { key: 'dex' as const, label: 'DEX' },
    { key: 'int' as const, label: 'INT' },
    { key: 'wil' as const, label: 'WIL' },
    { key: 'armor' as const, label: 'Armor' },
    { key: 'hit_points' as const, label: 'HP' },
] satisfies Array<{ key: LevelUpEditableField; label: string }>

onMounted(async () => {
    await fetchCharacter(id)
    const char = character.value
    if (char) {
        form.value = {
            name: char.name,
            image_url: char.image_url,
            level: char.level,
            class: char.class,
            race: char.race,
            str: char.str,
            dex: char.dex,
            int: char.int,
            wil: char.wil,
            armor: char.armor,
            hit_points: char.hit_points,
            notes: char.notes,
        }
    }
})

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
        let updates: Partial<CharacterFormData> = { ...form.value }
        if (imageFile.value && authStore.session) {
            const imageUrl = await uploadImage(authStore.session.user.id, id, imageFile.value)
            updates = { ...updates, image_url: imageUrl }
        }
        await updateCharacter(id, updates)
        snackbar.show('Character saved!')
        router.push({ name: 'character-id', params: { id } })
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Failed to save character'
    } finally {
        loading.value = false
    }
}

async function handleDelete() {
    deleteDialog.value = false
    await deleteCharacter(id)
    router.push({ name: 'dashboard' })
}
</script>

<template>
    <AppBar />
    <v-main>
        <v-container max-width="600">
            <v-row align="center" class="mb-4">
                <v-col>
                    <h1 class="text-h5">Edit Character</h1>
                </v-col>
                <v-col cols="auto">
                    <v-btn variant="text" @click="router.back()">Cancel</v-btn>
                </v-col>
            </v-row>

            <v-alert v-if="error" type="error" class="mb-4" density="compact" closable>
                {{ error }}
            </v-alert>

            <v-form @submit.prevent="handleSubmit">
                <v-text-field v-model="form.name" label="Name" class="mb-2" />
                <v-text-field v-model="form.race" label="Race" class="mb-2" />
                <v-text-field v-model="form.class" label="Class" class="mb-2" />
                <v-file-input
                    label="Replace Character Image"
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

                <v-row>
                    <v-col>
                        <v-btn
                            type="submit"
                            color="primary"
                            block
                            :loading="loading"
                            size="large"
                        >
                            Save
                        </v-btn>
                    </v-col>
                </v-row>

                <div class="mt-4 text-center">
                    <v-btn
                        color="error"
                        variant="text"
                        prepend-icon="mdi-delete"
                        @click="deleteDialog = true"
                    >
                        Delete Character
                    </v-btn>
                </div>
            </v-form>
        </v-container>
    </v-main>

    <v-dialog v-model="deleteDialog" max-width="400">
        <v-card>
            <v-card-title>Delete Character</v-card-title>
            <v-card-text>
                Are you sure you want to delete this character? This action cannot be undone.
            </v-card-text>
            <v-card-actions>
                <v-spacer />
                <v-btn @click="deleteDialog = false">Cancel</v-btn>
                <v-btn color="error" @click="handleDelete">Delete</v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>
