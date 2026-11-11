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
          Up to five heroes across D&amp;D 5e, Pathfinder 2e and Nimble. Open one to play or edit
          it.
        </p>
      </div>
    </header>
    <CharacterSlots heading-id="chars-h" />
  </div>
</template>
