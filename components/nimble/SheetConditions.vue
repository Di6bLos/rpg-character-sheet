<script setup lang="ts">
// Conditions: tap to toggle. Bloodied, Dying and Wounded follow HP and Wounds. The block is the
// shared SheetConditions; useNimbleConditions fills it.
import type { ConditionEnd } from '~/types/sheets'

const { conditions, active, effects, statuses, setEnd, end, toggle, ENDS } = useNimbleConditions()

const groups = computed(() => [
  {
    chips: conditions.value
      .filter((x) => !x.spell)
      .map((c) => ({
        name: c.name,
        on: c.on,
        disabled: c.automatic,
        title: c.automatic ? `${c.desc} Set automatically.` : c.desc,
      })),
  },
  {
    label: 'Spell and ally statuses',
    chips: conditions.value
      .filter((x) => x.spell)
      .map((c) => ({ name: c.name, on: c.on, title: c.desc })),
  },
])
const lines = computed(() =>
  active.value.map((c) => ({
    name: c.name,
    label: c.name,
    desc: c.desc,
    end: c.automatic || c.fromEffect ? null : c.end,
  })),
)

function onEnd(name: string, end: string) {
  setEnd(name, end as ConditionEnd | 'manual')
}
</script>

<template>
  <SheetConditions
    :groups="groups"
    :active="lines"
    :ends="ENDS"
    :effects="effects"
    :statuses="statuses"
    @toggle="toggle"
    @set-end="onEnd"
    @end="end"
  />
</template>
