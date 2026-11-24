<script setup lang="ts">
// The creatures in the encounter (monsters and NPCs, in turn order) for the phone's Party
// tab: name, Acting / Up next, conditions, and Down. Only the GM sees HP (numbers and a
// bar); players see a creature's HP only as Down, as on the initiative strip.
import type { TurnRow, useInitiative } from '~/composables/useInitiative'

const props = defineProps<{
  init: ReturnType<typeof useInitiative>
  gm: boolean
}>()

const foes = computed(() =>
  props.init.order.value.filter((c) => c.kind === 'monster' || c.kind === 'npc'),
)

/** Who acts after the acting combatant, for "Up next". */
const nextId = computed(() => {
  const order = props.init.order.value
  const i = order.findIndex((c) => c.id === props.init.turnId.value)
  return i < 0 ? null : (order[(i + 1) % order.length]?.id ?? null)
})

function isDown(c: TurnRow) {
  return c.hp_band === 'Down'
}

function hpFill(c: TurnRow): number | null {
  if (!props.gm || c.hp === null || !c.hp_max) return null
  return Math.min(1, Math.max(0, c.hp / c.hp_max))
}

function tag(c: TurnRow): string {
  if (c.id === props.init.turnId.value) return 'Acting'
  return c.id === nextId.value ? 'Up next' : ''
}
</script>

<template>
  <section v-if="foes.length" class="panel foes" aria-labelledby="foes-h">
    <header class="foes__head">
      <h2 id="foes-h">Enemies</h2>
      <span class="foes__count">{{ foes.length }}</span>
    </header>
    <ul class="foes__list">
      <li
        v-for="c in foes"
        :key="c.id"
        class="foe"
        :class="{ 'is-acting': c.id === init.turnId.value, 'is-down': isDown(c) }"
      >
        <UiAvatar
          :name="c.name"
          :src="npcImageUrl(c.portrait_path)"
          :square="c.kind === 'monster'"
          :faded="isDown(c)"
          :size="36"
        />
        <span class="foe__main">
          <span class="foe__name">
            <span class="foe__label">{{ c.name }}</span>
            <span v-if="tag(c)" class="foe__tag" :class="{ 'is-next': tag(c) === 'Up next' }">{{
              tag(c)
            }}</span>
          </span>
          <span v-if="hpFill(c) !== null" class="foe__bar" aria-hidden="true">
            <span :style="{ width: `${(hpFill(c) ?? 0) * 100}%` }" />
          </span>
          <span v-if="c.conditions?.length" class="foe__conds">
            <span v-for="cond in c.conditions" :key="cond" class="foe__cond">{{ cond }}</span>
          </span>
        </span>
        <span class="foe__right">
          <b v-if="isDown(c)" class="foe__down">Down</b>
          <b v-else-if="gm && c.hp !== null && c.hp_max"
            >{{ c.hp }}/{{ c.hp_max }}<span class="sr-only"> HP</span></b
          >
        </span>
      </li>
    </ul>
  </section>
</template>

<style scoped lang="scss">
.foes {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
}

.foes__head {
  display: flex;
  align-items: center;
  gap: 8px;

  h2 {
    margin: 0;
    font-family: var(--font-heading);
    font-size: 16px;
  }
}

.foes__count {
  margin-left: auto;
  font-size: 12px;
  color: var(--page-muted);
}

.foes__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.foe {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  min-height: 56px;
  box-sizing: border-box;
  padding: 8px 12px;
  border-radius: var(--radius-control);
  background: var(--inset);
  border: 1px solid color-mix(in srgb, var(--danger) 40%, var(--line));

  &.is-acting {
    border-color: var(--accent);
  }

  &.is-down {
    opacity: 0.7;
  }
}

.foe__main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.foe__name {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 15px;
  font-weight: 600;
}

.foe__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.foe__tag {
  flex: none;
  font-size: 9px;
  line-height: 14px;
  padding: 0 5px;
  border-radius: 4px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  background: var(--accent);
  color: var(--on-accent);

  &.is-next {
    background: transparent;
    color: var(--page-soft);
    box-shadow: inset 0 0 0 1px var(--line-strong);
  }
}

.foe__bar {
  display: block;
  height: 6px;
  border-radius: 3px;
  background: var(--track);
  overflow: hidden;

  span {
    display: block;
    height: 100%;
    background: var(--danger);
  }
}

.foe__conds {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}

.foe__cond {
  font-size: 11px;
  line-height: 16px;
  padding: 0 6px;
  border-radius: 8px;
  background: var(--panel-bg);
  border: 1px solid var(--line);
  color: var(--page-soft);
  white-space: nowrap;
}

.foe__right {
  font-size: 14px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.foe__down {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: color-mix(in srgb, var(--danger) 45%, var(--page-text));
}
</style>
