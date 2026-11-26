// The copy check for 5e entries that aren't in the SRD: their prose (summaries Lantern wrote)
// must not share a run of `RUN` words with the wiki page their facts were checked against.
// Runs that the SRD itself prints (rules boilerplate like "until the end of your next turn",
// already open under CC-BY) and a few stock phrases don't count.

/** Words of a text, lowercased, without punctuation. */
export const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)

export const RUN = 8

/** Every run of `n` words in a text, as strings. */
export function runs(s: string, n = RUN): Set<string> {
  const w = words(s)
  const out = new Set<string>()
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(' '))
  return out
}

/** Phrases too common to count as copying, beyond what the SRD prints. */
export const STOCK = [
  'a creature of your choice within',
  'a creature you can see within',
  'until the end of your next turn',
  'until the start of your next turn',
  'when you finish a long rest',
  'when you finish a short or long rest',
  'equal to your proficiency bonus',
  'equal to your spellcasting ability modifier',
]

/** The runs of `prose` that also appear in `source`, less those in `open` or the stock phrases. */
export function copiedRuns(prose: string, source: Set<string>, open: Set<string>, n = RUN) {
  const stock = STOCK.map((p) => words(p).join(' '))
  return [...runs(prose, n)].filter(
    (r) => source.has(r) && !open.has(r) && !stock.some((p) => r.includes(p)),
  )
}

/** Every summary-like string in an entry, nested features, options and benefits included. */
export function prose(entry: unknown): string[] {
  const out: string[] = []
  const walk = (v: unknown, key = '') => {
    if (typeof v === 'string') {
      if (key === 'summary' || key === 'higherLevel') out.push(v)
      return
    }
    if (Array.isArray(v)) for (const x of v) walk(x, key)
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>
      // An SRD part inside a non-SRD entry keeps the SRD's own text.
      if (o['srd'] === true) return
      for (const [k, x] of Object.entries(o)) walk(x, k)
    }
  }
  walk(entry)
  return out
}
