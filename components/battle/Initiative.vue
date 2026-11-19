<script setup lang="ts">
// The battle board's initiative strip: one scrolling row of tokens in turn order.
// Heroes show their numbers and action pips from the roster; enemies show a band to
// players (numbers and pips for the GM). Summons sit under their summoner.
import type { RosterEntry } from '~/types'
import type { TurnRow, useInitiative } from '~/composables/useInitiative'
import { summonOwner } from '~/utils/initiative'

const props = defineProps<{
  init: ReturnType<typeof useInitiative>
  roster: RosterEntry[]
  gm: boolean
}>()
const emit = defineEmits<{
  hero: [characterId: string]
  select: [combatantId: string]
}>()

const auth = useAuthStore()

/** A hero's actions each turn: 3, or 1 while Dying (the roster has no ability list). */
const HERO_ACTIONS = 3

function rosterFor(c: TurnRow) {
  return c.character_id ? props.roster.find((r) => r.character_id === c.character_id) : undefined
}

function isMine(c: TurnRow) {
  return c.kind === 'pc' && !!c.character_id && rosterFor(c)?.user_id === auth.userId
}

function isDead(c: TurnRow) {
  const s = c.kind === 'pc' ? rosterFor(c)?.summary : undefined
  const max = s?.woundsMax ?? 0
  return !!s && max > 0 && (s.wounds ?? 0) >= max
}

function isDown(c: TurnRow) {
  if (c.kind === 'pc') {
    const hp = rosterFor(c)?.summary?.hp
    return hp !== undefined && hp <= 0
  }
  return c.hp_band === 'Down' || (c.kind === 'summon' && c.hp_max !== null && (c.hp ?? 0) <= 0)
}

/** "Next": only the viewer's own hero, when it is up right after the active combatant. */
const nextId = computed(() => {
  const order = props.init.order.value
  const at = order.findIndex((c) => c.id === props.init.activeId.value)
  if (at < 0 || order.length < 2) return null
  const after = order[(at + 1) % order.length]
  return after && isMine(after) ? after.id : null
})

function hpText(c: TurnRow): string {
  if (c.kind === 'pc') {
    const s = rosterFor(c)?.summary
    if (!s || s.hp === undefined) return ''
    const temp = s.tempHp ? ` +${s.tempHp}` : ''
    return `${s.hp} / ${s.hpMax ?? s.hp}${temp}`
  }
  if (props.gm) return c.hp !== null && (c.hp_max ?? 0) > 0 ? `${c.hp} / ${c.hp_max}` : ''
  return c.hp_band ?? ''
}

/** 0 to 1 for the minibar, only where the numbers are shown. */
function hpFill(c: TurnRow): number | null {
  if (c.kind === 'pc') {
    const s = rosterFor(c)?.summary
    if (!s || s.hp === undefined || !s.hpMax) return null
    return Math.min(1, Math.max(0, s.hp / s.hpMax))
  }
  if (props.gm && c.hp !== null && (c.hp_max ?? 0) > 0)
    return Math.min(1, Math.max(0, c.hp / (c.hp_max ?? 1)))
  return null
}

/** Action pips: heroes from the roster, monsters only for the GM; extra actions add pips. */
function pips(c: TurnRow): { total: number; used: number } | null {
  if (c.kind === 'pc') {
    const s = rosterFor(c)?.summary
    if (!s) return null
    const max = s.dying ? 1 : HERO_ACTIONS
    const spent = s.actionsSpent ?? 0
    return { total: Math.max(max, max - spent), used: Math.min(Math.max(0, spent), max) }
  }
  if (props.gm && c.actions_max !== null && c.actions_max !== undefined)
    return {
      total: c.actions_max,
      used: Math.min(c.actions_used ?? 0, c.actions_max),
    }
  return null
}

function conditions(c: TurnRow): string[] {
  return c.kind === 'pc' ? (rosterFor(c)?.summary?.conditions ?? []) : (c.conditions ?? [])
}

function portraitPath(c: TurnRow): string | null {
  const r = rosterFor(c)
  return r?.summary?.portraitOverride || (r?.portrait_path ?? c.portrait_path)
}

function summonName(c: TurnRow): string {
  if (!c.summon_key) return c.name
  const owner = summonOwner(c.summon_key)
  const id = c.summon_key.slice(owner.length + 1)
  const m = props.roster
    .find((r) => r.character_id === owner)
    ?.summary?.summons?.find((s) => s.id === id)
  return m?.name ?? c.name
}

function summonMember(c: TurnRow) {
  if (!c.summon_key) return undefined
  const owner = summonOwner(c.summon_key)
  const id = c.summon_key.slice(owner.length + 1)
  return props.roster
    .find((r) => r.character_id === owner)
    ?.summary?.summons?.find((s) => s.id === id)
}

function onToken(c: TurnRow) {
  if (c.kind === 'pc' && c.character_id) emit('hero', c.character_id)
  emit('select', c.id)
}

// Keep the acting token in view; scrollIntoView with block 'nearest' never moves the page.
const strip = ref<HTMLElement | null>(null)
watch(
  () => props.init.activeId.value,
  (id) => {
    if (!id) return
    nextTick(() => {
      const el = strip.value?.querySelector<HTMLElement>(`[data-token="${id}"]`)
      el?.scrollIntoView({ inline: 'center', block: 'nearest' })
    })
  },
  { flush: 'post' },
)
</script>

<template>
  <ol v-if="init.order.value.length" ref="strip" class="strip" aria-label="Turn order">
    <li
      v-for="c in init.order.value"
      :key="c.id"
      class="tok"
      :class="{
        'is-now': c.id === init.activeId.value,
        'is-mine': isMine(c),
        'is-foe': c.kind !== 'pc',
        'is-down': isDown(c),
      }"
      :aria-current="c.id === init.activeId.value ? 'step' : undefined"
    >
      <button
        type="button"
        class="tok__main"
        :data-token="c.id"
        :title="c.name"
        :aria-label="`${c.name}, initiative ${c.initiative}`"
        @click="onToken(c)"
      >
        <span class="tok__badges">
          <span v-if="c.id === init.activeId.value" class="tok__badge tok__badge--now">Acting</span>
          <span v-else-if="c.id === nextId" class="tok__badge">Next</span>
        </span>
        <span class="tok__top">
          <span class="tok__score" title="Initiative">{{ c.initiative }}</span>
          <UiAvatar
            :name="c.name"
            :portrait-path="portraitPath(c)"
            :src="c.kind === 'pc' ? null : npcImageUrl(c.portrait_path)"
            :class-slug="rosterFor(c)?.summary?.classSlug ?? null"
            :square="c.kind === 'monster'"
            :faded="isDown(c)"
            :dead="isDead(c)"
            :size="36"
          />
        </span>
        <span class="tok__name"
          >{{ c.name }}<span v-if="isDead(c)" class="tok__dead"> (dead)</span></span
        >
        <span class="tok__hp" :class="{ 'is-low': isDown(c) || c.hp_band === 'Bloodied' }">{{
          isDown(c) ? (c.kind === 'summon' ? 'Slain' : 'Down') : hpText(c) || ' '
        }}</span>
        <span class="tok__bar" aria-hidden="true">
          <span v-if="hpFill(c) !== null" :style="{ width: `${(hpFill(c) ?? 0) * 100}%` }" />
        </span>
        <span class="tok__foot">
          <span
            v-if="pips(c)"
            class="tok__pips"
            role="img"
            :aria-label="`${(pips(c)?.total ?? 0) - (pips(c)?.used ?? 0)} of ${pips(c)?.total} actions left`"
          >
            <i
              v-for="n in pips(c)?.total ?? 0"
              :key="n"
              :class="{ 'is-used': n <= (pips(c)?.used ?? 0) }"
            />
          </span>
          <span v-for="cond in conditions(c).slice(0, 2)" :key="cond" class="tok__chip">{{
            cond
          }}</span>
          <span
            v-if="conditions(c).length > 2"
            class="tok__chip"
            :title="conditions(c).slice(2).join(', ')"
            >+{{ conditions(c).length - 2 }}</span
          >
        </span>
      </button>
      <div v-if="c.kind === 'pc' && init.summonsOf(c.character_id).length" class="tok__summons">
        <button
          v-for="s in init.summonsOf(c.character_id)"
          :key="s.id"
          type="button"
          class="tok__summon"
          :title="summonName(s)"
          :aria-label="`${summonName(s)}, summon of ${c.name}`"
          @click="emit('select', s.id)"
        >
          <UiAvatar
            :name="summonName(s)"
            :portrait-path="summonMember(s)?.portrait ?? null"
            :beast="summonMember(s)?.beast ?? null"
            :size="20"
          />
        </button>
      </div>
    </li>
  </ol>
  <p v-else class="strip__empty small muted">
    No encounter running. Tokens appear here when the GM rolls initiative.
  </p>
</template>

<style scoped lang="scss">
.strip {
  list-style: none;
  margin: 0;
  padding: 4px 2px 8px;
  display: flex;
  flex-wrap: nowrap;
  align-items: stretch;
  gap: 10px;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
  scrollbar-color: var(--line-strong) transparent;
}

.strip__empty {
  margin: 0;
  padding: 8px 2px;
}

.tok {
  flex: 0 0 auto;
  width: 124px;
  min-width: 112px;
  max-width: 136px;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
  background: var(--panel-bg);
  color: var(--panel-text);

  &.is-foe {
    border-color: color-mix(in srgb, var(--danger) 45%, var(--line));
  }

  &.is-now {
    background: var(--accent-tint);
    border-color: var(--accent);
  }

  &.is-mine {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  &.is-down {
    opacity: 0.7;
  }
}

.tok__main {
  all: unset;
  box-sizing: border-box;
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 6px 8px 7px;
  cursor: pointer;
  border-radius: inherit;

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
}

.tok__badges {
  height: 14px;
  display: flex;
  justify-content: flex-end;
}

.tok__badge {
  font-size: 0.625rem;
  line-height: 14px;
  padding: 0 6px;
  border-radius: 7px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--accent-text);
  border: 1px solid var(--accent);

  &--now {
    background: var(--accent);
    color: var(--on-accent);
  }
}

.tok__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.tok__score {
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--accent-text);
}

.tok__name {
  display: block;
  font-size: 0.8125rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tok__dead {
  color: var(--danger);
}

.tok__hp {
  display: block;
  font-size: 0.6875rem;
  color: var(--panel-soft);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  &.is-low {
    color: var(--danger);
  }
}

.tok__bar {
  display: block;
  height: 4px;
  border-radius: 2px;
  background: var(--panel-track);
  overflow: hidden;

  span {
    display: block;
    height: 100%;
    background: var(--accent);
  }
}

.tok__foot {
  min-height: 16px;
  display: flex;
  align-items: center;
  gap: 4px;
  overflow: hidden;
  white-space: nowrap;
}

.tok__pips {
  display: inline-flex;
  gap: 3px;
  flex: 0 0 auto;

  i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);

    &.is-used {
      background: transparent;
      box-shadow: inset 0 0 0 1px var(--panel-muted);
    }
  }
}

.tok__chip {
  font-size: 0.625rem;
  line-height: 14px;
  padding: 0 5px;
  border-radius: 7px;
  background: var(--panel-inset);
  color: var(--panel-soft);
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.tok__summons {
  display: flex;
  gap: 4px;
  padding: 0 8px 6px;
  border-top: 1px dashed var(--line);
  padding-top: 4px;
}

.tok__summon {
  all: unset;
  display: inline-flex;
  cursor: pointer;
  border-radius: 50%;

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
}
</style>
