<script setup lang="ts">
// The turn tracker: actions left this turn, and the Start turn / End turn / New encounter steps.
// The panel is the shared SheetTurnPanel; useTurnSteps fills it with Nimble's rules.
const { model } = useTurnSteps()
</script>

<template>
  <SheetTurnPanel :turn="model" />
</template>
