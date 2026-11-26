<script setup lang="ts">
// Nimble sheet: identity, then the play panels (components/nimble/Sheet*.vue).
import { ancestryBySlug } from '~/data/nimble/ancestries'
import { classBySlug } from '~/data/nimble/classes'
import { MAX_SKILL_BONUS, SKILL_USES } from '~/data/nimble/core'
import type { NimbleSheet, NimbleStat } from '~/types/sheets'
import { sign } from '~/utils/dice'
import { knownSpells, knownUtilitySpells } from '~/utils/nimbleBuild'
import { hasTransforms } from '~/utils/nimbleEffects'
import { isDead, skillCheck } from '~/utils/nimblePlay'
import { statusStats } from '~/utils/nimbleConditions'
import { availableSummons } from '~/utils/nimbleSummons'

const { draft, canEdit, say } = useSheet<NimbleSheet>()
useHeroEffects()
useHeroHpChanges()
useHeroConditionChanges()
const sheet = computed(() => draft.value.sheet)

const STATS: NimbleStat[] = ['STR', 'DEX', 'INT', 'WIL']

const cls = computed(() => classBySlug(sheet.value.classSlug))
const dead = computed(() => isDead(sheet.value))

const hasForms = computed(() => hasTransforms(sheet.value))

const hasSummons = computed(
  () => sheet.value.summons.length > 0 || availableSummons(sheet.value).length > 0,
)

const hasSpells = computed(
  () => knownSpells(sheet.value).length > 0 || knownUtilitySpells(sheet.value).length > 0,
)

const stats = computed(() =>
  STATS.map((k) => {
    const adv = sheet.value.saveAdv === k || statusStats(sheet.value).saveAdvantage.includes(k)
    const dis = sheet.value.saveDis === k
    const mode = adv && !dis ? 'adv' : dis && !adv ? 'dis' : ''
    return {
      k,
      v: sign(sheet.value.stats[k]),
      mode,
      key: cls.value?.keyStats.includes(k) ?? false,
      save: mode === 'adv' ? 'Save · advantage' : mode === 'dis' ? 'Save · disadvantage' : 'Save',
    }
  }),
)

const identityBits = computed(() =>
  [sheet.value.lineage, sheet.value.class, sheet.value.subclass, sheet.value.background].filter(
    Boolean,
  ),
)

const details = computed(() =>
  [
    { label: 'Size', value: ancestryBySlug(sheet.value.ancestrySlug)?.size ?? '' },
    { label: 'Height & weight', value: sheet.value.heightWeight },
    { label: 'Languages', value: sheet.value.languages },
  ].filter((d) => d.value.trim() !== ''),
)

const { claim, resultIn } = useResultOwner()
const situation = useAttackSituation()
/** Advantage (-1) or disadvantage (+1) the GM called for the next check; back to normal after it. */
const checkOdds = ref<string | number>(0)
const ODDS = [
  { value: 0, label: 'Normal' },
  { value: -1, label: 'Advantage' },
  { value: 1, label: 'Disadvantage' },
]

const frightened = computed(() => sheet.value.conditions.includes('Frightened'))

function toggleFear() {
  situation.value = situation.value.includes('Frightened')
    ? situation.value.filter((n) => n !== 'Frightened')
    : [...situation.value, 'Frightened']
}

function rollSkill(name: string) {
  if (!canEdit.value) return
  claim(`skill:${name}`, () => {
    const { message, blocked } = skillCheck(sheet.value, name, {
      odds: Number(checkOdds.value),
      frightened: situation.value.includes('Frightened'),
    })
    if (message) say(message)
    if (!blocked) checkOdds.value = 0
  })
}

const skills = computed(() =>
  sheet.value.skills.map((s) => ({
    ...s,
    uses: SKILL_USES[s.name],
    v: sign(Math.min(MAX_SKILL_BONUS, sheet.value.stats[s.stat] + s.points)),
  })),
)
</script>

<template>
  <section class="identity" aria-label="Identity">
    <SheetPortrait placeholder="Portrait" class="id-portrait">
      <template v-if="cls" #empty>
        <NimbleSigil :slug="cls.slug" :size="140" class="nb-sigil" />
      </template>
      <template v-if="dead" #overlay>
        <SheetDeadOverlay :name="draft.name" />
      </template>
    </SheetPortrait>
    <div class="identity__body">
      <div class="stack" style="gap: 8px">
        <div class="row" style="gap: 10px">
          <span class="badge badge--nimble">Nimble</span>
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
      <div class="stats">
        <div
          v-for="s in stats"
          :key="s.k"
          class="stat"
          :class="[s.mode && `stat--${s.mode}`, { 'stat--key': s.key }]"
        >
          <div class="stat__k">
            {{ s.k }}<template v-if="s.key"> · <abbr title="Key Stat">KEY</abbr></template>
          </div>
          <div class="stat__v">{{ s.v }}</div>
          <div class="stat__save">{{ s.save }}</div>
        </div>
      </div>
    </div>
  </section>

  <div class="play">
    <div class="play__col">
      <NimbleSheetVitals style="order: 1" />
      <NimbleSheetSummons v-if="hasSummons" style="order: 7" />
      <NimbleSheetSpells v-if="hasSpells" style="order: 8" />
      <NimbleSheetInventory style="order: 12" />
    </div>
    <div class="play__col">
      <NimbleSheetTurn style="order: 2" />
      <NimbleSheetAttacks :style="{ order: sheet.turnActive ? 3 : 4 }" />
      <NimbleSheetReactions :style="{ order: sheet.turnActive ? 4 : 3 }" />
      <NimbleSheetResources style="order: 5" />
      <NimbleSheetActions style="order: 6" />
      <NimbleSheetForms v-if="hasForms" style="order: 9" />
      <section class="panel stack" style="gap: 6px; order: 11" aria-labelledby="sk-h">
        <UiFold name="Skills" />
        <div class="title-help" style="margin: 0 0 6px">
          <h2 id="sk-h">Skills</h2>
          <UiHelp
            label="About skills"
            :text="`A skill’s bonus is its stat plus the skill points you put in it, up to +${MAX_SKILL_BONUS}.`"
          />
        </div>
        <SheetNextCheck v-model="checkOdds" :options="ODDS" :disabled="!canEdit">
          <template #extra>
            <button
              v-if="frightened"
              type="button"
              class="chip"
              :class="{ 'chip--on': situation.includes('Frightened') }"
              :aria-pressed="situation.includes('Frightened')"
              :disabled="!canEdit"
              title="Same chip as above the attacks; cleared each turn"
              @click="toggleFear"
            >
              Frightened: source nearby · +1 disadvantage
            </button>
          </template>
        </SheetNextCheck>
        <SheetSkillRow
          v-for="s in skills"
          :key="s.name"
          :name="s.name"
          :sub="s.stat"
          :help="s.uses"
          :value="s.v"
          :disabled="!canEdit"
          @roll="rollSkill(s.name)"
        >
          <template #marks>
            <span class="skill__pts" :aria-label="`${s.points} skill points`">
              <i v-for="p in Math.max(0, s.points)" :key="p" />
            </span>
          </template>
        </SheetSkillRow>
        <p v-if="resultIn('skill:')" class="roll-status" role="status">{{ resultIn('skill:') }}</p>
      </section>
    </div>
  </div>

  <NimbleSheetAbilities />

  <NimbleSheetStory />
</template>

<style scoped lang="scss">
@use '../../assets/styles/sheet-layout';

// The Frightened chip sits in SheetNextCheck's slot, so it takes the slot's "on" look here.
.check-odds .chip--on {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--page-text);
}

.skill__pts {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 3px;
  max-width: 64px;

  i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent);
  }
}
</style>
