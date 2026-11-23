<script setup lang="ts">
// One action on the battle board: element dot, name, cost (action pips, mana), dice and
// one detail, with the full text, costs and the reason it's greyed out in a tooltip.
// A click does what the sheet's button does (through `guarded`, so a dimmed tile does
// nothing); Opportunity Attack and Help open a picker of their choices instead, and
// upcastable spells get a tier popover (NimbleUpcast).
import type { BattleTile } from '~/composables/useBattleActions'
import { guarded } from '~/utils/battleActions'

const props = defineProps<{
  action: BattleTile
  /** Show why it can't be used under the name (the All and category filters). */
  showReason?: boolean
  readonly?: boolean
}>()

const a = computed(() => props.action)
const off = computed(() => a.value.unavailable !== '')

const tone = computed(() => {
  if (a.value.kind === 'spell' && a.value.school) return a.value.school
  if (a.value.kind === 'reaction') return 'react'
  if (a.value.kind === 'weapon') return 'weapon'
  return 'ability'
})

const KIND: Record<BattleTile['kind'], string> = {
  weapon: 'Weapon',
  spell: 'Spell',
  ability: 'Ability',
  reaction: 'Reaction',
  summon: 'Summon',
}

const sub = computed(() => {
  const t = a.value.tier
  const spell = t === null ? '' : t === 0 ? 'Cantrip' : `Tier ${t}`
  return [a.value.kind === 'spell' ? spell : KIND[a.value.kind], a.value.school, a.value.detail]
    .filter(Boolean)
    .join(' · ')
})

const keys = computed(() => {
  const n = a.value.actions
  return [
    n ? `${n} ${n === 1 ? 'action' : 'actions'}` : 'No action',
    a.value.mana ? `${a.value.mana} mana` : '',
    a.value.unavailable || (a.value.choices ? 'Click to choose' : 'Click to use'),
  ]
    .filter(Boolean)
    .join(' · ')
})

const pips = computed(() => Math.min(3, a.value.actions))

const btn = ref<HTMLButtonElement | null>(null)
const upBtn = ref<HTMLButtonElement | null>(null)
const picking = ref(false)
const upcasting = ref(false)

function onClick() {
  if (a.value.choices) {
    // A dimmed tile opens nothing, but still closes a picker it opened before it dimmed
    // (the picker leaves clicks on its own tile to this handler).
    if (!off.value || picking.value) picking.value = !picking.value
    return
  }
  guarded(a.value)
}
</script>

<template>
  <div class="act" :class="{ 'act--off': off, 'act--react': a.group === 'react' }">
    <UiTooltip :title="a.name" :sub="sub" :text="a.desc" :keys="keys">
      <button
        ref="btn"
        type="button"
        class="act__btn"
        :aria-disabled="off || undefined"
        :aria-haspopup="a.choices ? 'true' : undefined"
        :aria-expanded="a.choices ? picking : undefined"
        @click="onClick"
      >
        <span class="act__top">
          <span class="act__name"
            ><i class="act__dot" :class="`act__dot--${tone}`" aria-hidden="true" />{{
              a.name
            }}</span
          >
          <span v-if="pips" class="act__pips" role="img" :aria-label="`${a.actions} actions`">
            <i v-for="n in pips" :key="n" />
          </span>
        </span>
        <span v-if="a.dice || a.detail || a.mana" class="act__meta">
          <span v-if="a.dice" class="act__dice">{{ a.dice }}</span>
          <span v-if="a.mana" class="act__mana">{{ a.mana }} mana</span>
          <span v-if="a.detail" class="act__detail">{{ a.detail }}</span>
        </span>
        <span v-if="showReason && off" class="act__why">{{ a.unavailable }}</span>
      </button>
    </UiTooltip>
    <button
      v-if="a.upcast"
      ref="upBtn"
      type="button"
      class="act__up"
      :aria-label="`Cast ${a.name} at tier ${a.upcast.at}`"
      :aria-expanded="upcasting"
      @click="upcasting = !upcasting"
    >
      T{{ a.upcast.at }}
    </button>

    <BattleActionPicker
      v-if="a.choices"
      v-model="picking"
      :choices="a.choices"
      :anchor="btn"
      :name="a.name"
    />
    <BattleActionPop
      v-if="a.upcast"
      v-model="upcasting"
      :anchor="upBtn"
      :label="`Upcast ${a.name}`"
    >
      <NimbleUpcast
        class="act__upcast"
        :name="a.name"
        :tier="a.tier ?? 0"
        :at="a.upcast.at"
        :max="a.upcast.max"
        :price="a.mana ? `${a.mana} mana` : undefined"
        :disabled="readonly"
        @set="a.upcast.set"
      />
    </BattleActionPop>
  </div>
</template>

<style scoped lang="scss">
.act {
  position: relative;
  min-width: 0;
}

.act__btn {
  width: 100%;
  height: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 7px 9px;
  text-align: left;
  border: 1px solid var(--line);
  border-radius: min(var(--radius-control), 8px);
  background: var(--inset);
  color: var(--page-text);
  font: inherit;
  cursor: pointer;
  transition:
    border-color 0.12s,
    background 0.12s;

  &:hover,
  &:focus-visible {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 8%, var(--inset));
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  &[aria-disabled='true'] {
    cursor: not-allowed;
  }
}

.act--react .act__btn {
  border-style: dashed;
}

.act--off .act__btn {
  opacity: 0.5;

  &:hover,
  &:focus-visible {
    opacity: 0.75;
  }
}

// Room for the tier button in the bottom-right corner.
.act:has(.act__up) .act__meta {
  padding-right: 30px;
}

.act__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  min-width: 0;
}

.act__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
  font-weight: 600;
}

.act__dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 6px;
  border-radius: 50%;
  vertical-align: 1px;
  background: var(--page-soft);

  &--fire {
    background: var(--danger);
  }

  &--ice {
    background: var(--secondary);
  }

  &--lightning {
    background: var(--warn-text);
  }

  &--wind {
    background: color-mix(in srgb, var(--secondary) 55%, var(--page-text));
  }

  &--radiant,
  &--ability {
    background: var(--accent);
  }

  &--necrotic {
    background: color-mix(in srgb, var(--danger) 45%, var(--secondary));
  }

  &--react {
    background: transparent;
    border: 1.5px solid var(--page-muted);
  }
}

.act__pips {
  flex: none;
  display: inline-flex;
  gap: 2px;

  i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--accent) 70%, var(--page-text));
  }
}

.act__mana {
  flex: none;
  font-size: 11px;
  font-weight: 600;
  // The readable accent (the ink variant inside a panel), pulled toward the text colour
  // so it stays at AA on inset and tinted tiles too.
  color: color-mix(in srgb, var(--accent-text) 60%, var(--page-text));
  white-space: nowrap;
}

.act__meta {
  display: flex;
  gap: 8px;
  min-width: 0;
  font-size: 11px;
  color: var(--page-muted);
}

.act__dice {
  flex: none;
  font-weight: 600;
  color: var(--page-text);
  font-variant-numeric: tabular-nums;
}

.act__detail {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.act__why {
  font-size: 10.5px;
  color: color-mix(in srgb, var(--warn-text) 55%, var(--page-text));
}

.act__up {
  position: absolute;
  bottom: 5px;
  right: 5px;
  min-width: 26px;
  height: 20px;
  padding: 0 4px;
  border-radius: 6px;
  border: 1px solid var(--line-strong);
  background: var(--field);
  color: var(--page-soft);
  font-size: 10.5px;
  font-weight: 700;

  &:hover,
  &[aria-expanded='true'] {
    border-color: var(--accent);
    color: var(--page-text);
  }
}

.act__upcast {
  min-width: 200px;
}
</style>
