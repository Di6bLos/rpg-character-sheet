<script setup lang="ts">
import type { NimbleSheet } from '~/types/sheets'

const { canEdit } = useSheet<NimbleSheet>()
const { abilities, inventions, abilityActions, attackAbilityKeys } = useNimbleActions()
const { unclaimed } = useResultOwner()

const mine = computed(() =>
  abilities.value.filter((a) => !a.linked && !a.companion && !attackAbilityKeys.value.has(a.key)),
)
const otherActions = computed(() => abilityActions.value.filter((a) => !a.attack))
const hasInventionActions = computed(() => inventions.value.some((i) => !i.attack))
</script>

<template>
  <section
    v-if="otherActions.length || hasInventionActions || mine.length"
    class="panel stack"
    style="gap: 18px"
    aria-labelledby="act-h"
  >
    <UiFold name="Actions" />
    <div class="title-help">
      <h2 id="act-h">Actions</h2>
      <UiHelp
        label="About actions"
        text="Abilities you spend actions on, and the limited-use ones with their uses per turn, encounter or Safe Rest; tap one for its details."
      />
    </div>

    <div v-if="otherActions.length || hasInventionActions" class="stack" style="gap: 8px">
      <div class="caps">Ability actions</div>
      <NimbleInventionCard
        v-for="inv in inventions.filter((i) => !i.attack)"
        :key="inv.name"
        :name="inv.name"
      />
      <details v-for="a in otherActions" :key="a.key" class="tile act">
        <summary>
          <strong>{{ a.name }}</strong>
          <small>{{ a.costText }}</small>
        </summary>
        <div class="act__body">
          <p>{{ a.desc }}</p>
          <NimbleModifiers :target="a.name" />
          <button
            type="button"
            class="btn btn--sm btn--wrap"
            :disabled="!canEdit || a.short"
            :title="a.why || undefined"
            @click="a.use"
          >
            {{ a.why || 'Use' }}
          </button>
        </div>
      </details>
    </div>

    <div v-if="mine.length" class="stack" style="gap: 8px">
      <div class="caps">Limited-use abilities</div>
      <NimbleAbilityCounters :items="mine" />
    </div>
    <p v-if="unclaimed" class="roll-status" role="status">{{ unclaimed }}</p>
  </section>
</template>

<style scoped lang="scss">
.act {
  padding: 0;
  gap: 0;

  > summary {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding: 10px 14px;
    cursor: pointer;
    list-style: none;

    &::-webkit-details-marker {
      display: none;
    }

    strong {
      font-size: 14px;
    }

    small {
      font-size: 11px;
      color: var(--accent-text);
      font-weight: 700;
    }

    &::after {
      content: '▾';
      margin-left: auto;
      font-size: 12px;
      color: var(--accent-text);
    }
  }

  &[open] {
    border-color: var(--accent);

    > summary::after {
      content: '▴';
    }
  }
}

.act__body {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 0 14px 12px;

  p {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: var(--page-soft);
  }
}
</style>
