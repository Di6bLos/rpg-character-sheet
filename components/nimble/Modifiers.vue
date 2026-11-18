<script setup lang="ts">
import type { NimbleSheet } from '~/types/sheets'
import { abilityModifiers, weaponAliases } from '~/utils/nimbleBuild'
import { usedUpLabel } from '~/utils/nimblePlay'
import { summonModifiers } from '~/utils/nimbleSummons'

const props = defineProps<{
  target?: string
  summon?: string
  weapon?: string
  aliases?: string[]
  skip?: string[]
}>()

const { draft, canEdit } = useSheet<NimbleSheet>()
const { abilities, spend, inventions } = useNimbleActions()

const mods = computed(() =>
  !props.summon && !props.target
    ? []
    : props.summon
      ? summonModifiers(draft.value.sheet, props.summon)
      : abilityModifiers(draft.value.sheet, props.target ?? '', [
          ...(props.weapon !== undefined ? weaponAliases(props.weapon) : []),
          ...(props.aliases ?? []),
        ]).filter((m) => !props.skip?.includes(m.ability)),
)

const items = computed(() =>
  mods.value.map((m) => {
    const view = abilities.value.find((a) => a.key === m.ability)
    const counters = view?.counters ?? []
    const left = counters.length ? Math.min(...counters.map((c) => c.left)) : 0
    const short = counters.some((c) => c.short)
    return {
      ...m,
      invention: inventions.value.some((i) => i.name === m.ability),
      view,
      counters,
      uses: counters.map((c) => `${c.left}/${c.max} ${c.label}`).join(' · '),
      cost: counters[0]?.costText ?? '',
      why:
        left === 0
          ? usedUpLabel(counters.find((c) => c.left === 0))
          : short
            ? 'Not enough actions'
            : '',
    }
  }),
)

function use(item: (typeof items.value)[number]) {
  const [first, ...rest] = item.counters
  if (canEdit.value && first && item.view) spend(first, item.view.name, 1, rest)
}
</script>

<template>
  <div v-if="items.length" class="mods">
    <span class="mods__caps">Upgraded by</span>
    <details v-for="m in items" :key="m.name" class="mod">
      <summary>
        {{ m.name }}
        <small v-if="m.counters.length" class="mod__uses">{{ m.uses }}</small>
      </summary>
      <p>{{ m.text }}</p>
      <NimbleTrigger :name="m.name" :text="m.text" class="mod__trigger" />
      <NimbleInventionUse v-if="m.invention" :name="m.ability" class="mod__invention" />
      <div v-if="m.counters.length" class="mod__use">
        <small v-if="m.cost">{{ m.cost }}</small>
        <button
          type="button"
          class="btn btn--sm btn--wrap"
          :disabled="!canEdit || !!m.why"
          :title="m.why || undefined"
          :aria-label="`Use ${m.name}, ${m.uses}`"
          @click="use(m)"
        >
          {{ m.why || 'Use' }}
        </button>
      </div>
    </details>
  </div>
</template>

<style scoped lang="scss">
.mods {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 10px;
  border-left: 2px solid var(--accent);
  border-radius: 4px;
  background: color-mix(in srgb, var(--accent) 7%, transparent);
  text-align: left;
}

.mods__caps {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--accent-text);
}

.mod {
  > summary {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 0;
    font-size: 12px;
    font-weight: 700;
    color: var(--page-text);
    cursor: pointer;
    list-style: none;

    &::-webkit-details-marker {
      display: none;
    }

    &::after {
      content: '▾';
      margin-left: auto;
      font-size: 11px;
      color: var(--accent-text);
    }
  }

  &[open] > summary::after {
    content: '▴';
  }

  p {
    margin: 0 0 4px;
    font-size: 12px;
    line-height: 1.45;
    color: var(--page-soft);
  }
}

.mod__trigger {
  margin-bottom: 6px;
}

.mod__invention {
  margin-bottom: 6px;
}

.mod__uses {
  font-size: 11px;
  font-weight: 600;
  color: var(--accent-text);
}

.mod__use {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-bottom: 6px;

  small {
    margin-right: auto;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--page-muted);
  }
}
</style>
