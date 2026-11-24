import { describe, expect, it } from 'vitest'
import { CENTRE_MIN, WIDE_COLUMNS, clampWidth, columnWidth } from '~/utils/battleColumns'

const base = { desktopDefault: 320, wideDefault: 270 }

describe('columnWidth', () => {
  it('desktop: the dragged width, else the default', () => {
    expect(columnWidth({ ...base, wide: false, touch: false, desktop: 400, tabletWide: 230 })).toBe(
      400,
    )
    expect(
      columnWidth({ ...base, wide: false, touch: false, desktop: null, tabletWide: 230 }),
    ).toBe(320)
  })

  it('desktop with touch keeps the saved width', () => {
    expect(columnWidth({ ...base, wide: false, touch: true, desktop: 400, tabletWide: null })).toBe(
      400,
    )
  })

  it("tablet-wide with a mouse: its own dragged width, never the desktop's", () => {
    expect(columnWidth({ ...base, wide: true, touch: false, desktop: 400, tabletWide: null })).toBe(
      270,
    )
    expect(columnWidth({ ...base, wide: true, touch: false, desktop: 400, tabletWide: 230 })).toBe(
      230,
    )
  })

  it('tablet-wide with touch: the fixed default', () => {
    expect(columnWidth({ ...base, wide: true, touch: true, desktop: 400, tabletWide: 230 })).toBe(
      270,
    )
  })
})

describe('clampWidth', () => {
  it('rounds into the bounds', () => {
    expect(clampWidth(100.4, WIDE_COLUMNS.left)).toBe(WIDE_COLUMNS.left.min)
    expect(clampWidth(900, WIDE_COLUMNS.right)).toBe(WIDE_COLUMNS.right.max)
    expect(clampWidth(250.6, WIDE_COLUMNS.left)).toBe(251)
  })
})

describe('tablet-wide bounds', () => {
  // 1024px window: 40px of padding and 28px of gaps leave 956px for the three columns.
  const inner = 1024 - 40 - 28

  it('keeps the centre at 400px or more with both columns at their minimums', () => {
    expect(inner - WIDE_COLUMNS.left.min - WIDE_COLUMNS.right.min).toBeGreaterThanOrEqual(
      CENTRE_MIN.wide,
    )
  })

  it('uses 270px and 290px as defaults, a 400px centre and keeps 460px for desktop', () => {
    expect(WIDE_COLUMNS.left.width).toBe(270)
    expect(WIDE_COLUMNS.right.width).toBe(290)
    expect(CENTRE_MIN).toEqual({ desktop: 460, wide: 400 })
  })
})
