// nuxt.config.ts's auto-import guard: a name two files export can't be auto-imported, so a
// Nimble file can't quietly get PF2e's `takeDamage` (or the reverse).
import { describe, expect, it } from 'vitest'
import { dropAmbiguousImports } from '../scripts/lib/autoImports'

describe('dropAmbiguousImports', () => {
  it('leaves out names two files export and keeps the rest', () => {
    const imports = [
      { name: 'takeDamage', from: '/app/utils/nimblePlay.ts' },
      { name: 'takeDamage', from: '/app/utils/pf2ePlay.ts' },
      { name: 'rollDice', from: '/app/utils/dice.ts' },
      { name: 'default', as: 'heal', from: '/app/utils/nimbleHeal.ts' },
      { name: 'heal', from: '/app/utils/pf2ePlay.ts' },
      { name: 'useSheet', from: '/app/composables/useSheetEditor.ts' },
    ]
    expect(dropAmbiguousImports(imports)).toEqual(['heal', 'takeDamage'])
    expect(imports.map((i) => i.as ?? i.name)).toEqual(['rollDice', 'useSheet'])
  })

  it('keeps a name listed twice from the same file', () => {
    const imports = [
      { name: 'rollDice', from: '/app/utils/dice.ts' },
      { name: 'rollDice', from: '/app/utils/dice.ts' },
    ]
    expect(dropAmbiguousImports(imports)).toEqual([])
    expect(imports).toHaveLength(2)
  })
})
