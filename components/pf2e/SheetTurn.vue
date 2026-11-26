<script setup lang="ts">
// The PF2e sheet's turn tracker (Player Core pp. 434–437): the shared SheetTurnPanel, filled
// by usePf2eTurnSteps (initiative to the GM's tracker, the action and reaction circles, the
// multiple attack penalty note, one step at a time).
const { model } = usePf2eTurnSteps()
</script>

<template>
  <SheetTurnPanel :turn="model" />
</template>
