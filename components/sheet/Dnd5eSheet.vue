<script setup lang="ts">
// D&D 5e (2024) sheet, laid out like the Nimble sheet: identity (portrait, name, the identity
// and details lines, the six ability tiles with their saves), then the play panels in Nimble's
// two columns (components/dnd5e/Sheet*.vue), then Features & feats, the background story and
// notes. Built heroes play from the 5e data (provideDnd5eSheet); a hand-made sheet uses what it
// holds (typed weapons, feature text) and sets its own skill proficiencies. Every theme styles
// it through the shared variables, as the Nimble and PF2e sheets. The GM's HP and condition
// changes from the battle board go through the 5e engine.
import type { Dnd5eAbility, Dnd5eSheet } from '~/types/sheets'
import { abilityMod, sign } from '~/utils/dice'
import { DND5E_ABILITY_NAME } from '~/utils/dnd5eBuild'
import { isDead, saveRow } from '~/utils/dnd5ePlay'

const { draft, canEdit } = useSheet<Dnd5eSheet>()
useHeroHpChanges()
useHeroConditionChanges()
useHeroEffects()
const { data } = provideDnd5eSheet()
provideDnd5eCasting()
const sheet = computed(() => draft.value.sheet)
const level = computed(() => draft.value.level)
const dead = computed(() => isDead(sheet.value))
const turnActive = computed(() => !!sheet.value.turn?.active)

const identityBits = computed(() =>
  [sheet.value.lineage, sheet.value.class, sheet.value.background, sheet.value.alignment].filter(
    (b) => b?.trim(),
  ),
)

const details = computed(() =>
  [
    { label: 'Size', value: sheet.value.size ?? '' },
    { label: 'Languages', value: sheet.value.proficiencies?.languages.join(', ') ?? '' },
    {
      label: 'XP',
      value: `${(sheet.value.xp ?? 0).toLocaleString()} / ${(sheet.value.xpNext ?? 0).toLocaleString()}`,
    },
  ].filter((d) => d.value.trim() !== ''),
)

const primary = computed(
  () =>
    data.value?.classes.find((c) => c.slug === sheet.value.classSlug)?.primaryAbility.abilities ??
    [],
)

const ABILITIES: Dnd5eAbility[] = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']
const stats = computed(() =>
  ABILITIES.map((k) => {
    const save = saveRow(sheet.value, level.value, k)
    const score = sheet.value.abilities[k]
    return {
      k,
      name: DND5E_ABILITY_NAME[k],
      score,
      mod: sign(abilityMod(score)),
      save: `Save ${save.test.fail ? 'fails' : sign(save.test.bonus)}`,
      prof: save.prof > 0,
      key: primary.value.includes(k),
    }
  }),
)

const hasSpells = computed(() => !!sheet.value.castingStats || !!sheet.value.spells?.length)
</script>

<template>
  <section class="identity" aria-label="Identity">
    <SheetPortrait placeholder="Portrait" class="id-portrait">
      <template v-if="sheet.classSlug" #empty>
        <Dnd5eSigil :slug="sheet.classSlug" :size="140" class="nb-sigil" />
      </template>
      <template v-if="dead" #overlay>
        <SheetDeadOverlay :name="draft.name" />
      </template>
    </SheetPortrait>
    <div class="identity__body">
      <div class="stack" style="gap: 8px">
        <div class="row" style="gap: 10px">
          <span class="badge badge--dnd5e">D&amp;D 5e</span>
          <span class="small muted"><SheetCampaignLink /></span>
        </div>
        <h1>{{ draft.name }}<span v-if="dead" class="dead-tag"> (dead)</span></h1>
        <div class="identity__line">
          <span
            >Level <strong>{{ draft.level }}</strong></span
          >
          <template v-for="bit in identityBits" :key="bit">
            <span aria-hidden="true">·</span><span>{{ bit }}</span>
          </template>
        </div>
        <div v-if="details.length" class="identity__details">
          <span v-for="d in details" :key="d.label"
            >{{ d.label }} <strong>{{ d.value }}</strong></span
          >
        </div>
      </div>
      <div class="stats stats--six">
        <div
          v-for="s in stats"
          :key="s.k"
          class="stat"
          :class="{ 'stat--key': s.key }"
          :title="`${s.name} ${s.score}`"
        >
          <div class="stat__k">
            {{ s.k }}<template v-if="s.key"> · <abbr title="Primary ability">KEY</abbr></template>
          </div>
          <div class="stat__v">{{ s.mod }}</div>
          <div class="stat__save">
            {{ s.score }} · <span :class="{ 'save-prof': s.prof }">{{ s.save }}</span>
          </div>
        </div>
      </div>
    </div>
  </section>

  <div class="play">
    <div class="play__col">
      <Dnd5eSheetVitals style="order: 1" />
      <Dnd5eSheetSpells v-if="hasSpells" style="order: 8" />
      <Dnd5eSheetInventory style="order: 12" />
    </div>
    <div class="play__col">
      <Dnd5eSheetTurn style="order: 2" />
      <Dnd5eSheetAttacks :style="{ order: turnActive ? 3 : 4 }" />
      <Dnd5eSheetReactions :style="{ order: turnActive ? 4 : 3 }" />
      <Dnd5eSheetResources style="order: 5" />
      <Dnd5eSheetActions style="order: 6" />
      <Dnd5eSheetSkills style="order: 11" />
    </div>
  </div>

  <Dnd5eSheetFeatures />

  <NimbleSheetStory />

  <section class="panel stack" style="gap: 10px" aria-labelledby="d5-notes-h">
    <UiFold name="Notes" />
    <h2 id="d5-notes-h">Notes</h2>
    <textarea
      v-if="canEdit"
      v-model="sheet.notes"
      class="input notes"
      rows="4"
      aria-labelledby="d5-notes-h"
      placeholder="Anything to remember: allies, debts, the map's missing corner…"
    />
    <p v-else-if="sheet.notes" class="notes__read">{{ sheet.notes }}</p>
    <p v-else class="small muted">No notes yet.</p>
  </section>
</template>

<style scoped lang="scss">
@use '../../assets/styles/sheet-layout';

.stats--six {
  grid-template-columns: repeat(6, minmax(0, 1fr));
}

@media (max-width: 720px) {
  .stats--six {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.save-prof {
  font-weight: 700;
  color: var(--accent-text);
}

.notes {
  min-height: 6em;
  field-sizing: content;
}

.notes__read {
  white-space: pre-wrap;
  font-size: 15px;
  line-height: 1.55;
}
</style>
