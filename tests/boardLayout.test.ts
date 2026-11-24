import { describe, expect, it } from 'vitest'
import { classifyLayout } from '~/utils/boardLayout'

describe('classifyLayout', () => {
  it.each([
    [360, 'phone'],
    [767, 'phone'],
    [768, 'tablet'],
    [1023, 'tablet'],
    [1024, 'tablet-wide'],
    [1199, 'tablet-wide'],
    [1200, 'desktop'],
    [1920, 'desktop'],
  ])('%i → %s', (w, expected) => expect(classifyLayout(w)).toBe(expected))
})
