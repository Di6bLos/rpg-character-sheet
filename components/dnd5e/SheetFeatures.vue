<script setup lang="ts">
// The 5e sheet's features, feats and options as Nimble's ability card grid ("All abilities"):
// class and subclass features, species traits, feats, then each option group's picks
// (Eldritch Invocations, Metamagic, maneuvers, Arcane Shots, plans…), every card with where it's
// from, its cost and uses, its dice and save, and its text (SRD text or Lantern's summary).
// Using them is in Actions, Reactions and Attacks; the proficiencies close the panel.
import type { Dnd5eSheet } from '~/types/sheets'
import type { Dnd5eEntry } from '~/utils/dnd5eFeatures'
import { COST_LABEL, usesLeft } from '~/utils/dnd5ePlay'
import { loreHtml } from '~/utils/loreText'

const { draft } = useSheet<Dnd5eSheet>()
const { entries } = useDnd5eSheet()
const sheet = computed(() => draft.value.sheet)

const KINDS: { kind: Dnd5eEntry['kind']; label: string }[] = [
  { kind: 'class', label: 'Class features' },
  { kind: 'subclass', label: 'Subclass features' },
  { kind: 'species', label: 'Species traits' },
  { kind: 'feat', label: 'Feats' },
  { kind: 'other', label: 'Other features' },
]

const groups = computed(() => {
  const main = entries.value.filter((e) => !e.parent)
  const out = KINDS.map((k) => ({
    label: k.label,
    entries: main.filter((e) => e.kind === k.kind),
  }))
  const options = new Map<string, Dnd5eEntry[]>()
  for (const e of entries.value.filter((x) => x.kind === 'option'))
    options.set(e.from, [...(options.get(e.from) ?? []), e])
  return [...out, ...[...options].map(([label, list]) => ({ label, entries: list }))].filter(
    (g) => g.entries.length,
  )
})

function uses(e: Dnd5eEntry) {
  if (!e.resource) return ''
  const r = sheet.value.resources?.find((x) => x.name === e.resource)
  return r
    ? `${usesLeft(sheet.value, r.name)} / ${r.max} ${r.name === e.name ? 'left' : r.name}`
    : ''
}

const detail = (e: Dnd5eEntry) =>
  [
    e.cost && e.cost !== 'special' ? COST_LABEL[e.cost] : '',
    uses(e),
    e.dice ? `${e.dice}${e.damageType ? ` ${e.damageType}` : ''}` : '',
    e.save ? `DC ${e.save.dc} ${e.save.ability}` : '',
    e.oncePerTurn ? 'once a turn' : '',
  ]
    .filter(Boolean)
    .join(' · ')

const profs = computed(() => {
  const p = sheet.value.proficiencies
  if (!p) return []
  return [
    { label: 'Armor', value: p.armor.join(', ') },
    { label: 'Weapons', value: p.weapons.join(', ') },
    { label: 'Tools', value: p.tools.join(', ') },
    { label: 'Languages', value: p.languages.join(', ') },
    {
      label: 'Senses',
      value: (sheet.value.senses ?? []).map((s) => `${s.name} ${s.range} ft`).join(', '),
    },
    { label: 'Resistances', value: sheet.value.defenses?.resistances.join(', ') ?? '' },
    {
      label: 'Immunities',
      value: [
        ...(sheet.value.defenses?.immunities ?? []),
        ...(sheet.value.defenses?.conditionImmunities ?? []),
      ].join(', '),
    },
  ].filter((x) => x.value)
})
</script>

<template>
  <section class="panel stack" style="gap: 12px" aria-labelledby="ft-h">
    <UiFold name="All abilities" />
    <div class="title-help">
      <h2 id="ft-h">Features &amp; feats</h2>
      <UiHelp
        label="About features"
        text="Everything your class, subclass, species, background feat and later feats give you, and the options you picked. Those with a cost or uses are in Actions, Reactions and Attacks."
      />
    </div>
    <template v-for="g in groups" :key="g.label">
      <h3 class="caps group">{{ g.label }}</h3>
      <div class="abilities">
        <article v-for="e in g.entries" :key="e.key" class="tile ability">
          <div class="ability__head">
            <strong>{{ e.name }}</strong>
            <small>{{ e.from }}</small>
          </div>
          <small v-if="detail(e)" class="ability__detail">{{ detail(e) }}</small>
          <!-- eslint-disable-next-line vue/no-v-html -- loreHtml escapes everything first -->
          <div v-if="e.text" class="ability__text" v-html="loreHtml(e.text)" />
          <details v-if="e.full" class="full">
            <summary class="small">Full rules (SRD 5.2.1)</summary>
            <!-- eslint-disable-next-line vue/no-v-html -- loreHtml escapes everything first -->
            <div class="ability__text" v-html="loreHtml(e.full)" />
          </details>
        </article>
      </div>
    </template>
    <p v-if="!groups.length" class="empty">No features recorded yet.</p>
    <dl v-if="profs.length" class="profs">
      <template v-for="p in profs" :key="p.label">
        <dt class="caps">{{ p.label }}</dt>
        <dd>{{ p.value }}</dd>
      </template>
    </dl>
  </section>
</template>

<style scoped lang="scss">
@use '../../assets/styles/abilities';

.group {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--accent-text);
}

.ability__detail {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-text);
}

.ability__text {
  font-size: 13px;
  line-height: 1.5;
  color: var(--page-soft);

  :deep(p) {
    margin: 0.3em 0;
  }
}

.full summary {
  min-height: 28px;
  display: flex;
  align-items: center;
  color: var(--page-muted);
  cursor: pointer;

  @media (pointer: coarse) {
    min-height: 44px;
  }
}

.ability__text :deep(table) {
  display: block;
  max-width: 100%;
  overflow-x: auto;
  font-size: 12px;
}

.profs {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 4px 14px;
  margin: 8px 0 0;
  font-size: 13px;

  dt {
    font-size: 11px;
    align-self: baseline;
  }

  dd {
    margin: 0;
    color: var(--page-soft);
  }
}
</style>
