<script setup lang="ts">
// One 5e class in the Library → Classes modal: its core traits, the level 1–20 class table with
// every column, features by level, spellcasting, its subclasses with their features and
// always-prepared spells and own option lists (Battle Master's maneuvers, Arcane Archer's Arcane
// Shots), then the option lists the class picks from (invocations, metamagic, plans). SRD
// features show the SRD's text and page; the others their summary, mechanics and source tag.
// The features and subclasses a search matched start open.
import type {
  Dnd5eAbility,
  Dnd5eClassDef,
  Dnd5eFeature,
  Dnd5eOptionEntry,
  Dnd5eOptionGroup,
  Dnd5eSpellcasting,
  Dnd5eSubclassDef,
} from '~/data/dnd5e/types'
import { byLevel, dnd5eAdvancement, type Dnd5eClassMatch } from '~/utils/libraryCompendium'
import {
  DND5E_ABILITY,
  DND5E_SOURCE_SHORT,
  choiceLine,
  dnd5eSource,
  entryItem,
  listWords,
} from '~/utils/libraryDnd5e'
import { loreHtml } from '~/utils/loreText'

const props = defineProps<{
  cls: Dnd5eClassDef
  subclasses: Dnd5eSubclassDef[]
  groups: Dnd5eOptionGroup[]
  match: Dnd5eClassMatch | null
  /** A spell's name by its slug. */
  spellName: (slug: string) => string
}>()

const searched = computed(() => !!props.match && !props.match.whole)
const hit = (f: Dnd5eFeature) => searched.value && !!props.match?.features.has(f)
const subHit = (s: Dnd5eSubclassDef) => searched.value && !!props.match?.subclasses.has(s.slug)
const optionHit = (e: Dnd5eOptionEntry) => searched.value && !!props.match?.options.has(e.slug)
const id = (part: string) => `cls-${props.cls.slug}-${part}`
const names = (list: Dnd5eAbility[]) => list.map((a) => DND5E_ABILITY[a])

const facts = computed(() => {
  const c = props.cls
  const multi = c.multiclass.prerequisite
  return [
    {
      label: 'Primary ability',
      value: listWords(names(c.primaryAbility.abilities), c.primaryAbility.all ? 'and' : 'or'),
    },
    { label: 'Hit Point Die', value: `d${c.hitDie} per ${c.name} level` },
    { label: 'Saving throw proficiencies', value: listWords(names(c.saves)) },
    {
      label: 'Skill proficiencies',
      value: `Choose ${c.skills.count}: ${listWords(c.skills.options, 'or')}`,
    },
    { label: 'Weapon proficiencies', value: c.weapons.join(', ') },
    { label: 'Armor training', value: c.armor.join(', ') || 'None' },
    {
      label: 'Tool proficiencies',
      value: [...c.tools, ...(c.toolChoice ? [choiceLine(c.toolChoice)] : [])].join('; '),
    },
    {
      label: 'Starting equipment',
      value: c.equipment.map((e) => `(${e.option}) ${e.items}`).join('; or '),
    },
    { label: 'Subclass', value: `At level ${c.subclassLevel}` },
    {
      label: 'Multiclassing',
      value: `${listWords(names(multi.abilities), multi.any ? 'or' : 'and')} 13+; you gain: ${c.multiclass.gains}`,
    },
  ].filter((f) => f.value)
})

const table = computed(() => dnd5eAdvancement(props.cls))
const levels = computed(() => byLevel(props.cls.features))
const tag = computed(() => (props.cls.srd ? '' : DND5E_SOURCE_SHORT[props.cls.source]))

const KIND: Record<Dnd5eSpellcasting['kind'], string> = {
  full: 'Full caster',
  half: 'Half caster',
  third: 'Third caster',
  pact: 'Pact Magic',
}
function castingFacts(sc: Dnd5eSpellcasting) {
  return [
    { label: 'Spellcasting ability', value: DND5E_ABILITY[sc.ability] },
    { label: 'Progression', value: KIND[sc.kind] },
    { label: 'Spell list', value: sc.list.charAt(0).toUpperCase() + sc.list.slice(1) },
    { label: 'Focus', value: sc.focus ?? '' },
    { label: 'Ritual casting', value: sc.ritual ? 'Yes' : 'No' },
  ].filter((f) => f.value)
}

/** SRD features cite their page; the rest carry the class's source tag. */
const featureMeta = (f: Dnd5eFeature) =>
  f.srd ? (f.page ? `SRD p. ${f.page}` : '') : DND5E_SOURCE_SHORT[props.cls.source]

const classGroups = computed(() => props.groups.filter((g) => !g.subclass))
const subGroups = (s: Dnd5eSubclassDef) => props.groups.filter((g) => g.subclass === s.slug)

function optionMeta(e: Dnd5eOptionEntry) {
  return [
    e.prerequisite?.text,
    e.cost,
    e.repeatable ? 'Repeatable' : '',
    e.srd ? '' : DND5E_SOURCE_SHORT[e.source],
  ]
    .filter(Boolean)
    .join(' · ')
}

const subclassMeta = (s: Dnd5eSubclassDef) =>
  s.srd ? dnd5eSource(s) : DND5E_SOURCE_SHORT[s.source]

const html = (md: string) => loreHtml(md, { headingBase: 5 })
</script>

<template>
  <div class="cbody">
    <section :id="id('overview')" class="cbody__section">
      <h3 class="sr-only">Overview</h3>
      <p v-if="cls.summary" class="cbody__summary">
        {{ cls.summary }}
        <span v-if="tag" class="badge badge--outline">{{ tag }}</span>
      </p>
      <dl class="cbody__facts">
        <div v-for="f in facts" :key="f.label">
          <dt>{{ f.label }}</dt>
          <dd>{{ f.value }}</dd>
        </div>
      </dl>
      <p class="cbody__source">{{ dnd5eSource(cls) }}</p>
    </section>

    <section :id="id('advancement')" class="cbody__section">
      <h3>{{ cls.name }} features</h3>
      <div class="table-wrap" tabindex="0" role="region" :aria-label="`${cls.name} features table`">
        <table class="table table--rules cbody__slots">
          <thead>
            <tr>
              <th scope="col">Level</th>
              <th scope="col">PB</th>
              <th scope="col" class="cbody__wide">Class features</th>
              <th v-for="c in table.columns" :key="c" scope="col">{{ c }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in table.rows" :key="r.level">
              <td>{{ r.level }}</td>
              <td>{{ r.pb }}</td>
              <td class="cbody__wide">{{ r.features || '—' }}</td>
              <td v-for="(v, i) in r.values" :key="i">{{ v || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section :id="id('features')" class="cbody__section">
      <h3>Class features</h3>
      <template v-for="g in levels" :key="g.level">
        <h4>Level {{ g.level }}</h4>
        <LibraryFold
          v-for="f in g.items"
          :key="f.name"
          :title="f.name"
          :meta="featureMeta(f)"
          :open="hit(f)"
          :class="{ 'is-hit': hit(f) }"
        >
          <LibraryItemBody :item="entryItem(f, spellName)" />
        </LibraryFold>
      </template>
    </section>

    <section v-if="cls.spellcasting" :id="id('spells')" class="cbody__section">
      <h3>Spellcasting</h3>
      <dl class="cbody__facts">
        <div v-for="f in castingFacts(cls.spellcasting)" :key="f.label">
          <dt>{{ f.label }}</dt>
          <dd>{{ f.value }}</dd>
        </div>
      </dl>
      <p class="small muted">
        Cantrips, prepared spells and spell slots per level are in the {{ cls.name }} features table
        above.
      </p>
    </section>

    <section
      v-if="subclasses.length || classGroups.length"
      :id="id('options')"
      class="cbody__section"
    >
      <template v-if="subclasses.length">
        <h3>Subclasses</h3>
        <LibraryFold
          v-for="s in subclasses"
          :key="s.slug"
          :title="s.name"
          :meta="subclassMeta(s)"
          :open="subHit(s)"
          :class="{ 'is-hit': subHit(s) }"
        >
          <!-- eslint-disable-next-line vue/no-v-html -- loreHtml escapes everything first -->
          <div v-if="s.text" v-html="html(s.text)" />
          <p v-else-if="s.summary" class="cbody__text">
            {{ s.summary }}
            <span class="badge badge--outline">{{ DND5E_SOURCE_SHORT[s.source] }}</span>
          </p>
          <template v-for="g in byLevel(s.features)" :key="g.level">
            <h4>Level {{ g.level }}</h4>
            <div
              v-for="f in g.items"
              :key="f.name"
              class="cbody__ability"
              :class="{ 'is-hit': hit(f) }"
            >
              <strong>{{ f.name }}.</strong>
              <LibraryItemBody :item="entryItem(f, spellName)" />
            </div>
          </template>
          <template v-if="s.spells?.length">
            <h4>Always-prepared spells</h4>
            <div class="table-wrap" tabindex="0" role="region" :aria-label="`${s.name} spells`">
              <table class="table table--rules">
                <thead>
                  <tr>
                    <th scope="col">{{ cls.name }} level</th>
                    <th v-if="s.spells.some((x) => x.group)" scope="col">Option</th>
                    <th scope="col">Spells</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, i) in s.spells" :key="i">
                    <td>{{ row.level }}</td>
                    <td v-if="s.spells.some((x) => x.group)">{{ row.group ?? '' }}</td>
                    <td>{{ row.spells.map(spellName).join(', ') }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
          <template v-for="og in subGroups(s)" :key="og.slug">
            <h4>{{ og.name }}</h4>
            <div
              v-for="e in og.entries"
              :key="e.slug"
              class="cbody__ability"
              :class="{ 'is-hit': optionHit(e) }"
            >
              <strong>{{ e.name }}.</strong>
              <span v-if="optionMeta(e)" class="cbody__meta"> {{ optionMeta(e) }}</span>
              <LibraryItemBody :item="entryItem(e, spellName)" />
            </div>
          </template>
        </LibraryFold>
      </template>

      <template v-for="g in classGroups" :key="g.slug">
        <h3>{{ g.name }}</h3>
        <LibraryFold
          v-for="e in g.entries"
          :key="e.slug"
          :title="e.name"
          :meta="optionMeta(e)"
          :open="optionHit(e)"
          :class="{ 'is-hit': optionHit(e) }"
        >
          <LibraryItemBody :item="entryItem(e, spellName)" />
          <p class="cbody__source">{{ dnd5eSource(e) }}</p>
        </LibraryFold>
      </template>
    </section>
  </div>
</template>

<style scoped lang="scss">
.cbody__slots .cbody__wide {
  min-width: 220px;
  text-align: left;
}

.cbody__meta {
  font-size: 13px;
  color: var(--page-muted);
}

.cbody__summary .badge {
  margin-left: 6px;
  font-style: normal;
}
</style>
