<script setup lang="ts">
// The PF2e sheet's Actions: the hero's abilities by cost (reactions have their own panel,
// pf2e/SheetReactions), then the basic actions, the skill actions of skills the hero is
// trained in, and their class's actions. The abilities and what Use does come from
// usePf2eActions (provided by the sheet).
import type { Pf2eSheet } from '~/types/sheets'

const { draft } = useSheet<Pf2eSheet>()
const sheet = computed(() => draft.value.sheet)
const {
  grouped,
  basic,
  skillActions,
  classActions,
  targetDc,
  target,
  why,
  left,
  choicesFor,
  weaponsFor,
  tiersFor,
  dmgPreview,
  use,
  strikeDamage,
} = usePf2eActions()
const { claim, resultFor } = useResultOwner()
const onTurn = computed(() => !!sheet.value.turn?.active)
const inCombat = computed(() => onTurn.value || (sheet.value.turn?.round ?? 0) > 0)

/**
 * The panel's folding sections: on your turn Actions open, off it they fold (as Attacks do);
 * out of combat they stay as the player left them. Basic, skill and class actions start folded.
 */
const sections = computed(() => [
  ...grouped.value
    .filter((g) => g.id !== 'reactions')
    .map((g) => ({
      ...g,
      open: inCombat.value && g.id === 'actions' ? onTurn.value : undefined,
      startFolded: false,
    })),
  { id: 'basic', label: 'Basic actions', entries: basic.value, open: undefined, startFolded: true },
  ...(skillActions.value.length
    ? [
        {
          id: 'skill',
          label: 'Skill actions (trained)',
          entries: skillActions.value,
          open: undefined,
          startFolded: true,
        },
      ]
    : []),
  ...(classActions.value.length
    ? [
        {
          id: 'class',
          label: `${sheet.value.class} actions`,
          entries: classActions.value,
          open: undefined,
          startFolded: true,
        },
      ]
    : []),
])
</script>

<template>
  <section class="panel stack" style="gap: 14px" aria-labelledby="pf-act-h">
    <UiFold name="PF2e actions" />
    <div class="panel-title" style="margin: 0">
      <div class="title-help">
        <h2 id="pf-act-h">Actions</h2>
        <UiHelp
          label="About actions"
          text="Your abilities by what they cost: actions (◆, up to 3 a turn), free actions (◇) and activities that take longer; reactions have their own panel. Use pays the cost from the Turn panel, spends a limited use and rolls what the ability rolls (Player Core pp. 414–419)."
        />
      </div>
    </div>
    <div class="targets">
      <label class="target">
        DC
        <input
          v-model.number="targetDc"
          class="input target__dc"
          type="number"
          inputmode="numeric"
          min="0"
          placeholder="—"
          aria-label="Target DC"
        />
      </label>
      <label class="target">
        Target
        <input v-model="target" class="input target__name" maxlength="40" placeholder="name" />
      </label>
      <UiHelp
        label="About the target"
        text="DC: the DC your check is against, such as the creature's Will DC for Demoralize; leave it empty to roll without a result. Target: who you use the ability on, so limits per target (Battle Medicine, Demoralize) count for that name."
      />
    </div>

    <section
      v-for="sec in sections"
      :key="sec.id"
      class="panel sub stack"
      :aria-labelledby="`pf-act-${sec.id}`"
    >
      <UiFold :name="`PF2e ${sec.label}`" :open="sec.open" :start-folded="sec.startFolded" />
      <h3 :id="`pf-act-${sec.id}`" class="sub__title">
        {{ sec.label }} <span class="sub__count">{{ sec.entries.length }}</span>
      </h3>
      <Pf2eActionRow
        v-for="e in sec.entries"
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
    </section>
    <p v-if="!grouped.some((g) => g.id !== 'reactions')" class="empty">
      None of your abilities take an action or have a limited use.
    </p>
  </section>
</template>

<style scoped lang="scss">
.targets {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
}

.target {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;

  .input {
    min-height: 36px;
    padding: 4px 8px;
  }

  .target__dc {
    width: 64px;
  }

  .target__name {
    width: 120px;
  }
}

.sub {
  padding: 14px;
  box-shadow: none;
  gap: 8px;
}

.sub__title {
  margin: 0;
  font-size: 15px;
}

.sub__count {
  font-size: 12px;
  font-weight: 600;
  color: var(--page-soft);
}

@media (pointer: coarse) {
  .target .input {
    min-height: 44px;
  }
}
</style>
