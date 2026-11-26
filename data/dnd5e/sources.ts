// Every book a 5e (2024) record can come from: the SRD 5.2.1 (CC-BY-4.0, its text kept), then,
// oldest first, the official Wizards of the Coast / D&D Beyond publications Lantern carries as
// mechanics plus its own summaries (see `./NOTICE.md`). `name` is the record's `source`, `short`
// the tag the Library and builder show, `kind` how the source filter groups them. Unearthed
// Arcana, playtests, homebrew and third-party books are never carried.

export type Dnd5eSourceKind = 'core' | 'supplement' | 'setting' | 'drop'

export interface Dnd5eSource {
  name: string
  short: string
  kind: Dnd5eSourceKind
  /** Release month, `YYYY-MM`: a reprint's `source` is the latest book that prints it. */
  released: string
}

export const DND5E_SOURCES = [
  { name: 'SRD 5.2.1', short: 'SRD', kind: 'core', released: '2025-04' },
  { name: 'PHB 2024', short: 'PHB', kind: 'core', released: '2024-09' },
  {
    name: 'Eberron: Forge of the Artificer',
    short: 'Forge of the Artificer',
    kind: 'setting',
    released: '2025-08',
  },
  {
    name: 'Forgotten Realms: Heroes of Faerûn',
    short: 'Heroes of Faerûn',
    kind: 'setting',
    released: '2025-11',
  },
  {
    name: 'Astarion’s Book of Hungers',
    short: 'Book of Hungers',
    kind: 'supplement',
    released: '2025-11',
  },
  { name: 'Lorwyn: First Light', short: 'Lorwyn', kind: 'setting', released: '2025-11' },
  { name: 'D&D Beyond Drops: May 2026', short: 'Drop May 2026', kind: 'drop', released: '2026-05' },
  {
    name: 'D&D Beyond Drops: June 2026',
    short: 'Drop Jun 2026',
    kind: 'drop',
    released: '2026-06',
  },
  {
    name: 'Ravenloft: The Horrors Within',
    short: 'Ravenloft',
    kind: 'setting',
    released: '2026-06',
  },
  {
    name: 'D&D Beyond Drops: July 2026',
    short: 'Drop Jul 2026',
    kind: 'drop',
    released: '2026-07',
  },
  {
    name: 'D&D Beyond Drops: August 2026',
    short: 'Drop Aug 2026',
    kind: 'drop',
    released: '2026-08',
  },
  { name: 'Arcana Unleashed', short: 'Arcana Unleashed', kind: 'supplement', released: '2026-09' },
  {
    name: 'D&D Beyond Drops: September 2026',
    short: 'Drop Sep 2026',
    kind: 'drop',
    released: '2026-09',
  },
  { name: 'Project Lamordia', short: 'Lamordia', kind: 'setting', released: '2026-10' },
  {
    name: 'D&D Beyond Drops: October 2026',
    short: 'Drop Oct 2026',
    kind: 'drop',
    released: '2026-10',
  },
  { name: 'World of Warcraft', short: 'Warcraft', kind: 'setting', released: '2026-11' },
  {
    name: 'D&D Beyond Drops: November 2026',
    short: 'Drop Nov 2026',
    kind: 'drop',
    released: '2026-11',
  },
] as const satisfies readonly Dnd5eSource[]

export type Dnd5eSourceBook = (typeof DND5E_SOURCES)[number]['name']

/** A source's entry by its `name`. */
export const dnd5eSource = (name: Dnd5eSourceBook) => DND5E_SOURCES.find((s) => s.name === name)!
