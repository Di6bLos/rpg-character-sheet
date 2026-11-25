<script setup lang="ts">
// D&D 5e has a bespoke layout per theme (design/screens/{Character,Gothic,Eldritch,Cursed}Sheet).
// The GM's HP and condition changes from the battle board apply here whichever theme is on.
const { theme } = useTheme()
useHeroHpChanges()
useHeroConditionChanges()
defineEmits<{ levelUp: [] }>()
</script>

<template>
  <SheetDnd5eGothic v-if="theme === 'gothic'" @level-up="$emit('levelUp')" />
  <SheetDnd5eEldritch v-else-if="theme === 'eldritch'" @level-up="$emit('levelUp')" />
  <SheetDnd5eCursed v-else-if="theme === 'cursed'" @level-up="$emit('levelUp')" />
  <SheetDnd5eClassic v-else />
</template>
