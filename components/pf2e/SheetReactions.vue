<script setup lang="ts">
// The PF2e sheet's Reactions, a panel of their own as on the Nimble sheet: the hero's reactions
// (Shield Block, Reactive Strike, champion reactions, Nimble Dodge…), read from their cost by
// usePf2eActions. One reaction a round, back at the start of your turn (Player Core p. 436);
// they work off your turn. Results the other panels don't claim show here.
import type { Pf2eSheet } from '~/types/sheets'
import { hasShieldBlock } from '~/utils/pf2ePlay'

const { draft } = useSheet<Pf2eSheet>()
const sheet = computed(() => draft.value.sheet)
const {
  grouped,
  basicReactions,
  skillActions,
  classActions,
  why,
  left,
  choicesFor,
  weaponsFor,
  tiersFor,
  dmgPreview,
  use,
  strikeDamage,
} = usePf2eActions()
const { claim, resultFor, unclaimed } = useResultOwner()
const isReaction = (e: { rules: { cost?: { kind: string } } }) => e.rules.cost?.kind === 'reaction'
/** The hero's own reactions, then their class's and trained skills', then everyone's (Aid). */
const reactions = computed(() => [
  ...(grouped.value.find((g) => g.id === 'reactions')?.entries ?? []),
  ...classActions.value.filter(isReaction),
  ...skillActions.value.filter(isReaction),
  ...basicReactions.value,
])
const ready = computed(() => sheet.value.turn?.reaction !== false)
const blocks = computed(() => hasShieldBlock(sheet.value) && !!sheet.value.shield.name.trim())
</script>

<template>
  <section class="panel stack" style="gap: 14px" aria-labelledby="rea-h">
    <UiFold name="Reactions" :open="!sheet.turn?.active" />
    <div class="panel-title" style="margin: 0">
      <div class="title-help">
        <h2 id="rea-h">Reactions</h2>
        <UiHelp
          label="About reactions"
          text="One reaction a round, on any turn, when its trigger happens; it comes back at the start of your turn (Player Core p. 436), or when time passes out of combat. Using one here, a reaction spell or Shield Block spends it, and the Turn panel's ↺ shows it; tap ↺ to give it back."
        />
      </div>
      <span class="small" :class="ready ? 'rea-ready' : 'muted'">{{
        ready ? 'Reaction ready' : 'Reaction used'
      }}</span>
    </div>
    <p v-if="blocks" class="small muted" style="margin: 0">
      Shield Block: raise your shield, then tick Shield Block beside Hit points before you take the
      hit; the shield takes its Hardness off it.
    </p>
    <div class="rows">
      <Pf2eActionRow
        v-for="e in reactions"
        :key="e.key"
        :entry="e"
        :why="why(e)"
        :left="left(e)"
        :choices="choicesFor(e)"
        :weapons="weaponsFor(e)"
        :tiers="tiersFor(e)"
        :dmg="dmgPreview(e)"
        :result="resultFor(`act:${e.key}`)"
        @use="(st) => claim(`act:${e.key}`, () => use(e, st))"
        @damage="(crit, st) => claim(`act:${e.key}`, () => strikeDamage(e, crit, st))"
      />
    </div>
    <p v-if="!reactions.length" class="empty">None of your abilities is a reaction.</p>
    <p v-if="unclaimed" class="roll-status" role="status" aria-live="polite">{{ unclaimed }}</p>
  </section>
</template>

<style scoped lang="scss">
// Two cards a row on wider panels, as Nimble's reactions.
.rows {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr));
  gap: 8px;
  align-items: start;
}

.rea-ready {
  font-weight: 700;
  color: var(--accent-text);
}
</style>
