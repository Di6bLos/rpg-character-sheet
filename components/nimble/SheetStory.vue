<script setup lang="ts">
// The hero's background story, written by the player (the rules background is in Identity).
import type { NimbleSheet } from '~/types/sheets'

const { draft, canEdit } = useSheet<NimbleSheet>()
const sheet = computed(() => draft.value.sheet)
</script>

<template>
  <section class="panel stack story" aria-labelledby="nb-story-h">
    <div class="title-help story__head">
      <h2 id="nb-story-h">Background</h2>
      <UiHelp
        label="About the background story"
        text="Your hero's story in your own words: where they come from, who they've lost, what drives them. Your GM can read it too."
      />
      <span v-if="sheet.background" class="small muted">Background: {{ sheet.background }}</span>
    </div>
    <textarea
      v-if="canEdit"
      v-model="sheet.backstory"
      class="input story__text"
      rows="5"
      aria-labelledby="nb-story-h"
      placeholder="Where does your hero come from? Who did they leave behind, and what are they looking for?"
    />
    <p v-else-if="sheet.backstory" class="story__read">{{ sheet.backstory }}</p>
    <p v-else class="small muted">No background story yet.</p>
  </section>
</template>

<style scoped lang="scss">
.story {
  gap: 10px;
}

.story__head {
  margin: 0;
}

.story__read {
  white-space: pre-wrap;
  font-size: 15px;
  line-height: 1.55;
}

.story__text {
  min-height: 7.5em;
  field-sizing: content;
  max-height: 60vh;
  font-size: 15px;
  line-height: 1.55;
  resize: vertical;
}
</style>
