<script setup lang="ts">
// PF2e sheet, laid out like the Nimble sheet: identity (portrait, name, the identity and
// details lines, the six attribute tiles), then the play panels in Nimble's two columns
// (components/pf2e/Sheet*.vue), then Feats & features.
import type { Pf2eAttr, Pf2eSheet } from '~/types/sheets'
import { sign } from '~/utils/dice'
import { isDead } from '~/utils/pf2ePlay'

const { draft, canEdit } = useSheet<Pf2eSheet>()
// The GM's HP and condition changes from the battle board.
useHeroHpChanges()
useHeroConditionChanges()
const sheet = computed(() => draft.value.sheet)

const ATTR_NAME: Record<Pf2eAttr, string> = {
  STR: 'Strength',
  DEX: 'Dexterity',
  CON: 'Constitution',
  INT: 'Intelligence',
  WIS: 'Wisdom',
  CHA: 'Charisma',
}

const dead = computed(() => isDead(sheet.value))

const identityBits = computed(() =>
  [
    sheet.value.lineage,
    sheet.value.heritage,
    sheet.value.background,
    sheet.value.class,
    sheet.value.subclass,
    sheet.value.deity,
  ].filter((b) => b?.trim()),
)

const details = computed(() => [
  { label: 'Key attribute', value: ATTR_NAME[sheet.value.keyAttr] },
  {
    label: 'XP',
    value: `${sheet.value.xp.toLocaleString()} / ${sheet.value.xpNext.toLocaleString()}`,
  },
])

const attrs = computed(() =>
  (Object.keys(ATTR_NAME) as Pf2eAttr[]).map((k) => ({
    k,
    v: sign(sheet.value.attrs[k]),
    name: ATTR_NAME[k],
    key: sheet.value.keyAttr === k,
  })),
)

watch(
  () => draft.value.level,
  (level) => {
    if (canEdit.value && sheet.value.level !== level) sheet.value.level = level
  },
  { immediate: true },
)

const strikesApi = providePf2eStrikes()
providePf2eActions(strikesApi)
const turnActive = computed(() => !!sheet.value.turn?.active)
</script>

<template>
  <section class="identity" aria-label="Identity">
    <SheetPortrait placeholder="Portrait" class="id-portrait">
      <template v-if="dead" #overlay>
        <SheetDeadOverlay :name="draft.name" />
      </template>
    </SheetPortrait>
    <div class="identity__body">
      <div class="stack" style="gap: 8px">
        <div class="row" style="gap: 10px">
          <span class="badge badge--pf2e">Pathfinder 2e</span>
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
        <div class="identity__details">
          <span v-for="d in details" :key="d.label"
            >{{ d.label }} <strong>{{ d.value }}</strong></span
          >
        </div>
      </div>
      <div class="stats">
        <div v-for="a in attrs" :key="a.k" class="stat" :class="{ 'stat--key': a.key }">
          <div class="stat__k">
            {{ a.k }}<template v-if="a.key"> · <abbr title="Key attribute">KEY</abbr></template>
          </div>
          <div class="stat__v">{{ a.v }}</div>
          <div class="stat__save">{{ a.name }}</div>
        </div>
      </div>
    </div>
  </section>

  <div class="play">
    <div class="play__col">
      <Pf2eSheetVitals style="order: 1" />
      <Pf2eSheetSpells v-if="sheet.spellcasting || sheet.focusSpells?.length" style="order: 8" />
      <Pf2eSheetSpells
        v-for="c in sheet.archetypeCasting ?? []"
        :key="c.archetype"
        :archetype="c.archetype"
        style="order: 8"
      />
      <Pf2eSheetInventory style="order: 12" />
    </div>
    <div class="play__col">
      <Pf2eSheetTurn style="order: 2" />
      <Pf2eSheetAttacks :style="{ order: turnActive ? 3 : 4 }" />
      <Pf2eSheetReactions :style="{ order: turnActive ? 4 : 3 }" />
      <Pf2eSheetResources style="order: 5" />
      <Pf2eSheetActions style="order: 6" />
      <Pf2eSheetSkills style="order: 11" />
    </div>
  </div>

  <section class="panel stack" style="gap: 12px" aria-labelledby="ft-h">
    <UiFold name="All abilities" />
    <h2 id="ft-h">Feats &amp; features</h2>
    <Pf2eSheetFeats />
  </section>
</template>

<style scoped lang="scss">
@use '../../assets/styles/sheet-layout';
</style>
