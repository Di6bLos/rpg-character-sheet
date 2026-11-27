<script setup lang="ts">
// The 5e sheet's turn tracker (SRD 5.2.1 pp. 9–13): the shared SheetTurnPanel, filled by
// useDnd5eTurnSteps (Initiative to the GM's tracker, the action, Bonus Action, Reaction and
// object interaction circles, movement, one step at a time).
const { model } = useDnd5eTurnSteps()
</script>

<template>
  <SheetTurnPanel :turn="model" />
</template>
