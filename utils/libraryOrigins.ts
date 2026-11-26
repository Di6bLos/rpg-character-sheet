// Library → Feats, Backgrounds and Species: each system's records as `EntryView`s
// (utils/libraryEntries.ts) with their columns, filters and default sort. 5e SRD entries keep
// the SRD text and page; non-SRD entries show their summary, their mechanics as fact lines
// and a source tag (utils/libraryDnd5e.ts). PF2e entries show their text and book page; Nimble
// ones their Core Rules text.
import type {
  Dnd5eAbility,
  Dnd5eBackgroundDef,
  Dnd5eFeatCategory,
  Dnd5eFeatDef,
  Dnd5eSourceBook,
  Dnd5eSpeciesDef,
} from '~/data/dnd5e/types'
import type { AncestryDef, BackgroundDef } from '~/data/nimble/types'
import type {
  Pf2eAncestryDef,
  Pf2eBackgroundDef,
  Pf2eFeatDef,
  Pf2eHeritageDef,
} from '~/data/pf2e/types'
import { actionSortValue, sourceLabel } from '~/utils/libraryCompendium'
import {
  DND5E_ABILITY,
  DND5E_FEAT_CATEGORY,
  DND5E_SOURCE_KEY,
  DND5E_SOURCE_SHORT,
  choiceLine,
  dnd5eSource,
  entryItem,
  listWords,
  mechanicsFacts,
  slugName,
} from '~/utils/libraryDnd5e'
import {
  facetOptions,
  type EntryFilter,
  type EntryList,
  type EntryView,
} from '~/utils/libraryEntries'
import { actionGlyph, actionWords } from '~/utils/pf2eBuild'

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const RARE = ['Uncommon', 'Rare', 'Unique']
const RARITY_ORDER = ['common', 'uncommon', 'rare', 'unique']

/** The parts every view starts from; builders fill in the rest. */
function view(id: string, name: string, rest: Partial<EntryView>): EntryView {
  return {
    id,
    name,
    cells: {},
    sort: {},
    facets: {},
    badge: '',
    meta: '',
    eyebrow: '',
    traits: [],
    stats: [],
    facts: [],
    parts: [],
    source: '',
    search: '',
    ...rest,
  }
}

const stat = (label: string, value: string | undefined) => (value ? [{ label, value }] : [])

/** 5e: non-SRD entries are tagged with their book, SRD ones aren't. */
const dnd5eTag = (r: { srd: boolean; source: Dnd5eSourceBook }) =>
  r.srd ? undefined : DND5E_SOURCE_SHORT[r.source]

function dnd5eSourceFilter(entries: EntryView[]): EntryFilter {
  const books = Object.keys(DND5E_SOURCE_KEY) as Dnd5eSourceBook[]
  const label = Object.fromEntries(books.map((b) => [DND5E_SOURCE_KEY[b], DND5E_SOURCE_SHORT[b]]))
  return {
    key: 'source',
    label: 'Source',
    kind: 'chips',
    options: facetOptions(entries, 'source', (v) => label[v] ?? v, Object.values(DND5E_SOURCE_KEY)),
  }
}

const dnd5eSourceSort = (r: { source: Dnd5eSourceBook; page?: number }) =>
  `${Object.values(DND5E_SOURCE_KEY).indexOf(DND5E_SOURCE_KEY[r.source])} ${String(r.page ?? 0).padStart(4, '0')}`

// --- Feats ---------------------------------------------------------------------------

const DND5E_CATEGORIES: Dnd5eFeatCategory[] = ['origin', 'general', 'fighting-style', 'epic-boon']

/** What a 5e feat's prerequisite asks for, as filter values. */
function dnd5ePrereqKinds(f: Dnd5eFeatDef): string[] {
  const p = f.prerequisite
  if (!p) return ['none']
  return [
    p.abilities ? 'ability' : '',
    p.feature ? 'feature' : '',
    p.spellcasting ? 'spellcasting' : '',
    p.species?.length ? 'species' : '',
    p.classes?.length ? 'class' : '',
    !p.abilities && !p.feature && !p.spellcasting && !p.species && !p.classes ? 'level' : '',
  ].filter(Boolean)
}

const DND5E_PREREQ: Record<string, string> = {
  none: 'No prerequisite',
  level: 'Level only',
  ability: 'An ability score',
  feature: 'A feature or training',
  spellcasting: 'Spellcasting',
  species: 'A species',
  class: 'A class',
}

export function dnd5eFeatList(feats: readonly Dnd5eFeatDef[]): EntryList {
  const entries = feats.map((f) => {
    const category = DND5E_FEAT_CATEGORY[f.category]
    const prereq = f.prerequisite?.text ?? ''
    const level = f.prerequisite?.level ?? 1
    return view(f.slug, f.name, {
      cells: { category, prereq: prereq || '—', source: dnd5eSource(f) },
      sort: {
        category: DND5E_CATEGORIES.indexOf(f.category),
        prereq: `${String(level).padStart(2, '0')} ${prereq.toLowerCase()}`,
        source: dnd5eSourceSort(f),
      },
      facets: {
        category: [f.category],
        prereq: dnd5ePrereqKinds(f),
        level: [String(level)],
        source: [DND5E_SOURCE_KEY[f.source]],
      },
      badge: category,
      meta: prereq,
      tag: dnd5eTag(f),
      eyebrow: `${category} feat${f.repeatable ? ' · Repeatable' : ''}`,
      stats: [
        { label: 'Category', value: category },
        { label: 'Prerequisite', value: prereq || 'None' },
        ...stat('Repeatable', f.repeatable ? 'Yes' : ''),
      ],
      text: f.text,
      ...(f.text ? {} : { summary: f.summary }),
      facts: f.text ? [] : mechanicsFacts(f),
      parts:
        !f.text && f.benefits.length
          ? [{ title: 'Benefits', items: f.benefits.map((b) => entryItem(b)) }]
          : [],
      source: dnd5eSource(f),
      search: prereq,
    })
  })
  const levels = facetOptions(entries, 'level').sort((a, b) => Number(a.value) - Number(b.value))
  return {
    entries,
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'category', label: 'Category' },
      { key: 'prereq', label: 'Prerequisite' },
      { key: 'source', label: 'Source' },
    ],
    filters: [
      {
        key: 'category',
        label: 'Category',
        kind: 'chips',
        options: facetOptions(
          entries,
          'category',
          (v) => DND5E_FEAT_CATEGORY[v as Dnd5eFeatCategory],
          DND5E_CATEGORIES,
        ),
      },
      {
        key: 'prereq',
        label: 'Prerequisite',
        kind: 'select',
        any: 'Any prerequisite',
        options: facetOptions(
          entries,
          'prereq',
          (v) => DND5E_PREREQ[v] ?? v,
          Object.keys(DND5E_PREREQ),
        ),
      },
      {
        key: 'level',
        label: 'Level',
        kind: 'select',
        any: 'Any level',
        options: levels.map((l) => ({
          value: l.value,
          label: l.value === '1' ? 'No level needed' : `Level ${l.value}+`,
        })),
      },
      dnd5eSourceFilter(entries),
    ],
    defaultSort: 'name',
  }
}

const PF2E_FEAT_CATEGORY: Record<string, string> = {
  ancestry: 'Ancestry',
  class: 'Class',
  archetype: 'Archetype',
  skill: 'Skill',
  general: 'General',
  mythic: 'Mythic',
  other: 'Other',
}

/** A PF2e feat's lists: a class, an ancestry, an archetype, skill or general, or neither. */
export function pf2eFeatCategories(f: Pf2eFeatDef): string[] {
  const cats = [
    f.ancestries.length ? 'ancestry' : '',
    f.classes.length ? 'class' : '',
    f.archetypes.length ? 'archetype' : '',
    f.skill ? 'skill' : '',
    f.general && !f.skill ? 'general' : '',
  ].filter(Boolean)
  if (cats.length) return cats
  return [f.traits.includes('Mythic') ? 'mythic' : 'other']
}

/** "Rogue", "Elf, Half-Elf", "Skill", "Bastion": the lists the feat is on. */
function pf2eFeatFor(f: Pf2eFeatDef): string {
  const lists = [...f.classes, ...f.ancestries, ...f.archetypes]
  if (lists.length) return lists.join(', ')
  return pf2eFeatCategories(f)
    .map((c) => PF2E_FEAT_CATEGORY[c] ?? c)
    .join(', ')
}

export function pf2eFeatList(feats: readonly Pf2eFeatDef[]): EntryList {
  const entries = feats.map((f) => {
    const cats = pf2eFeatCategories(f)
    const forWhom = pf2eFeatFor(f)
    return view(f.id, f.name, {
      cells: {
        level: String(f.level),
        for: forWhom,
        prereq: f.prerequisites ?? '—',
        source: sourceLabel(f.source),
      },
      sort: {
        level: f.level,
        actions: actionSortValue(f.actions),
        source: `${f.source.book.toLowerCase()} ${String(f.source.page ?? 0).padStart(4, '0')}`,
        prereq: f.prerequisites?.toLowerCase(),
      },
      facets: {
        category: cats,
        level: [String(f.level)],
        prereq: [f.prerequisites ? 'some' : 'none'],
        class: f.classes,
        rarity: [f.rarity],
        source: [f.source.book],
      },
      glyph: actionGlyph(f.actions),
      glyphWords: actionWords(f.actions),
      badge: `Level ${f.level}`,
      meta: [forWhom, f.prerequisites].filter(Boolean).join(' · '),
      rarity: f.rarity === 'common' ? undefined : f.rarity,
      eyebrow: `${forWhom} feat ${f.level}`,
      traits: f.traits.filter((t) => !RARE.includes(t)),
      stats: [
        { label: 'Level', value: String(f.level) },
        ...stat('Actions', actionWords(f.actions)),
        ...stat('Prerequisites', f.prerequisites),
        ...stat('Trigger', f.trigger),
        ...stat('Requirements', f.requirements),
        ...stat('Frequency', f.frequency),
        ...stat('Cost', f.cost),
        ...stat('Access', f.access),
        ...stat('Usage', f.usage),
        ...stat('Duration', f.duration),
        ...stat('Class', f.classes.join(', ')),
        ...stat('Ancestry', f.ancestries.join(', ')),
        ...stat('Archetype', f.archetypes.join(', ')),
      ],
      text: f.text,
      source: sourceLabel(f.source),
      search: [f.traits.join(' '), f.prerequisites].filter(Boolean).join(' '),
    })
  })
  return {
    entries,
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'level', label: 'Level' },
      { key: 'actions', label: 'Actions' },
      { key: 'for', label: 'Feat of' },
      { key: 'prereq', label: 'Prerequisites' },
      { key: 'source', label: 'Source' },
    ],
    filters: [
      {
        key: 'category',
        label: 'Category',
        kind: 'chips',
        options: facetOptions(
          entries,
          'category',
          (v) => PF2E_FEAT_CATEGORY[v] ?? v,
          Object.keys(PF2E_FEAT_CATEGORY),
        ),
      },
      {
        key: 'level',
        label: 'Level',
        kind: 'select',
        any: 'Any level',
        options: Array.from({ length: 20 }, (_, i) => ({
          value: String(i + 1),
          label: `Level ${i + 1}`,
        })),
      },
      {
        key: 'class',
        label: 'Class',
        kind: 'select',
        any: 'Any class',
        options: facetOptions(entries, 'class'),
      },
      {
        key: 'prereq',
        label: 'Prerequisites',
        kind: 'select',
        any: 'With or without',
        options: [
          { value: 'none', label: 'No prerequisites' },
          { value: 'some', label: 'Has prerequisites' },
        ],
      },
      {
        key: 'rarity',
        label: 'Rarity',
        kind: 'select',
        any: 'Any rarity',
        options: facetOptions(entries, 'rarity', cap, RARITY_ORDER),
      },
      {
        key: 'source',
        label: 'Source',
        kind: 'select',
        any: 'Any book',
        options: facetOptions(entries, 'source'),
      },
    ],
    defaultSort: 'level',
  }
}

// --- Backgrounds ---------------------------------------------------------------------

const ABILITY_ORDER = Object.keys(DND5E_ABILITY)

export function dnd5eBackgroundList(
  backgrounds: readonly Dnd5eBackgroundDef[],
  feats: readonly Dnd5eFeatDef[],
): EntryList {
  const featName = (slug: string) => feats.find((f) => f.slug === slug)?.name ?? slugName(slug)
  const entries = backgrounds.map((b) => {
    const feat = `${featName(b.feat.slug)}${b.feat.option ? ` (${b.feat.option})` : ''}`
    const abilities = b.abilities.map((a) => DND5E_ABILITY[a])
    const tool = b.tool ?? (b.toolChoice ? choiceLine(b.toolChoice) : '')
    return view(b.slug, b.name, {
      cells: {
        abilities: b.abilities.join(', '),
        feat,
        skills: b.skills.join(', '),
        source: dnd5eSource(b),
      },
      sort: { source: dnd5eSourceSort(b) },
      facets: { ability: b.abilities, source: [DND5E_SOURCE_KEY[b.source]] },
      badge: b.abilities.join(' '),
      meta: [feat, b.skills.join(', ')].join(' · '),
      tag: dnd5eTag(b),
      eyebrow: 'Background',
      // The SRD text is these same lines, so only non-SRD backgrounds list them as fields.
      stats: b.text
        ? []
        : [
            { label: 'Ability scores', value: listWords(abilities) },
            { label: 'Feat', value: feat },
            { label: 'Skill proficiencies', value: listWords(b.skills) },
            ...stat('Tool proficiency', tool),
            ...stat('Equipment', b.equipment.map((e) => `(${e.option}) ${e.items}`).join('; or ')),
          ],
      text: b.text,
      ...(b.text ? {} : { summary: b.summary }),
      source: dnd5eSource(b),
      search: [feat, b.skills.join(' '), tool].join(' '),
    })
  })
  return {
    entries,
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'abilities', label: 'Ability scores' },
      { key: 'feat', label: 'Feat' },
      { key: 'skills', label: 'Skills' },
      { key: 'source', label: 'Source' },
    ],
    filters: [
      {
        key: 'ability',
        label: 'Ability score',
        kind: 'chips',
        options: facetOptions(
          entries,
          'ability',
          (v) => DND5E_ABILITY[v as Dnd5eAbility] ?? v,
          ABILITY_ORDER,
        ),
      },
      dnd5eSourceFilter(entries),
    ],
    defaultSort: 'name',
  }
}

/** An ancestry's boosts, every one of them given: "Strength, Wisdom and a free boost". */
function pf2eBoosts(boosts: readonly string[]): string {
  const named = boosts.filter((b) => b !== 'Free')
  const free = boosts.length - named.length
  return listWords([
    ...named,
    ...(free ? [free === 1 ? 'a free boost' : `${free} free boosts`] : []),
  ])
}

export function pf2eBackgroundList(backgrounds: readonly Pf2eBackgroundDef[]): EntryList {
  const entries = backgrounds.map((b) => {
    const skills = [
      ...b.skills,
      ...(b.skillChoices ?? []).map(
        (c) =>
          `${c.count > 1 ? `${c.count} of ` : ''}${c.options.length ? listWords(c.options, 'or') : 'any skill'}`,
      ),
      ...(b.deitySkill ? ["your deity's skill"] : []),
    ]
    return view(b.id, b.name, {
      cells: {
        boosts: listWords(b.boosts, 'or'),
        skills: skills.join(', '),
        feat: b.feats.join(', ') || '—',
        source: sourceLabel(b.source),
      },
      sort: {
        source: `${b.source.book.toLowerCase()} ${String(b.source.page ?? 0).padStart(4, '0')}`,
      },
      facets: { boost: b.boosts, rarity: [b.rarity], source: [b.source.book] },
      badge: b.boosts.map((x) => x.slice(0, 3)).join(' '),
      meta: [skills.join(', '), b.feats.join(', ')].filter(Boolean).join(' · '),
      rarity: b.rarity === 'common' ? undefined : b.rarity,
      eyebrow: 'Background',
      traits: b.traits.filter((t) => !RARE.includes(t)),
      stats: [
        ...stat(
          'Attribute boosts',
          b.boosts.length ? `${listWords(b.boosts, 'or')}, and a free boost` : '',
        ),
        ...stat('Skills', skills.join('; ')),
        ...stat('Skill feat', b.feats.join(', ')),
      ],
      text: b.text,
      source: sourceLabel(b.source),
      search: b.traits.join(' '),
    })
  })
  return {
    entries,
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'boosts', label: 'Boosts' },
      { key: 'skills', label: 'Skills' },
      { key: 'feat', label: 'Skill feat' },
      { key: 'source', label: 'Source' },
    ],
    filters: [
      {
        key: 'boost',
        label: 'Attribute',
        kind: 'chips',
        options: facetOptions(entries, 'boost', undefined, [
          'Strength',
          'Dexterity',
          'Constitution',
          'Intelligence',
          'Wisdom',
          'Charisma',
        ]),
      },
      {
        key: 'rarity',
        label: 'Rarity',
        kind: 'select',
        any: 'Any rarity',
        options: facetOptions(entries, 'rarity', cap, RARITY_ORDER),
      },
      {
        key: 'source',
        label: 'Source',
        kind: 'select',
        any: 'Any book',
        options: facetOptions(entries, 'source'),
      },
    ],
    defaultSort: 'name',
  }
}

const signed = (n: number) => (n > 0 ? `+${n}` : `–${-n}`)

/** What a Nimble background changes on the sheet, from its fields: "–1 max Wounds". */
export function nimbleBackgroundGrants(b: BackgroundDef): string[] {
  return [
    b.woundsMax ? `${signed(b.woundsMax)} max Wounds` : '',
    b.hitDice ? `${signed(b.hitDice)} max Hit Dice` : '',
    b.armor ? `${signed(b.armor)} Armor` : '',
    b.initiative ? `${signed(b.initiative)} Initiative` : '',
    ...Object.entries(b.skills ?? {}).map(([skill, n]) => `${signed(n)} ${skill}`),
    b.choice ? b.choice.label : '',
  ].filter(Boolean)
}

export function nimbleBackgroundList(backgrounds: readonly BackgroundDef[]): EntryList {
  const entries = backgrounds.map((b) => {
    const requires = b.requires ? `${b.requires.stat} ${b.requires.max} or less` : ''
    const grants = nimbleBackgroundGrants(b)
    return view(b.slug, b.name, {
      cells: { requires: requires || '—', grants: grants.join(', ') || '—' },
      facets: { requires: [b.requires ? 'yes' : 'no'] },
      badge: requires,
      meta: b.desc,
      eyebrow: 'Background',
      stats: [...stat('Requires', requires), ...stat('On your sheet', grants.join(', '))],
      text: b.desc,
      source: 'Core Rules pp. 28–29',
    })
  })
  return {
    entries,
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'requires', label: 'Requires' },
      { key: 'grants', label: 'On your sheet' },
    ],
    filters: [
      {
        key: 'requires',
        label: 'Stat requirement',
        kind: 'select',
        any: 'Any background',
        options: [
          { value: 'no', label: 'Open to anyone' },
          { value: 'yes', label: 'Needs a low stat' },
        ],
      },
    ],
    defaultSort: 'name',
  }
}

// --- Species and ancestries ------------------------------------------------------------

const SIZE_ORDER = ['Tiny', 'Small', 'Medium', 'Large']

export function dnd5eSpeciesList(species: readonly Dnd5eSpeciesDef[]): EntryList {
  const entries = species.map((s) => {
    const size = listWords(s.sizes, 'or')
    const traits = s.traits.map((t) =>
      entryItem(t, slugName, t.level && t.level > 1 ? `From level ${t.level}` : undefined),
    )
    const lineages = s.lineages
    return view(s.slug, s.name, {
      cells: { size, speed: `${s.speed} ft`, type: s.creatureType, source: dnd5eSource(s) },
      sort: {
        size: Math.min(...s.sizes.map((z) => SIZE_ORDER.indexOf(z))),
        speed: s.speed,
        source: dnd5eSourceSort(s),
      },
      facets: { size: s.sizes, source: [DND5E_SOURCE_KEY[s.source]] },
      badge: size,
      meta: [s.creatureType, `${s.speed} ft`, s.traits.map((t) => t.name).join(', ')].join(' · '),
      tag: dnd5eTag(s),
      eyebrow: `${s.creatureType} species`,
      stats: s.text
        ? []
        : [
            { label: 'Creature type', value: s.creatureType },
            { label: 'Size', value: s.sizeText },
            { label: 'Speed', value: `${s.speed} feet` },
          ],
      text: s.text,
      ...(s.text ? {} : { summary: s.summary }),
      parts: s.text
        ? []
        : [
            { title: 'Traits', items: traits },
            ...(lineages
              ? [
                  {
                    title: lineages.label,
                    items: lineages.options.map((o) => {
                      const item = entryItem(o)
                      const spells = (o.spells ?? []).map(
                        (x) => `${slugName(x.spell)} (level ${x.level})`,
                      )
                      return spells.length
                        ? { ...item, facts: [...item.facts, `Spells: ${spells.join(', ')}`] }
                        : item
                    }),
                  },
                ]
              : []),
          ],
      source: dnd5eSource(s),
      search: s.traits.map((t) => t.name).join(' '),
    })
  })
  return {
    entries,
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'size', label: 'Size' },
      { key: 'speed', label: 'Speed' },
      { key: 'type', label: 'Creature type' },
      { key: 'source', label: 'Source' },
    ],
    filters: [
      {
        key: 'size',
        label: 'Size',
        kind: 'chips',
        options: facetOptions(entries, 'size', undefined, SIZE_ORDER),
      },
      dnd5eSourceFilter(entries),
    ],
    defaultSort: 'name',
  }
}

export function pf2eAncestryList(
  ancestries: readonly Pf2eAncestryDef[],
  heritages: readonly Pf2eHeritageDef[],
): EntryList {
  const entries = ancestries.map((a) => {
    const own = heritages.filter((h) => h.ancestry === a.slug)
    const size = listWords(a.size, 'or')
    return view(a.id, a.name, {
      cells: {
        hp: String(a.hp),
        size,
        speed: `${a.speed} ft`,
        boosts: pf2eBoosts(a.boosts),
        source: sourceLabel(a.source),
      },
      sort: {
        hp: a.hp,
        size: Math.min(...a.size.map((z) => SIZE_ORDER.indexOf(z))),
        speed: a.speed,
        source: `${a.source.book.toLowerCase()} ${String(a.source.page ?? 0).padStart(4, '0')}`,
      },
      facets: { size: a.size, rarity: [a.rarity], source: [a.source.book] },
      badge: `${a.hp} HP`,
      meta: [size, `${a.speed} ft`, pf2eBoosts(a.boosts)].join(' · '),
      rarity: a.rarity === 'common' ? undefined : a.rarity,
      eyebrow: 'Ancestry',
      traits: a.traits.filter((t) => !RARE.includes(t)),
      stats: [
        { label: 'Hit Points', value: String(a.hp) },
        { label: 'Size', value: size },
        { label: 'Speed', value: `${a.speed} feet` },
        ...stat('Attribute boosts', pf2eBoosts(a.boosts)),
        ...stat('Attribute flaw', a.flaws.join(', ')),
        ...stat('Languages', a.languages.join(', ')),
        ...stat('Senses', a.vision),
      ],
      text: a.text,
      parts: own.length
        ? [
            {
              title: 'Heritages',
              items: own.map((h) => ({
                name: h.name,
                meta: [h.rarity === 'common' ? '' : cap(h.rarity), sourceLabel(h.source)]
                  .filter(Boolean)
                  .join(' · '),
                text: h.text,
                facts: [],
              })),
            },
          ]
        : [],
      source: sourceLabel(a.source),
      search: a.traits.join(' '),
    })
  })
  return {
    entries,
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'hp', label: 'HP' },
      { key: 'size', label: 'Size' },
      { key: 'speed', label: 'Speed' },
      { key: 'boosts', label: 'Boosts' },
      { key: 'source', label: 'Source' },
    ],
    filters: [
      {
        key: 'size',
        label: 'Size',
        kind: 'chips',
        options: facetOptions(entries, 'size', undefined, SIZE_ORDER),
      },
      {
        key: 'rarity',
        label: 'Rarity',
        kind: 'select',
        any: 'Any rarity',
        options: facetOptions(entries, 'rarity', cap, RARITY_ORDER),
      },
      {
        key: 'source',
        label: 'Source',
        kind: 'select',
        any: 'Any book',
        options: facetOptions(entries, 'source'),
      },
    ],
    defaultSort: 'name',
  }
}

export function nimbleAncestryList(ancestries: readonly AncestryDef[]): EntryList {
  const entries = ancestries.map((a) => {
    const rarity = a.exotic ? 'Exotic' : 'Common'
    return view(a.slug, a.name, {
      cells: { size: a.size, rarity, trait: a.trait.name },
      sort: { rarity: a.exotic ? 1 : 0 },
      facets: {
        rarity: [a.exotic ? 'exotic' : 'common'],
        size: a.size.split(' or '),
      },
      badge: rarity,
      meta: `${a.size} · ${a.trait.name}`,
      eyebrow: `${rarity} ancestry`,
      stats: [
        { label: 'Size', value: a.size },
        { label: 'Rarity', value: a.exotic ? 'Exotic (check with your GM)' : 'Common' },
        ...stat('Language', a.language),
      ],
      text: a.description,
      parts: [{ title: 'Trait', items: [{ name: a.trait.name, text: a.trait.desc, facts: [] }] }],
      source: 'Core Rules pp. 22–27',
    })
  })
  return {
    entries,
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'rarity', label: 'Rarity' },
      { key: 'size', label: 'Size' },
      { key: 'trait', label: 'Trait' },
    ],
    filters: [
      {
        key: 'rarity',
        label: 'Rarity',
        kind: 'chips',
        options: [
          { value: 'common', label: 'Common' },
          { value: 'exotic', label: 'Exotic' },
        ],
      },
      {
        key: 'size',
        label: 'Size',
        kind: 'chips',
        options: facetOptions(entries, 'size', undefined, SIZE_ORDER),
      },
    ],
    defaultSort: 'name',
  }
}
