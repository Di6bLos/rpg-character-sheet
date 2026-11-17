// Shared Nimble test helpers: build a hero and level it with first-valid picks
// (utils/nimbleAutoBuild), failing the test on any pick the rules reject.
import { expect } from 'vitest'
import type { NimbleSheet } from '../../types/sheets'
import { levelTo as autoLevelTo } from '../../utils/nimbleAutoBuild'

export {
  autoPick,
  build,
  human,
  pickLevel,
  standard,
  survivalist,
} from '../../utils/nimbleAutoBuild'

export function levelTo(sheet: NimbleSheet, target: number, subclassSlug: string) {
  autoLevelTo(sheet, target, subclassSlug, (key, problem) => expect(problem, key).toBeNull())
}
