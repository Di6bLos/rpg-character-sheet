<script setup lang="ts">
// The GM's encounter grid (battle board centre): a card per enemy (monsters and NPCs),
// or with the chip, per ally and summon (heroes included). Clicking a creature selects
// it into the stat block; a hero shows their vitals there instead (GmHero). Remove asks first.
import type { RosterEntry } from '~/types'
import type { TurnRow, useInitiative } from '~/composables/useInitiative'
import { sortOrder } from '~/utils/initiative'

const props = defineProps<{
  init: ReturnType<typeof useInitiative>
  roster: RosterEntry[]
  /** The GM's explicit pick (a card or token click), without the acting-creature fallback. */
  picked?: string | null
}>()
const selected = defineModel<string | null>('selected', { required: true })
const emit = defineEmits<{ hero: [characterId: string] }>()

const { npcFor } = useCombatantNpcs(props.init)

const isEnemy = (c: TurnRow) => c.kind === 'monster' || c.kind === 'npc'
const enemies = computed(() => sortOrder(props.init.rows.value.filter(isEnemy)))
const allies = computed(() => sortOrder(props.init.rows.value.filter((c) => !isEnemy(c))))
const filter = ref<'enemies' | 'allies'>('enemies')
const shown = computed(() => (filter.value === 'enemies' ? enemies.value : allies.value))

function heroFor(c: TurnRow) {
  return c.character_id ? props.roster.find((r) => r.character_id === c.character_id) : undefined
}

function onSelect(c: TurnRow) {
  if (c.kind === 'pc') {
    // Only seated heroes have a card to open; the RPC refuses the others.
    if (c.character_id && heroFor(c)) emit('hero', c.character_id)
    return
  }
  selected.value = c.id
}

// An explicit pick in the other group (a token click) shows that group. The selection
// falling back to the acting creature as turns pass leaves the chip alone.
watch(
  () => props.picked,
  (id) => {
    const c = props.init.rows.value.find((r) => r.id === id)
    if (c) filter.value = isEnemy(c) ? 'enemies' : 'allies'
  },
)

// --- Remove ---------------------------------------------------------------------------
const removing = ref<TurnRow | null>(null)
const removeOpen = computed({
  get: () => removing.value !== null,
  set: (on: boolean) => {
    if (!on) removing.value = null
  },
})
const busy = ref(false)

async function confirmRemove() {
  const c = removing.value
  if (!c) return
  busy.value = true
  try {
    await props.init.remove(c)
    if (selected.value === c.id) selected.value = null
    removing.value = null
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="panel enc" aria-labelledby="enc-h">
    <header class="enc__head">
      <h2 id="enc-h">Encounter</h2>
      <div class="enc__chips" role="group" aria-label="Show">
        <button
          type="button"
          class="enc__chip"
          :aria-pressed="filter === 'enemies'"
          @click="filter = 'enemies'"
        >
          Enemies ({{ enemies.length }})
        </button>
        <button
          type="button"
          class="enc__chip"
          :aria-pressed="filter === 'allies'"
          @click="filter = 'allies'"
        >
          Allies &amp; summons ({{ allies.length }})
        </button>
      </div>
      <span class="enc__legend">Type a number, then press − or +</span>
    </header>
    <div class="enc__scroll">
      <p v-if="!shown.length" class="enc__empty">
        {{
          filter === 'enemies'
            ? 'No enemies in the encounter. Add creatures from the turn bar or the NPCs page.'
            : 'No heroes or summons in the encounter yet.'
        }}
      </p>
      <div v-else class="enc__grid">
        <BattleEncounterCard
          v-for="c in shown"
          :key="c.id"
          :init="init"
          :c="c"
          :npc="npcFor(c)"
          :hero="heroFor(c)"
          :selected="c.id === selected"
          :acting="c.id === init.turnId.value"
          @select="onSelect(c)"
          @remove="removing = c"
        />
      </div>
    </div>
    <UiDialog v-model="removeOpen" title="Remove from the encounter?" width="420px" alert>
      <p>{{ removing?.name }} leaves the turn order. Its index entry and journal page stay.</p>
      <div class="row" style="justify-content: flex-end">
        <button type="button" class="btn btn--ghost" @click="removing = null">Cancel</button>
        <button type="button" class="btn btn--danger" :disabled="busy" @click="confirmRemove">
          Remove
        </button>
      </div>
    </UiDialog>
  </section>
</template>

<style scoped lang="scss">
.enc {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
}

.enc__head {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;

  h2 {
    margin: 0 4px 0 0;
    font-family: var(--font-heading);
    font-size: 16px;
  }
}

.enc__chips {
  display: flex;
  gap: 4px;
}

.enc__chip {
  min-height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: transparent;
  color: var(--page-soft);
  font-size: 12px;
  font-weight: 600;

  &[aria-pressed='true'] {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent);
  }
}

.enc__legend {
  margin-left: auto;
  font-size: 11px;
  color: var(--page-muted);
}

.enc__scroll {
  // Contains the .sr-only text, which would otherwise escape the scroller and scroll the page.
  position: relative;
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--line-strong) transparent;
  padding: 2px;
}

.enc__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 8px;
  align-content: start;
}

.enc__empty {
  margin: 0;
  font-size: 13px;
  color: var(--page-muted);
}
</style>
