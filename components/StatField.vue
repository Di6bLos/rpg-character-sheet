<script setup lang="ts">
defineProps<{
    label: string
    modelValue: number
    editable: boolean
}>()

defineEmits<{
    'update:modelValue': [value: number]
}>()
</script>

<template>
    <div>
        <v-text-field
            v-if="editable"
            type="number"
            :label="label"
            :model-value="modelValue"
            density="compact"
            variant="outlined"
            @update:model-value="$emit('update:modelValue', Number($event))"
        />
        <v-chip v-else variant="outlined" class="ma-1">{{ label }}: {{ modelValue }}</v-chip>
    </div>
</template>
