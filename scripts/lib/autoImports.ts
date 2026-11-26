// Nuxt auto-imports every export of utils/ and composables/. When two files export the same
// name (Nimble's and PF2e's `takeDamage`), Nuxt keeps one of them for every file and only
// warns, so a file that forgot its import would quietly get the other system's rules. Those
// names are taken out of the auto-imports instead (nuxt.config.ts): each use has to import
// them from their file.

/** The part of an auto-import entry this needs (unimport's `Import`). */
export interface AutoImport {
  name: string
  as?: string
  from: string
}

/** Removes every name exported from more than one file, in place; returns those names. */
export function dropAmbiguousImports(imports: AutoImport[]): string[] {
  const key = (i: AutoImport) => i.as ?? i.name
  const sources = new Map<string, Set<string>>()
  for (const i of imports) sources.set(key(i), (sources.get(key(i)) ?? new Set()).add(i.from))
  const ambiguous = new Set([...sources].filter(([, from]) => from.size > 1).map(([n]) => n))
  for (let k = imports.length - 1; k >= 0; k--) {
    const i = imports[k]
    if (i && ambiguous.has(key(i))) imports.splice(k, 1)
  }
  return [...ambiguous].sort()
}
