<script setup lang="ts">
// Under a 5e roll: what can still change it (utils/dnd5eRerolls.ts): Heroic Inspiration, an
// ally's Bardic Inspiration die, Indomitable, Flash of Genius, Portent's foretold d20s…, each a
// button that pays it and says the new total; with `pre`, before the next roll: a Luck Point or
// Tides of Chaos for Advantage. Rerolls show for the last roll whose key starts with `scope`.
import type { Dnd5eSheet } from '~/types/sheets'
import { showOutcome } from '~/utils/dice'
import { preRollOptions, rerollOptions, usePreRoll, useReroll } from '~/utils/dnd5eRerolls'

const props = defineProps<{ scope?: string; pre?: boolean }>()
const { draft, canEdit, say } = useSheet<Dnd5eSheet>()
const { claim } = useResultOwner()
const { lastRoll, columns } = useDnd5eSheet()
const sheet = computed(() => draft.value.sheet)
const level = computed(() => draft.value.level)

const last = computed(() =>
  props.scope && lastRoll.value?.key.startsWith(props.scope) ? lastRoll.value : null,
)
const options = computed(() =>
  last.value ? rerollOptions(sheet.value, level.value, last.value, columns.value) : [],
)
const before = computed(() => (props.pre ? preRollOptions(sheet.value, level.value) : []))

function use(key: string, portent?: number) {
  const l = last.value
  if (!canEdit.value || !l) return
  const r = useReroll(sheet.value, level.value, l, key, {
    cols: columns.value,
    ...(portent !== undefined ? { portent } : {}),
  })
  if (!r) return
  lastRoll.value = { ...l }
  claim(l.key, () => say(r.line))
  showOutcome({ label: l.test.label, total: r.result.total, detail: r.line })
}

function buy(key: string) {
  if (!canEdit.value) return
  const line = usePreRoll(sheet.value, level.value, key)
  if (line) say(line)
}
</script>

<template>
  <div
    v-if="before.length || options.length"
    class="after"
    role="group"
    aria-label="Change the roll"
  >
    <button
      v-for="o in before"
      :key="o.key"
      type="button"
      class="chip after__chip"
      :aria-pressed="o.why === 'On'"
      :disabled="!canEdit || !!o.why"
      :title="o.why && o.why !== 'On' ? `${o.why}\n${o.title}` : o.title"
      @click="buy(o.key)"
    >
      {{ o.name }}
    </button>
    <template v-for="o in options" :key="o.key">
      <template v-if="o.key === 'portent' && !o.why">
        <button
          v-for="(v, i) in sheet.portent ?? []"
          :key="`p${i}`"
          type="button"
          class="chip after__chip"
          :disabled="!canEdit"
          :title="o.title"
          @click="use('portent', i)"
        >
          Portent {{ v }}
        </button>
      </template>
      <button
        v-else
        type="button"
        class="chip after__chip"
        :disabled="!canEdit || !!o.why"
        :title="o.why ? `${o.why}\n${o.title}` : o.title"
        @click="use(o.key)"
      >
        {{ o.name }}
      </button>
    </template>
  </div>
</template>

<style scoped lang="scss">
.after {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.after__chip {
  min-height: 30px;
  padding: 0 10px;
  font-size: 12px;

  &[aria-pressed='true'] {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, transparent);
  }
}

@media (pointer: coarse) {
  .after__chip {
    min-height: 44px;
  }
}
</style>
