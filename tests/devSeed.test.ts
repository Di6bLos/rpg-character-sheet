import { describe, expect, it } from 'vitest'
import { buildHero, HERO } from '~/scripts/dev-seed'
import { DEV_PARTY } from '~/utils/devAccounts'
import { creationInput, creationProblems } from '~/utils/nimbleBuild'

const heroes = [HERO, ...DEV_PARTY.map((m) => ({ ...m.hero, level: HERO.level }))]

describe('seeded heroes', () => {
  for (const hero of heroes)
    it(`reads ${hero.name}'s level 1 creation back with nothing left to fix`, () => {
      const input = creationInput(buildHero(hero), hero.level)
      expect(input).not.toBeNull()
      expect(creationProblems(input!)).toEqual([])
    })
})
