export interface BeastDef {
  slug: string
  name: string
  summons: string[]
}

const SMALL = ['small-companion']
const MEDIUM = ['medium-companion']
const LARGE = ['large-companion']
const SPIRIT = ['lifebinding-spirit']

export const BEASTS: BeastDef[] = [
  { slug: 'cat', name: 'Cat', summons: [...SMALL, ...SPIRIT] },
  { slug: 'bat', name: 'Bat', summons: SMALL },
  { slug: 'hawk', name: 'Hawk', summons: SMALL },
  { slug: 'raccoon', name: 'Raccoon', summons: SMALL },
  { slug: 'rooster', name: 'Rooster', summons: SMALL },
  { slug: 'ferret', name: 'Ferret', summons: SMALL },
  { slug: 'wolf', name: 'Wolf', summons: MEDIUM },
  { slug: 'boar', name: 'Boar', summons: MEDIUM },
  { slug: 'panther', name: 'Panther', summons: MEDIUM },
  { slug: 'vulture', name: 'Vulture', summons: MEDIUM },
  { slug: 'spider', name: 'Giant Spider', summons: MEDIUM },
  { slug: 'lion', name: 'Lion', summons: LARGE },
  { slug: 'owlbear', name: 'Owlbear', summons: LARGE },
  { slug: 'elk', name: 'Elk', summons: LARGE },
  { slug: 'scorpion', name: 'Giant Scorpion', summons: LARGE },
  { slug: 'drake', name: 'Drake', summons: LARGE },
  { slug: 'dog', name: 'Dog', summons: SPIRIT },
  { slug: 'lamb', name: 'Lamb', summons: SPIRIT },
  { slug: 'rabbit', name: 'Rabbit', summons: SPIRIT },
  { slug: 'sparrow', name: 'Sparrow', summons: SPIRIT },
]

export function beastBySlug(slug: string | undefined): BeastDef | undefined {
  return slug ? BEASTS.find((b) => b.slug === slug) : undefined
}

export function beastsFor(summonId: string): BeastDef[] {
  return BEASTS.filter((b) => b.summons.includes(summonId))
}
