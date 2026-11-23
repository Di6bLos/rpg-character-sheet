<script setup lang="ts">
// One creature on the GM's encounter grid: portrait or initials, name (a pencil on hover
// renames it in place: Enter saves, Escape cancels), initiative, the HP bar with numbers,
// −5 / −1 / amount / +1 / +5 (EncounterHp), Armor (in the name row), conditions and action
// pips (EncounterPips, on the HP bar's row: a click spends the next one, a spent one refunds). Slain creatures
// grey out with Remove and Revive. Heroes take HP through their own sheet (a pickup).
import type { CampaignNpc, RosterEntry } from '~/types'
import { heroArmor } from '~/utils/nimbleConditions'
import type { TurnRow, useInitiative } from '~/composables/useInitiative'
import { statTop } from '~/composables/useCombatantNpcs'
import { turnActionsFor } from '~/utils/nimblePlay'

const props = defineProps<{
  init: ReturnType<typeof useInitiative>
  c: TurnRow
  npc?: CampaignNpc
  hero?: RosterEntry
  selected: boolean
  acting: boolean
}>()
const emit = defineEmits<{ select: []; remove: [] }>()

const heroHp = useSendHeroHp()

const isPc = computed(() => props.c.kind === 'pc')
const noHp = computed(() => !isPc.value && (props.c.hp_max ?? 0) <= 0)
const hp = computed(() => {
  if (isPc.value) {
    const s = props.hero?.summary
    return { now: s?.hp ?? 0, max: s?.hpMax ?? 0, temp: s?.tempHp ?? 0 }
  }
  return { now: props.c.hp ?? 0, max: props.c.hp_max ?? 0, temp: 0 }
})
const slain = computed(() => !isPc.value && hp.value.max > 0 && hp.value.now <= 0)
const armor = computed(() =>
  isPc.value
    ? String(
        heroArmor(
          props.hero?.summary?.ac,
          props.hero?.summary?.conditions,
          props.hero?.character_level,
        ) ??
          props.c.ac ??
          '—',
      )
    : statTop(props.npc, 'Armor') || String(props.c.ac ?? '—'),
)
const conditions = computed(() =>
  isPc.value ? (props.hero?.summary?.conditions ?? []) : (props.c.conditions ?? []),
)
const foot = computed(() => conditions.value.join(' · '))

/** Monsters' pips are the GM's to click; a hero's come from their sheet (read-only). */
const pips = computed(() => {
  if (isPc.value) {
    const s = props.hero?.summary
    if (!s) return null
    const max = turnActionsFor(s.abilityNames ?? [], !!s.dying)
    return { total: max, used: Math.min(Math.max(0, s.actionsSpent ?? 0), max) }
  }
  const total = props.c.actions_max ?? 0
  return total > 0 ? { total, used: Math.min(props.c.actions_used ?? 0, total) } : null
})

// --- HP: a creature's tracker copy, or a pickup for the hero's own sheet ----------------
function change(delta: number) {
  if (!delta) return
  if (isPc.value) {
    const id = props.c.character_id
    if (id) void heroHp.send(id, props.c.name, delta)
  } else {
    void props.init.adjustHp(props.c, delta)
  }
}

// --- Rename -----------------------------------------------------------------------
const editing = ref(false)
const draftName = ref('')
const input = ref<HTMLInputElement | null>(null)
const pen = ref<HTMLButtonElement | null>(null)

async function startRename() {
  draftName.value = props.c.name
  editing.value = true
  await nextTick()
  input.value?.select()
}

async function saveRename() {
  if (!editing.value) return
  editing.value = false
  if (draftName.value.trim() !== props.c.name) await props.init.rename(props.c, draftName.value)
  pen.value?.focus()
}

function cancelRename() {
  editing.value = false
  pen.value?.focus()
}

function onInit(event: Event) {
  const raw = (event.target as HTMLInputElement).value.trim()
  // A cleared field is not 0 (that would drop the creature to the bottom): ignore it.
  if (raw === '') return
  const v = Number(raw)
  if (Number.isFinite(v) && (v !== props.c.initiative || !props.c.initiative_rolled))
    void props.init.setInitiative(props.c, v)
}

// --- Tooltip ----------------------------------------------------------------------
const tipSub = computed(() =>
  [
    props.npc?.level ? `Level ${props.npc.level}` : '',
    `Armor ${armor.value}`,
    statTop(props.npc, 'Speed') ? `Speed ${statTop(props.npc, 'Speed')}` : '',
  ]
    .filter(Boolean)
    .join(' · '),
)
const tipText = computed(() =>
  (props.npc?.stat_block.sections ?? [])
    .flatMap((s) => s.items)
    .slice(0, 3)
    .map((i) => `${i.n}${i.n ? ': ' : ''}${i.t}`)
    .join('\n'),
)
const tipKeys = computed(() =>
  isPc.value ? 'Click for their stats' : props.selected ? 'Selected' : 'Click to select',
)
</script>

<template>
  <UiTooltip :title="c.name" :sub="tipSub" :text="tipText" :keys="tipKeys">
    <article
      class="ec"
      :class="{ 'is-sel': selected, 'is-acting': acting, 'is-slain': slain }"
      :aria-label="c.name"
      @click="emit('select')"
    >
      <div class="ec__top">
        <UiAvatar
          :name="c.name"
          :portrait-path="isPc ? hero?.summary?.portraitOverride || hero?.portrait_path : null"
          :src="isPc ? null : npcImageUrl(c.portrait_path)"
          :class-slug="hero?.summary?.classSlug ?? null"
          :square="c.kind === 'monster'"
          :faded="slain"
          :size="26"
        />
        <input
          v-if="editing"
          ref="input"
          v-model="draftName"
          class="ec__rename"
          maxlength="80"
          :aria-label="`New name for ${c.name}`"
          @click.stop
          @keydown.enter.prevent="saveRename"
          @keydown.esc.prevent.stop="cancelRename"
          @blur="saveRename"
        />
        <template v-else>
          <button
            type="button"
            class="ec__name"
            data-track="Select creature"
            :aria-pressed="selected"
          >
            {{ c.name }}
          </button>
          <button
            v-if="!isPc"
            ref="pen"
            type="button"
            class="ec__pen"
            data-track="Rename creature"
            :aria-label="`Rename ${c.name}`"
            title="Rename"
            @click.stop="startRename"
          >
            ✎
          </button>
        </template>
        <span class="ec__armor" title="Armor">
          <svg
            class="ec__shield"
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6l-8-3Z" />
          </svg>
          <span class="ec__armor-word">Armor </span><span class="sr-only ec__armor-sr">Armor </span
          >{{ armor }}
        </span>
        <label class="ec__init" title="Initiative" @click.stop>
          <span class="sr-only">Initiative for {{ c.name }}</span>
          <input
            type="number"
            :value="c.initiative_rolled ? c.initiative : ''"
            placeholder="–"
            inputmode="numeric"
            @change="onInit"
          />
        </label>
      </div>

      <div v-if="noHp" class="ec__nohp">
        <span>Dies to any damage</span>
        <!-- No HP to bring to 0, so these leave the order with Remove (asks first). -->
        <button type="button" class="btn btn--quiet btn--sm" @click.stop="emit('remove')">
          Remove
        </button>
      </div>
      <BattleEncounterHp
        v-else
        :name="c.name"
        :now="hp.now"
        :max="hp.max"
        :temp="hp.temp"
        :slain="slain"
        @change="change"
      >
        <BattleEncounterPips
          v-if="pips && !slain"
          :name="c.name"
          :total="pips.total"
          :used="pips.used"
          :readonly="isPc"
          @set="(used: number) => init.setActions(c, { actions_used: used })"
        />
      </BattleEncounterHp>
      <!-- A creature with no HP still has its pips. -->
      <BattleEncounterPips
        v-if="noHp && pips"
        class="ec__pips"
        :name="c.name"
        :total="pips.total"
        :used="pips.used"
        :readonly="isPc"
        @set="(used: number) => init.setActions(c, { actions_used: used })"
      />

      <div v-if="slain" class="ec__foot">
        <span class="ec__slain" @click.stop>
          <button type="button" class="btn btn--quiet btn--sm" @click="emit('remove')">
            Remove
          </button>
          <button type="button" class="btn btn--ghost btn--sm" @click="init.adjustHp(c, 1)">
            Revive
          </button>
        </span>
      </div>
      <p v-else-if="conditions.length" class="ec__foot ec__meta">{{ foot }}</p>
    </article>
  </UiTooltip>
</template>

<style scoped lang="scss">
.ec {
  container: ec / inline-size;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 6px 9px 7px;
  border-radius: var(--radius-control);
  border: 1px solid var(--line);
  background: var(--inset);
  color: var(--page-text);
  cursor: pointer;

  &:hover {
    border-color: var(--line-strong);
  }

  &.is-sel {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }

  &.is-acting {
    border-color: var(--accent);
    box-shadow:
      0 0 0 1px var(--accent),
      0 0 14px color-mix(in srgb, var(--accent) 30%, transparent);
  }

  &.is-slain {
    opacity: 0.55;
  }
}

.ec__top {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.ec__name {
  min-width: 0;
  flex: 0 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}

.ec__pen {
  flex: none;
  padding: 0 2px;
  border: 0;
  background: none;
  color: var(--page-muted);
  font-size: 12px;

  &:hover,
  &:focus-visible {
    color: var(--page-text);
  }
}

.ec__rename {
  flex: 1 1 auto;
  min-width: 0;
  padding: 2px 4px;
  border: 0;
  border-bottom: 1px dashed var(--line-strong);
  background: var(--field);
  color: var(--page-text);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
}

.ec__armor {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-left: auto;
  font-size: 11px;
  color: var(--page-muted);
  white-space: nowrap;
}

// Wide cards spell out "Armor None"; narrow ones (two columns at 1280px) show a shield,
// so the name keeps its room.
.ec__shield,
.ec__armor-sr {
  display: none;
}

@container ec (max-width: 300px) {
  .ec__shield {
    display: block;
  }

  .ec__armor-word {
    display: none;
  }

  .ec__armor-sr {
    display: inline;
  }
}

.ec__init {
  flex: none;

  input {
    width: 40px;
    padding: 2px 4px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--page-muted);
    font: inherit;
    font-size: 12px;
    text-align: right;
    font-variant-numeric: tabular-nums;
    appearance: textfield;

    &:hover,
    &:focus {
      border-color: var(--line-strong);
      background: var(--field);
      color: var(--page-text);
    }

    &::-webkit-inner-spin-button,
    &::-webkit-outer-spin-button {
      appearance: none;
      margin: 0;
    }
  }
}

.ec__nohp {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--page-muted);

  .btn {
    min-height: 28px;
    padding: 0 10px;
    font-size: 12px;
  }
}

.ec__foot {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 11px;
  color: var(--page-muted);
}

.ec__pips {
  align-self: flex-end;
}

.ec__meta {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ec__slain {
  display: flex;
  gap: 6px;
  cursor: default;

  .btn {
    min-height: 28px;
    padding: 0 10px;
    font-size: 12px;
  }
}
</style>
