<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
useHead({ title: 'Characters · Lantern' })
</script>

<template>
  <div class="page">
    <header class="page-head">
      <div>
        <h1>Characters</h1>
        <p>
          Up to five heroes across Nimble, Pathfinder 2e and D&amp;D 5e. Open one to play or edit
          it.
        </p>
      </div>
    </header>
    <CharacterSlots heading-id="chars-h" />
  </div>
</template>
