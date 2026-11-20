<script setup lang="ts">
// The GM's left column on the battle board: the selected creature. Name editable in
// place (this combatant only), size / type / level, the HP bar with amount, −, + and Set,
// tiles for Armor, Speed, Initiative and Actions (max editable), conditions with Add,
// then the linked stat block's entries with Roll buttons and GM notes. A custom
// combatant with no stat block shows the numbers only.
import type { TurnRow, useInitiative } from '~/composables/useInitiative'
import { statTop } from '~/composables/useCombatantNpcs'
import { statBlockSubtitle } from '~/utils/npcStatBlock'

const props = defineProps<{
  init: ReturnType<typeof useInitiative>
  combatantId: string | null
}>()

const { npcFor } = useCombatantNpcs(props.init)
const uid = useId()

const c = computed<TurnRow | undefined>(() =>
  props.init.rows.value.find((r) => r.id === props.combatantId),
)
const npc = computed(() => npcFor(c.value))

const KIND = { pc: 'Hero', npc: 'NPC', monster: 'Monster', summon: 'Summon' } as const
const sub = computed(() => {
  const n = npc.value
  if (!n) return c.value ? `${KIND[c.value.kind]} · custom` : ''
  return [statBlockSubtitle(n.stat_block), n.level ? `Level ${n.level}` : '']
    .filter(Boolean)
    .join(' · ')
})

// --- Name ------------------------------------------------------------------------------
const name = ref('')
watch(
  () => c.value?.name,
  (n) => {
    name.value = n ?? ''
  },
  { immediate: true },
)
async function saveName() {
  const row = c.value
  if (!row || name.value.trim() === row.name) return
  if (!(await props.init.rename(row, name.value))) name.value = row.name
}
function resetName(event: KeyboardEvent) {
  name.value = c.value?.name ?? ''
  ;(event.target as HTMLInputElement).blur()
}

// --- Tiles -----------------------------------------------------------------------------
const armor = computed(() => statTop(npc.value, 'Armor') || String(c.value?.ac ?? '—'))
const speed = computed(() => statTop(npc.value, 'Speed') || '—')
function onMax(event: Event) {
  const v = Number((event.target as HTMLInputElement).value)
  if (c.value && Number.isFinite(v)) void props.init.setActions(c.value, { actions_max: v })
}
</script>

<template>
  <section class="panel sbk" aria-label="Selected creature">
    <p v-if="!c" class="sbk__empty">
      Select a creature on the encounter grid or the initiative strip to see its stat block.
    </p>
    <template v-else>
      <span class="sbk__eyebrow">Selected · click a creature to switch</span>
      <label class="sr-only" :for="`${uid}-name`">Name</label>
      <input
        :id="`${uid}-name`"
        v-model="name"
        class="sbk__name"
        maxlength="80"
        @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
        @keydown.esc.prevent="resetName"
        @blur="saveName"
      />
      <span v-if="sub" class="sbk__sub">{{ sub }}</span>

      <BattleStatBlockHp :init="init" :c="c" />

      <div class="sbk__tiles">
        <div class="sbk__tile">
          <b>{{ armor }}</b
          ><span>Armor</span>
        </div>
        <div class="sbk__tile">
          <b>{{ speed }}</b
          ><span>Speed</span>
        </div>
        <div class="sbk__tile">
          <b>{{ c.initiative }}</b
          ><span>Init</span>
        </div>
        <div class="sbk__tile">
          <b
            >{{ c.actions_used ?? 0 }}/<input
              class="sbk__max"
              type="number"
              min="0"
              max="9"
              :value="c.actions_max ?? 0"
              :aria-label="`${c.name}: actions per turn`"
              @change="onMax"
          /></b>
          <span>Actions</span>
        </div>
      </div>

      <BattleStatBlockConditions :init="init" :c="c" />

      <template v-if="npc">
        <hr class="sbk__rule" />
        <BattleStatBlockEntries :npc="npc" :name="c.name" />
      </template>
      <p v-else-if="c.campaign_npc_id" class="sbk__muted">Loading the stat block…</p>
    </template>
  </section>
</template>

<style scoped lang="scss">
.sbk {
  // Contains the .sr-only text, which would otherwise escape the scroller and scroll the page.
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
}

.sbk__empty,
.sbk__muted {
  margin: 0;
  font-size: 12.5px;
  color: var(--page-muted);
}

.sbk__eyebrow {
  font-size: 11px;
  color: var(--page-muted);
}

.sbk__name {
  width: 100%;
  padding: 2px 0;
  border: 0;
  border-bottom: 1px dashed var(--line-strong);
  background: transparent;
  color: var(--page-text);
  font-family: var(--font-heading);
  font-size: 18px;
  font-weight: 700;

  &:focus {
    outline: none;
    border-bottom-color: var(--accent);
  }
}

.sbk__sub {
  margin-top: -4px;
  font-size: 12px;
  color: var(--page-muted);
}

.sbk__tiles {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.sbk__tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 7px 4px;
  border-radius: min(var(--radius-panel), 8px);
  border: 1px solid var(--line);
  background: var(--field);

  b {
    display: flex;
    align-items: baseline;
    font-size: 15px;
    font-variant-numeric: tabular-nums;
  }

  span {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--page-muted);
  }
}

.sbk__max {
  width: 2ch;
  padding: 0;
  border: 0;
  border-bottom: 1px dashed var(--line-strong);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: center;
  appearance: textfield;

  &::-webkit-inner-spin-button,
  &::-webkit-outer-spin-button {
    appearance: none;
    margin: 0;
  }

  &:focus {
    outline: none;
    border-bottom-color: var(--accent);
  }
}

.sbk__rule {
  width: 100%;
  margin: 2px 0;
  border: 0;
  border-top: 1px solid var(--line);
}
</style>
