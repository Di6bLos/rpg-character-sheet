<script setup lang="ts">
// One Pathfinder 2e class in Library → Classes: initial proficiencies, the advancement table,
// features by level, its subclass options by kind, and spell slots for casters. During a
// search only the matching features and options show, opened.
import type { Pf2eClassDef, Pf2eSubclassOption } from '~/data/pf2e/types'
import {
  byKind,
  byLevel,
  classSummary,
  pf2eAdvancement,
  sourceLabel,
  spellSlotTable,
  type Pf2eClassMatch,
} from '~/utils/libraryCompendium'
import { RANK_NAME } from '~/utils/pf2eLevelUp'
import { PF2E_ATTR_NAME } from '~/utils/pf2eBuild'
import { loreHtml } from '~/utils/loreText'

const props = defineProps<{ cls: Pf2eClassDef; match: Pf2eClassMatch; searching: boolean }>()

const whole = computed(() => props.match.whole)
const openHits = computed(() => props.searching && !whole.value)

const facts = computed(() => {
  const c = props.cls
  return [
    { label: 'Key attribute', value: c.keyAttributes.map((a) => PF2E_ATTR_NAME[a]).join(' or ') },
    { label: 'Hit Points', value: `${c.hp} plus your Constitution modifier per level` },
    { label: 'Perception', value: RANK_NAME[c.perception] },
    {
      label: 'Saving throws',
      value: `Fortitude ${RANK_NAME[c.saves.fortitude]}, Reflex ${RANK_NAME[c.saves.reflex]}, Will ${RANK_NAME[c.saves.will]}`,
    },
    { label: 'Skills', value: c.skills.join('; ') },
    { label: 'Attacks', value: c.attacks.join('; ') },
    { label: 'Defenses', value: c.defenses.join('; ') },
    { label: 'Spell tradition', value: c.traditions.join(', ') },
  ].filter((f) => f.value)
})

const summary = computed(() => classSummary(props.cls.text))
const advancement = computed(() => pf2eAdvancement(props.cls))
const levels = computed(() => byLevel(props.match.features))
const kinds = computed(() => byKind(props.match.subclasses))
const slots = computed(() => spellSlotTable(props.cls))

const ordinal = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`

function optionMeta(o: Pf2eSubclassOption) {
  return [o.level ? `Level ${o.level}` : '', o.rarity === 'common' ? '' : o.rarity]
    .filter(Boolean)
    .join(' · ')
}

function optionFacts(o: Pf2eSubclassOption) {
  return [
    { label: 'Skills', value: o.skills.join(', ') },
    { label: 'Tradition', value: o.traditions.join(', ') || o.tradition || '' },
    { label: 'Lesson', value: o.lessonType ?? '' },
    { label: 'Tactic', value: o.tacticType ?? '' },
    { label: 'Usage', value: o.usage ?? '' },
    { label: 'Frequency', value: o.frequency ?? '' },
    { label: 'Requirements', value: o.requirements ?? '' },
    { label: 'Home plane', value: o.homePlane ?? '' },
  ].filter((f) => f.value)
}

const html = (md: string) => loreHtml(md, { headingBase: 5 })
</script>

<template>
  <div class="cbody">
    <template v-if="whole">
      <p v-if="summary" class="cbody__summary">{{ summary }}</p>
      <dl class="cbody__facts">
        <div v-for="f in facts" :key="f.label">
          <dt>{{ f.label }}</dt>
          <dd>{{ f.value }}</dd>
        </div>
      </dl>
      <p v-if="cls.gap" class="notice">{{ cls.gap }}</p>

      <h3>Advancement</h3>
      <div class="table-wrap" tabindex="0" role="region" :aria-label="`${cls.name} advancement`">
        <table class="table table--rules">
          <thead>
            <tr>
              <th scope="col">Level</th>
              <th scope="col">Class features</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in advancement" :key="r.level">
              <td>{{ r.level }}</td>
              <td>{{ r.features }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <template v-if="levels.length">
      <h3>Class features</h3>
      <section v-for="g in levels" :key="g.level" class="cbody__level">
        <h4>Level {{ g.level }}</h4>
        <LibraryFold v-for="f in g.items" :key="f.id" :title="f.name" :open="openHits">
          <!-- eslint-disable-next-line vue/no-v-html -- loreHtml escapes everything first -->
          <div v-html="html(f.text)" />
        </LibraryFold>
      </section>
    </template>

    <section v-for="k in kinds" :key="k.kind">
      <h3>{{ k.kind }}</h3>
      <LibraryFold
        v-for="o in k.items"
        :key="o.id"
        :title="o.name"
        :meta="optionMeta(o)"
        :open="openHits"
      >
        <ul v-if="optionFacts(o).length" class="cbody__chips">
          <li v-for="f in optionFacts(o)" :key="f.label">
            <strong>{{ f.label }}:</strong> {{ f.value }}
          </li>
        </ul>
        <p v-if="o.gap" class="notice">{{ o.gap }}</p>
        <!-- eslint-disable-next-line vue/no-v-html -- loreHtml escapes everything first -->
        <div v-html="html(o.text)" />
        <p class="cbody__source">{{ sourceLabel(o.source) }}</p>
      </LibraryFold>
    </section>

    <template v-if="whole && slots">
      <h3>Spell slots</h3>
      <p class="small muted">Spells per day by level: cantrips, then slots for each rank.</p>
      <div class="table-wrap" tabindex="0" role="region" :aria-label="`${cls.name} spell slots`">
        <table class="table table--rules cbody__slots">
          <thead>
            <tr>
              <th scope="col">Level</th>
              <th scope="col">Cantrips</th>
              <th v-for="r in slots.ranks" :key="r" scope="col">{{ ordinal(r) }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in slots.rows" :key="row.level">
              <td>{{ row.level }}</td>
              <td>{{ row.cantrips }}</td>
              <td v-for="(n, i) in row.slots" :key="i">{{ n || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
