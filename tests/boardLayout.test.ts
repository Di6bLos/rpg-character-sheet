import { describe, expect, it } from 'vitest'
import { classifyLayout, keyboardOpen, phoneRole, phoneTabs, pickTab } from '~/utils/boardLayout'

describe('classifyLayout', () => {
  it.each([
    [360, 'phone'],
    [767, 'phone'],
    [768, 'tablet'],
    [1023, 'tablet'],
    [1024, 'tablet'],
    [1279, 'tablet'],
    [1280, 'desktop'],
    [1920, 'desktop'],
  ])('%i → %s', (w, expected) => expect(classifyLayout(w)).toBe(expected))

  it('a short touch screen (a phone turned sideways) is a phone at any width', () => {
    expect(classifyLayout(844, true)).toBe('phone')
    expect(classifyLayout(932, true)).toBe('phone')
    expect(classifyLayout(1366, true)).toBe('phone')
    expect(classifyLayout(844, false)).toBe('tablet')
  })
})

describe('keyboardOpen', () => {
  it('150px is not open', () => expect(keyboardOpen(800, 650)).toBe(false))
  it('151px is open', () => expect(keyboardOpen(800, 649)).toBe(true))
  it('pinch-zoomed to 2x is not open', () => expect(keyboardOpen(800, 400, 2)).toBe(false))
  it('the keyboard while zoomed is still open', () => expect(keyboardOpen(800, 250, 2)).toBe(true))
})

describe('phone tabs', () => {
  it('player with Scribe', () =>
    expect(phoneTabs('player', true)).toEqual(['actions', 'hero', 'party', 'chat', 'scribe']))
  it('player without Scribe', () =>
    expect(phoneTabs('player', false)).toEqual(['actions', 'hero', 'party', 'chat']))
  it('gm gets a Scribe tab when it is available', () => {
    expect(phoneTabs('gm', true)).toEqual(['encounter', 'creature', 'party', 'chat', 'scribe'])
    expect(phoneTabs('gm', false)).toEqual(['encounter', 'creature', 'party', 'chat'])
  })
  it('watcher', () => expect(phoneTabs('watcher', true)).toEqual(['party', 'chat', 'scribe']))
  it('watcher with a stale Actions tab falls back to Party', () =>
    expect(pickTab('watcher', true, 'actions')).toBe('party'))
  it('keeps a valid saved tab', () => expect(pickTab('player', true, 'chat')).toBe('chat'))
  it('scribe saved but unavailable → default', () =>
    expect(pickTab('player', false, 'scribe')).toBe('actions'))
  it('role', () => expect(phoneRole({ gmControls: false, hero: false })).toBe('watcher'))
})
