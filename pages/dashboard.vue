<script setup lang="ts">
import { onMounted } from 'vue'
import AppBar from '~/components/AppBar.vue'
import CharacterCard from '~/components/CharacterCard.vue'
import { useAuthStore } from '~/stores/auth'
import { useCharacterStore } from '~/stores/character'

definePageMeta({ middleware: 'auth' })

const authStore = useAuthStore()
const characterStore = useCharacterStore()

onMounted(() => {
    characterStore.fetchCharacters()
})
</script>

<template>
    <AppBar />
    <v-main>
        <v-container>
            <v-row align="center" class="mb-4">
                <v-col>
                    <h1 class="text-h5">
                        Welcome, {{ authStore.profile?.display_name ?? 'Adventurer' }}
                    </h1>
                </v-col>
                <v-col cols="auto" class="d-flex ga-2">
                    <v-btn
                        variant="tonal"
                        :to="{ name: 'documents' }"
                        prepend-icon="mdi-bookshelf"
                    >
                        <span class="d-none d-sm-inline">Documents</span>
                    </v-btn>
                    <v-btn color="primary" :to="{ name: 'character-new' }" prepend-icon="mdi-plus">
                        <span class="d-none d-sm-inline">Create Character</span>
                    </v-btn>
                </v-col>
            </v-row>

            <v-progress-linear
                v-if="characterStore.loading"
                indeterminate
                color="primary"
                class="mb-4"
            />

            <v-row v-if="characterStore.characters.length > 0">
                <v-col
                    v-for="character in characterStore.characters"
                    :key="character.id"
                    cols="12"
                    sm="6"
                    md="4"
                >
                    <CharacterCard :character="character" />
                </v-col>
            </v-row>

            <div v-else-if="!characterStore.loading" class="text-center mt-8">
                <v-icon size="80" color="grey">mdi-sword-cross</v-icon>
                <p class="text-body-1 mt-4">No characters yet. Create your first hero!</p>
            </div>
        </v-container>
    </v-main>
</template>
