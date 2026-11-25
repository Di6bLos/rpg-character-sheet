<script setup lang="ts">
// One Nimble class in Library → Classes: its pitch and numbers, the level 1–20 table, features
// by level, each ability pool's options and the subclasses. During a search only the matching
// abilities show, opened.
import type { AbilityDef, ClassDef, PoolOption, SubclassDef } from '~/data/nimble/types'
import {
  nimbleAdvancement,
  nimbleLevelGroups,
  type NimbleClassMatch,
} from '~/utils/libraryCompendium'

const props = defineProps<{ cls: ClassDef; match: NimbleClassMatch; searching: boolean }>()

const whole = computed(() => props.match.whole)
const openHits = computed(() => props.searching && !whole.value)
const shows = (a: AbilityDef) => props.match.shows(a)

const facts = computed(() => {
  const c = props.cls
  const r = c.resource
  return [
    { label: 'Key stats', value: c.keyStats.join(', ') },
    { label: 'Hit Dice', value: `d${c.hitDie}` },
    { label: 'Starting HP', value: String(c.startingHp) },
    { label: 'Saves', value: `Advantage on ${c.saveAdv}, disadvantage on ${c.saveDis}` },
    { label: 'Armor', value: c.armor },
    { label: 'Weapons', value: c.weapons },
    { label: 'Mana', value: c.mana?.label ?? '' },
    {
      label: 'Class resource',
      value: r
        ? `${r.name}${r.diceName && r.diceName !== r.name ? ` (${r.diceName})` : ''}${r.die ? `, d${r.die}` : ''}`
        : '',
    },
    { label: 'Complexity', value: '●'.repeat(c.complexity) + '○'.repeat(3 - c.complexity) },
  ].filter((f) => f.value)
})

const table = computed(() => nimbleAdvancement(props.cls))
const hasTier = computed(() => table.value.some((r) => r.tier !== undefined))
const levels = computed(() =>
  nimbleLevelGroups(props.cls.levels)
    .map((g) => ({ ...g, abilities: g.abilities.filter(shows) }))
    .filter((g) => g.abilities.length || (whole.value && g.notes.length)),
)
const pools = computed(() =>
  props.cls.pools
    .map((p) => ({ ...p, options: p.options.filter(shows) }))
    .filter((p) => p.options.length),
)
const subclasses = computed(() =>
  props.cls.subclasses.filter((s) => whole.value || props.match.subclasses.has(s.slug)),
)

const optionMeta = (o: PoolOption) =>
  [o.requires ? `Needs ${o.requires}` : '', o.repeatable ? 'Repeatable' : '']
    .filter(Boolean)
    .join(' · ')
const subclassMeta = (s: SubclassDef) =>
  [s.tagline, s.story ? 'Story subclass' : ''].filter(Boolean).join(' · ')
</script>

<template>
  <div class="cbody">
    <template v-if="whole">
      <p class="cbody__summary">{{ cls.tagline }} {{ cls.description }}</p>
      <ul v-if="cls.highlights.length" class="cbody__list">
        <li v-for="h in cls.highlights" :key="h">{{ h }}</li>
      </ul>
      <dl class="cbody__facts">
        <div v-for="f in facts" :key="f.label">
          <dt>{{ f.label }}</dt>
          <dd :aria-label="f.label === 'Complexity' ? `${cls.complexity} of 3` : undefined">
            {{ f.value }}
          </dd>
        </div>
      </dl>

      <h3>Advancement</h3>
      <div class="table-wrap" tabindex="0" role="region" :aria-label="`${cls.name} advancement`">
        <table class="table table--rules">
          <thead>
            <tr>
              <th scope="col">Level</th>
              <th scope="col">Features</th>
              <th v-if="hasTier" scope="col">Spell tier</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in table" :key="r.level">
              <td>{{ r.level }}</td>
              <td>{{ r.features.join(', ') || '—' }}</td>
              <td v-if="hasTier">
                {{ r.tier === undefined ? '' : r.tier === 0 ? 'Cantrips' : r.tier }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <template v-if="levels.length || shows(cls.swapRule)">
      <h3>Class features</h3>
      <section v-for="g in levels" :key="g.level">
        <h4>Level {{ g.level }}</h4>
        <LibraryFold v-for="a in g.abilities" :key="a.name" :title="a.name" :open="openHits">
          <p class="cbody__text">{{ a.desc }}</p>
        </LibraryFold>
        <ul v-if="whole && g.notes.length" class="cbody__notes">
          <li v-for="n in g.notes" :key="n">{{ n }}</li>
        </ul>
      </section>
      <section v-if="shows(cls.swapRule)">
        <h4>Changing your options</h4>
        <LibraryFold :title="cls.swapRule.name" :open="openHits">
          <p class="cbody__text">{{ cls.swapRule.desc }}</p>
        </LibraryFold>
      </section>
    </template>

    <section v-for="p in pools" :key="p.id">
      <h3>{{ p.name }}</h3>
      <p v-if="p.note && whole" class="cbody__text small">{{ p.note }}</p>
      <LibraryFold
        v-for="o in p.options"
        :key="o.name"
        :title="o.name"
        :meta="optionMeta(o)"
        :open="openHits"
      >
        <p class="cbody__text">{{ o.desc }}</p>
      </LibraryFold>
    </section>

    <template v-if="subclasses.length">
      <h3>Subclasses</h3>
      <LibraryFold
        v-for="s in subclasses"
        :key="s.slug"
        :title="s.name"
        :meta="subclassMeta(s)"
        :open="openHits"
      >
        <div v-for="a in s.intro ?? []" :key="a.name" class="cbody__ability">
          <strong>{{ a.name }}.</strong> {{ a.desc }}
        </div>
        <template v-for="g in nimbleLevelGroups(s.levels)" :key="g.level">
          <h4>Level {{ g.level }}</h4>
          <div
            v-for="a in g.abilities"
            :key="a.name"
            class="cbody__ability"
            :class="{ 'is-hit': openHits && shows(a) }"
          >
            <strong>{{ a.name }}.</strong> {{ a.desc }}
          </div>
        </template>
      </LibraryFold>
    </template>
  </div>
</template>
