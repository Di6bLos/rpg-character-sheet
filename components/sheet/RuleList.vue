<script setup lang="ts">
// A comma-separated line of rules words, each with its rules on hover when it has any: a
// Nimble weapon's properties ("2-handed, Range 12, Vicious").
defineProps<{ parts: { label: string; title?: string; text?: string }[] }>()
</script>

<template>
  <span
    ><template v-for="(p, i) in parts" :key="i"
      >{{ i ? ', ' : ''
      }}<SheetRuleTip :title="p.title" :text="p.text">{{ p.label }}</SheetRuleTip></template
    ></span
  >
</template>
