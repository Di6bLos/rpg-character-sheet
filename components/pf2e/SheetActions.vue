<script setup lang="ts">
// The PF2e sheet's Actions: the hero's abilities by cost (reactions have their own panel,
// pf2e/SheetReactions), then the basic actions, the skill actions of skills the hero is
// trained in, and their class's actions. The abilities and what Use does come from
// usePf2eActions (provided by the sheet).
import type { Pf2eSheet } from '~/types/sheets'
import {
  type Pf2eActionEntry as Entry,
  PF2E_ACTION_CATEGORIES,
  actionCategory,
} from '~/utils/pf2eActions'

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

const isReaction = (e: Entry) => e.rules.cost?.kind === 'reaction'
const catOf = (e: Entry) => actionCategory(e.name, e.rules.traits, e.rules)
/** Entries split by what they're for, in the panel's category order, empty ones left out. */
const byCategory = (entries: Entry[]) =>
  PF2E_ACTION_CATEGORIES.map((c) => ({
    ...c,
    entries: entries.filter((e) => catOf(e) === c.id),
  })).filter((c) => c.entries.length)

interface Section {
  /** The heading of the run of sections it starts or belongs to. */
  group: string
  id: string
  label: string
  /** The entries, in categories (one unnamed category when the section isn't split). */
  cats: { id: string; label: string; entries: Entry[] }[]
  count: number
  open?: boolean
  startFolded: boolean
}
const section = (
  group: string,
  id: string,
  label: string,
  entries: Entry[],
  o: { split?: boolean; open?: boolean; startFolded?: boolean } = {},
): Section[] =>
  entries.length
    ? [
        {
          group,
          id,
          label,
          cats: o.split ? byCategory(entries) : [{ id: 'all', label: '', entries }],
          count: entries.length,
          open: o.open,
          startFolded: o.startFolded ?? false,
        },
      ]
    : []

/** Skill actions by the skill their check uses (Athletics, Medicine…). */
const bySkill = computed(() => {
  const out = new Map<string, Entry[]>()
  for (const e of skillActions.value.filter((x) => !isReaction(x))) {
    const skill = e.rules.check?.skills.find((k) => k !== 'any' && k !== 'flat') ?? 'Other'
    out.set(skill, [...(out.get(skill) ?? []), e])
  }
  return [...out.entries()].sort(([a], [b]) => a.localeCompare(b))
})

/**
 * The panel's folding sections. The hero's own abilities by cost (on your turn Actions open,
 * off it they fold, as Attacks do), their actions split by what they're for; then the basic
 * actions, one section per category; the skill actions of trained skills, one per skill;
 * the class's actions. Reactions live in the Reactions panel. Basic, skill and class sections
 * start folded.
 */
const sections = computed<Section[]>(() => [
  ...grouped.value
    .filter((g) => g.id !== 'reactions')
    .flatMap((g) =>
      section('Your abilities', g.id, g.label, g.entries, {
        split: g.id === 'actions',
        open: inCombat.value && g.id === 'actions' ? onTurn.value : undefined,
      }),
    ),
  ...byCategory(basic.value).flatMap((c) =>
    section('Basic actions', `basic-${c.id}`, c.label, c.entries, { startFolded: true }),
  ),
  ...bySkill.value.flatMap(([skill, entries]) =>
    section('Skill actions (trained)', `skill-${skill.toLowerCase()}`, skill, entries, {
      startFolded: true,
    }),
  ),
  ...section(
    'Class actions',
    'class',
    `${sheet.value.class} actions`,
    classActions.value.filter((x) => !isReaction(x)),
    { split: true, startFolded: true },
  ),
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

    <p v-if="!grouped.some((g) => g.id !== 'reactions')" class="empty">
      None of your abilities take an action or have a limited use.
    </p>
    <template v-for="(sec, k) in sections" :key="sec.id">
      <h3 v-if="!k || sections[k - 1]?.group !== sec.group" class="caps grouphead">
        {{ sec.group }}
      </h3>
      <section class="panel sub stack" :aria-labelledby="`pf-act-${sec.id}`">
        <UiFold :name="`PF2e ${sec.label}`" :open="sec.open" :start-folded="sec.startFolded" />
        <h3 :id="`pf-act-${sec.id}`" class="sub__title">
          {{ sec.label }} <span class="sub__count">{{ sec.count }}</span>
        </h3>
        <template v-for="c in sec.cats" :key="c.id">
          <h4 v-if="c.label && sec.cats.length > 1" class="caps cat">{{ c.label }}</h4>
          <div class="rows">
            <Pf2eActionRow
              v-for="e in c.entries"
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
        </template>
      </section>
    </template>
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

.grouphead {
  margin: 4px 0 -4px;
  font-size: 11px;
  color: var(--page-soft);
}

.cat {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--page-muted);
}

// Two cards a row on wider panels, as Nimble's reactions and attacks.
.rows {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr));
  gap: 8px;
  align-items: start;
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
