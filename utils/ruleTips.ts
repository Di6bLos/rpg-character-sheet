/**
 * Short rules text for hover tooltips (weapon properties and traits, runes, spells), shared by
 * the Nimble and PF2e sheets: markdown stripped to plain text and cut to a readable length.
 */
export function tipText(markdown: string, max = 420): string {
  const plain = markdown
    .replace(/\\n/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|__|[*_`#]/g, '')
    .replace(/^-{3,}$/gm, '')
    .replace(/\n{2,}/g, '\n')
    .trim()
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain
}

/** A property or trait name without its number or die ("Reach 2", "deadly d8" → "reach", "deadly"). */
export const ruleKey = (label: string) =>
  label
    .trim()
    .toLowerCase()
    .replace(/[:\s]+(?:d?\d+.*)$/, '')
    .replace(/\s+\d+$/, '')
