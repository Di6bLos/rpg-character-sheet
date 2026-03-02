<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppBar from '@/components/AppBar.vue'
import StatField from '@/components/StatField.vue'
import { useCharacterStore } from '@/stores/character'
import type { LevelUpEditableField } from '@/types'

const route = useRoute()
const router = useRouter()
const characterStore = useCharacterStore()

const isLevelingUp = ref(false)
const editableStats = ref<Partial<Record<LevelUpEditableField, number>>>({})

const statFields = [
  { key: 'str' as const, label: 'STR' },
  { key: 'dex' as const, label: 'DEX' },
  { key: 'int' as const, label: 'INT' },
  { key: 'wil' as const, label: 'WIL' },
  { key: 'armor' as const, label: 'Armor' },
  { key: 'hit_points' as const, label: 'HP' },
] satisfies Array<{ key: LevelUpEditableField; label: string }>

const char = computed(() => characterStore.currentCharacter)

onMounted(async () => {
  await characterStore.fetchCharacter(route.params['id'] as string)
})

async function handleLevelUp() {
  const c = char.value
  if (!c) return
  await characterStore.levelUp(c.id, c.level)
  // Populate editableStats with values captured before levelUp updated the store
  editableStats.value = {
    str: c.str,
    dex: c.dex,
    int: c.int,
    wil: c.wil,
    armor: c.armor,
    hit_points: c.hit_points,
  }
  isLevelingUp.value = true
}

async function saveStatEdits() {
  const c = char.value
  if (!c) return
  await characterStore.updateCharacter(c.id, editableStats.value)
  isLevelingUp.value = false
}
</script>

<template>
  <AppBar />
  <v-main>
    <v-container v-if="char" max-width="900">
      <v-row align="center" class="mb-4">
        <v-col>
          <h1 class="text-h4">{{ char.name }}</h1>
          <p class="text-subtitle-1 text-medium-emphasis">{{ char.race }} {{ char.class }}</p>
        </v-col>
        <v-col cols="auto" class="d-flex align-center ga-2">
          <v-chip color="primary" size="large">Level {{ char.level }}</v-chip>
          <v-btn variant="text" :to="{ name: 'dashboard' }">Dashboard</v-btn>
        </v-col>
      </v-row>

      <v-row>
        <v-col cols="12" md="4">
          <v-img :src="char.image_url ?? undefined" height="300" cover rounded="lg">
            <template #placeholder>
              <div class="d-flex align-center justify-center fill-height">
                <v-icon size="80" color="grey-lighten-1">mdi-shield-sword</v-icon>
              </div>
            </template>
          </v-img>
        </v-col>

        <v-col cols="12" md="8">
          <v-row>
            <v-col v-for="field in statFields" :key="field.key" cols="6" sm="4">
              <StatField
                :label="field.label"
                :model-value="
                  isLevelingUp
                    ? (editableStats[field.key] ?? char[field.key])
                    : char[field.key]
                "
                :editable="isLevelingUp"
                @update:model-value="editableStats[field.key] = $event"
              />
            </v-col>
          </v-row>

          <v-textarea
            :model-value="char.notes"
            label="Notes"
            readonly
            rows="4"
            class="mt-4"
            variant="outlined"
          />
        </v-col>
      </v-row>

      <v-row class="mt-4">
        <v-col>
          <div class="d-flex ga-2">
            <v-btn v-if="!isLevelingUp" color="secondary" @click="handleLevelUp">
              <v-icon start>mdi-chevron-double-up</v-icon>
              Level Up
            </v-btn>
            <v-btn v-else color="success" @click="saveStatEdits">
              <v-icon start>mdi-check</v-icon>
              Save Stats
            </v-btn>
            <v-btn
              color="primary"
              variant="outlined"
              :to="{ name: 'character-edit', params: { id: char.id } }"
            >
              <v-icon start>mdi-pencil</v-icon>
              Edit
            </v-btn>
            <v-btn v-if="isLevelingUp" variant="text" @click="isLevelingUp = false">
              Cancel
            </v-btn>
          </div>
        </v-col>
      </v-row>
    </v-container>

    <v-container v-else class="text-center mt-8">
      <v-progress-circular indeterminate color="primary" />
    </v-container>
  </v-main>
</template>
