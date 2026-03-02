<script setup lang="ts">
import type { Character } from '@/types'

defineProps<{
  character: Character
}>()
</script>

<template>
  <v-card
    :to="{ name: 'character-view', params: { id: character.id } }"
    class="character-card"
    hover
  >
    <v-img :src="character.image_url ?? undefined" height="180" cover>
      <template #placeholder>
        <div class="d-flex align-center justify-center fill-height">
          <v-icon size="64" color="grey-lighten-1">mdi-shield-sword</v-icon>
        </div>
      </template>
    </v-img>
    <v-card-title>{{ character.name }}</v-card-title>
    <v-card-subtitle>Level {{ character.level }} {{ character.race }} {{ character.class }}</v-card-subtitle>
  </v-card>
</template>
