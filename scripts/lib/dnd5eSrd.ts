// The SRD 5.2.1 cut into entries for the 5e generator: the heading tree of `srdBlocks`, then
// one function per kind of entry (classes, subclasses, species, backgrounds, feats, spells,
// metamagic, invocations, conditions, magic items, equipment names). Each entry keeps its
// printed page and its text as markdown.

import { type SrdBlock, blocksMarkdown } from './srd'

export interface SrdSection {
  title: string
  size: number
  page: number
  blocks: SrdBlock[]
  children: SrdSection[]
}

/** Nests the blocks under their headings: a smaller heading starts a child section. */
export function sectionTree(blocks: SrdBlock[]): SrdSection {
  const root: SrdSection = { title: '', size: 99, page: 0, blocks: [], children: [] }
  const stack = [root]
  for (const b of blocks) {
    if (b.kind === 'heading') {
      while (stack.at(-1)!.size <= b.size) stack.pop()
      const s: SrdSection = { title: b.text, size: b.size, page: b.page, blocks: [], children: [] }
      stack.at(-1)!.children.push(s)
      stack.push(s)
    } else stack.at(-1)!.blocks.push(b)
  }
  return root
}

export function find(s: SrdSection, title: string | RegExp): SrdSection | undefined {
  for (const c of s.children) {
    if (typeof title === 'string' ? c.title === title : title.test(c.title)) return c
    const deep = find(c, title)
    if (deep) return deep
  }
  return undefined
}

/** A section's blocks with its subsections' headings, in order (`skip` leaves some out). */
export function flatBlocks(
  s: SrdSection,
  skip: (c: SrdSection) => boolean = () => false,
): SrdBlock[] {
  return [
    ...s.blocks,
    ...s.children.flatMap((c) =>
      // A skipped section (a class table set mid-feature) drops its heading and rows but keeps
      // the text that follows it on the page.
      skip(c)
        ? flatBlocks(
            {
              ...c,
              blocks: c.blocks.filter((b) => b.kind !== 'row'),
              // Header cells the book sets as headings ("Proficiency") go with the table.
              children: c.children.filter(
                (x) => x.blocks.some((b) => b.kind === 'para') || x.children.length,
              ),
            },
            skip,
          )
        : [
            { kind: 'heading', page: c.page, size: c.size, text: c.title } as SrdBlock,
            ...flatBlocks(c, skip),
          ],
    ),
  ]
}

/** A section's text as markdown, its subsections as bold-headed parts. */
export function sectionText(s: SrdSection, skip?: (c: SrdSection) => boolean): string {
  return blocksMarkdown(flatBlocks(s, skip), 4)
    .replace(/^#{4,6} (.+)$/gm, '**$1**')
    .trim()
}

/** The last page a section reaches. */
export function lastPage(s: SrdSection): number {
  return Math.max(s.page, ...s.blocks.map((b) => b.page), ...s.children.map(lastPage))
}

/** Table rows under a section (its own blocks only). */
export const rows = (s: SrdSection | undefined) =>
  (s?.blocks ?? []).flatMap((b) => (b.kind === 'row' ? [b.cells] : []))

/** The "Label: value" lines of a stat paragraph run (background and species headers). */
export function labels(s: SrdSection): Record<string, string> {
  const out: Record<string, string> = {}
  for (const b of s.blocks) {
    if (b.kind !== 'para') continue
    const m = b.text.match(/^\*\*([^*]+):\*\*\s*(.*)$/)
    if (m) out[m[1]!.trim()] = m[2]!.replace(/[_*]/g, '').trim()
  }
  return out
}

export interface SrdEntry {
  name: string
  page: number
  text: string
  section: SrdSection
}

const entry = (s: SrdSection, skip?: (c: SrdSection) => boolean): SrdEntry => ({
  name: s.title.replace(/\s*\[[^\]]+\]$/, ''),
  page: s.page,
  text: sectionText(s, skip),
  section: s,
})

/** Every SRD entry the generator reads, by kind. */
export function srdIndex(root: SrdSection) {
  const classes = root.children
    .find((c) => c.title === 'Classes')!
    .children.filter((c) => c.size === 18)
  const spells = find(root, 'Spell Descriptions')!.children.map((s) => entry(s))
  const featGroups = find(root, 'Feat Descriptions')!.children.filter((c) =>
    c.title.endsWith('Feats'),
  )
  const feats = featGroups.flatMap((g) => g.children.map((s) => ({ ...entry(s), group: g.title })))
  const backgrounds = find(root, 'Background Descriptions')!.children.map((s) => entry(s))
  const species = find(root, 'Species Descriptions')!.children.map((s) => entry(s))
  const glossary = find(root, 'Rules Definitions')!.children.map((s) => ({
    ...entry(s),
    tag: s.title.match(/\[([^\]]+)\]$/)?.[1],
  }))
  const magicItems = find(root, 'Magic Items A–Z')!.children.map((s) => entry(s))
  const metamagic = find(root, 'Metamagic Options')!.children.map((s) => entry(s))
  const invocations = find(root, 'Eldritch Invocation Options')!.children.map((s) => entry(s))
  const masteries = find(root, 'Mastery Properties')!.children.map((s) => entry(s))
  return {
    classes,
    spells,
    feats,
    backgrounds,
    species,
    glossary,
    magicItems,
    metamagic,
    invocations,
    masteries,
  }
}

export type SrdIndex = ReturnType<typeof srdIndex>

/** A class section's parts: Core Traits rows, the class table, features and subclass. */
export function srdClass(c: SrdSection) {
  const name = c.title
  const traits = Object.fromEntries(
    rows(find(c, `Core ${name} Traits`)).map((r) => [r[0]!, r.slice(1).join(' ')]),
  )
  const table = rows(find(c, `${name} Features`))
  const featureRoot = find(c, `${name} Class Features`)!
  // The class table and the parts of its header the book sets as headings.
  const isTable = (s: SrdSection) =>
    s.title === `${name} Features` ||
    /Spell Slots per Spell Level|^(Proficiency|Bonus|Level)$/.test(s.title)
  // Rows of the class table that land inside a feature's text (Paladin's Lay On Hands).
  const tableRow = (b: SrdBlock) =>
    (b.kind === 'para' &&
      /^(\*\*[—–-]*(Spell Slots per Spell Level|Proficiency|Bonus|Level|Prepared|Spells|Cantrips)[—–-]*\*\*\s*)+$/.test(
        b.text,
      )) ||
    (b.kind === 'row' &&
      b.cells.some((x) => /Prepared Spells|Spell Slots per|^Cantrips$/.test(x)) &&
      !b.cells.some((x) => /Spell Slot Level/.test(x))) ||
    (b.kind === 'row' &&
      b.cells.length >= 3 &&
      (/^\+\d$/.test(b.cells[1] ?? '') ||
        b.cells.some((x) => /Class Features|Proficiency Bonus/.test(x)) ||
        (b.cells.length >= 4 && b.cells.every((x) => /^(\d+|[—–-]|\+\d|D\d+)$/.test(x)))))
  const strip = (s: SrdSection): SrdSection => ({
    ...s,
    blocks: s.blocks.filter((b) => !tableRow(b)),
    children: s.children.map(strip),
  })
  const features = featureRoot.children
    .filter((s) => /^Level \d+:/.test(s.title))
    .map((s) => {
      const m = s.title.match(/^Level (\d+): (.+)$/)!
      return { ...entry(strip(s), isTable), name: m[2]!, level: Number(m[1]) }
    })
  const sub = c.children.find((s) => /Subclass:/.test(s.title))
  const subclass = sub && {
    ...entry(sub),
    name: sub.title.replace(/^.*Subclass:\s*/, ''),
    lead: blocksMarkdown(sub.blocks, 4),
    features: sub.children
      .filter((s) => /^Level \d+:/.test(s.title))
      .map((s) => {
        const m = s.title.match(/^Level (\d+): (.+)$/)!
        return { ...entry(s), name: m[2]!, level: Number(m[1]) }
      }),
    tables: sub.children
      .flatMap((s) => [s, ...s.children])
      .filter((s) => rows(s).length)
      .map((s) => ({ title: s.title, rows: rows(s) })),
  }
  return { name, page: c.page, traits, table, features, subclass, section: c }
}
