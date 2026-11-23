import { describe, expect, it } from 'vitest'
import {
  normalizeLabel,
  pickLabel,
  seatFor,
  surfaceFor,
  untracked,
  viewportFor,
} from '../utils/analytics'

describe('surfaceFor', () => {
  it('maps the three play pages', () => {
    expect(surfaceFor('/character/abc')).toBe('sheet')
    expect(surfaceFor('/campaigns/c1/board/battle')).toBe('battle')
    expect(surfaceFor('/campaigns/c1/gm/battle')).toBe('battle')
    expect(surfaceFor('/campaigns/c1/board/party')).toBe('party')
    expect(surfaceFor('/campaigns/c1/gm/party')).toBe('party')
  })

  it('maps the other campaign tabs and falls back to other', () => {
    expect(surfaceFor('/campaigns/c1/board/journal/e1')).toBe('journal')
    expect(surfaceFor('/campaigns/c1/gm/maps')).toBe('maps')
    expect(surfaceFor('/campaigns/c1/gm/npcs/n1')).toBe('npcs')
    expect(surfaceFor('/campaigns/c1/board')).toBe('other')
    expect(surfaceFor('/dashboard')).toBe('other')
    expect(surfaceFor('/characters/new/nimble')).toBe('other')
  })
})

describe('seatFor', () => {
  it('tells the GM console from the player board', () => {
    expect(seatFor('/campaigns/c1/gm/battle')).toBe('gm')
    expect(seatFor('/campaigns/c1/gm')).toBe('gm')
    expect(seatFor('/campaigns/c1/board/party')).toBe('player')
    expect(seatFor('/character/abc')).toBeNull()
    expect(seatFor('/campaigns')).toBeNull()
  })
})

describe('untracked', () => {
  it('skips staff and sign-in pages', () => {
    expect(untracked('/admin/analytics')).toBe(true)
    expect(untracked('/')).toBe(true)
    expect(untracked('/join/tok')).toBe(true)
    expect(untracked('/dashboard')).toBe(false)
  })
})

describe('viewportFor', () => {
  it('buckets by width, with desktop starting where the battle board does', () => {
    expect(viewportFor(390)).toBe('phone')
    expect(viewportFor(700)).toBe('tablet')
    expect(viewportFor(1199)).toBe('tablet')
    expect(viewportFor(1200)).toBe('desktop')
  })
})

describe('normalizeLabel', () => {
  it('collapses whitespace and hides numbers', () => {
    expect(normalizeLabel('  Roll\n 2d6+3 ')).toBe('Roll #d#+#')
    expect(normalizeLabel('Round 4')).toBe('Round #')
    expect(normalizeLabel(null)).toBe('')
  })

  it('cuts long labels', () => {
    const label = normalizeLabel('x'.repeat(100), 10)
    expect(label).toHaveLength(10)
    expect(label.endsWith('…')).toBe(true)
  })
})

describe('pickLabel', () => {
  it('prefers data-track, then aria-label, then text, then title', () => {
    expect(pickLabel({ track: 'End turn', aria: 'x', text: 'y' })).toBe('End turn')
    expect(pickLabel({ aria: 'Close', text: '×' })).toBe('Close')
    expect(pickLabel({ aria: ' ', text: 'Cast', title: 't' })).toBe('Cast')
    expect(pickLabel({ text: '', title: 'Fold' })).toBe('Fold')
    expect(pickLabel({})).toBe('')
  })
})
