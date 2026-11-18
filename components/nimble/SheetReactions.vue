<script setup lang="ts">
import type { NimbleSheet } from '~/types/sheets'

const { draft, canEdit } = useSheet<NimbleSheet>()
const sheet = computed(() => draft.value.sheet)
const { reactions, toggleReaction, abilities, abilityActions, inventions } = useNimbleActions()
const { reactionSpells, cast } = useNimbleSpells()
const { claim, resultIn, unclaimed } = useResultOwner()
const noActionsPanel = computed(
  () =>
    !abilities.value.length &&
    !abilityActions.value.some((a) => !a.attack) &&
    !inventions.value.some((i) => !i.attack),
)
const message = computed(
  () => resultIn('reaction:') || (noActionsPanel.value ? unclaimed.value : ''),
)
</script>

<template>
  <section class="panel stack" style="gap: 14px" aria-labelledby="rea-h">
    <UiFold name="Reactions" :open="!sheet.turnActive" />
    <div class="title-help">
      <h2 id="rea-h">Reactions</h2>
      <UiHelp
        label="About reactions"
        text="Each costs 1 action (unless free) and can be used once per round, on any turn. Tap again to undo."
      />
    </div>
    <div class="stack" style="gap: 8px">
      <div class="cards">
        <div v-for="r in reactions" :key="r.name" class="reaction-wrap">
          <button
            type="button"
            class="tile card reaction"
            :aria-pressed="r.used"
            :disabled="!canEdit || r.blocked"
            @click="claim(`reaction:${r.name}`, () => toggleReaction(r.name))"
          >
            <span class="reaction__head">
              <strong>{{ r.name }}</strong>
              <em>{{ r.used ? 'Used · tap to undo' : r.costText }}</em>
            </span>
            <span>{{ r.desc }}</span>
          </button>
          <NimbleModifiers :target="r.name" />
        </div>
        <button
          v-for="s in reactionSpells"
          :key="s.name"
          type="button"
          class="tile card reaction"
          :disabled="!canEdit || !!s.blocked"
          :title="s.blocked || `${s.cast}. ${s.desc}`"
          @click="claim(`reaction:${s.name}`, () => cast(s))"
        >
          <span class="reaction__head">
            <strong>{{ s.name }}</strong>
            <em>{{ s.blocked || `Spell · ${s.cost}` }}</em>
          </span>
          <span>{{ s.trigger }}</span>
        </button>
      </div>
    </div>

    <p v-if="message" class="roll-status" role="status">{{ message }}</p>
  </section>
</template>

<style scoped lang="scss">
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr));
  gap: 8px;
}

.card {
  padding: 12px;
  text-align: left;
  color: var(--page-text);

  strong {
    font-size: 14px;
  }

  span {
    font-size: 12px;
    line-height: 1.45;
    color: var(--page-soft);
  }
}

.reaction-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;

  > .reaction {
    flex: 1;
  }
}

.reaction {
  justify-content: flex-start;

  &[aria-pressed='true'] {
    border-style: dashed;

    > span:last-child {
      opacity: 0.6;
    }
  }
}

.reaction__head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;

  em {
    margin-left: auto;
    font-style: normal;
    font-size: 11px;
    font-weight: 700;
    color: color-mix(in srgb, var(--secondary) 70%, var(--page-text));
  }
}

.reaction[aria-pressed='true'] em {
  color: var(--page-soft);
}
</style>
