import { describe, expect, it } from 'vitest'
import { classifyLayout, keyboardOpen, longPress } from '~/utils/boardLayout'

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

describe('keyboardOpen', () => {
  it('150px is not open', () => expect(keyboardOpen(800, 650)).toBe(false))
  it('151px is open', () => expect(keyboardOpen(800, 649)).toBe(true))
})

describe('longPress', () => {
  const down = { type: 'down', x: 10, y: 10, t: 0 } as const
  it('held 500ms fires', () => expect(longPress([down, { type: 'up', t: 500 }])).toBe(true))
  it('released at 499ms does not', () => expect(longPress([down, { type: 'up', t: 499 }])).toBe(false))
  it('moving 8px still fires', () =>
    expect(longPress([down, { type: 'move', x: 18, y: 10, t: 100 }, { type: 'up', t: 600 }])).toBe(
      true,
    ))
  it('a sideways scroll (9px) cancels', () =>
    expect(longPress([down, { type: 'move', x: 19, y: 10, t: 100 }, { type: 'up', t: 600 }])).toBe(
      false,
    ))
  it('cancel cancels', () => expect(longPress([down, { type: 'cancel', t: 600 }])).toBe(false))
})
