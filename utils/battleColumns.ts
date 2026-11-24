/**
 * Widths of the battle board's side columns on the desktop board (`Board`), which serves
 * both desktop (1200px+) and tablet-wide (1024–1199px). Tablet-wide has its own defaults
 * and its own dragged widths, kept apart from the desktop's so a narrow window never
 * overwrites them; with touch it has no splitters and the defaults are fixed.
 */

/** The centre column never shrinks below this (px), on desktop and on tablet-wide. */
export const CENTRE_MIN = { desktop: 460, wide: 400 }

/**
 * Tablet-wide bounds and default widths (px); the close points match the desktop's. The left
 * column stops at 240, as on desktop (narrower squeezes the hero's HP controls); the right
 * one at 270, the narrowest where the Chat / Scribe tabs and the Battle log switch still fit
 * side by side. Only the centre's minimum drops (400 against 460).
 */
export const WIDE_COLUMNS = {
  left: { min: 240, max: 520, close: 140, width: 270 },
  right: { min: 270, max: 600, close: 160, width: 290 },
}

export interface ColumnWidthInput {
  /** The layout is tablet-wide. */
  wide: boolean
  touch: boolean
  /** The width dragged on desktop; null: never dragged. */
  desktop: number | null
  /** The width dragged on tablet-wide with a mouse; null: never dragged. */
  tabletWide: number | null
  desktopDefault: number
  wideDefault: number
}

/**
 * A side column's open width. Tablet-wide with touch: the fixed default. Tablet-wide with a
 * mouse: its own dragged width, else its default. Desktop: the dragged width, else its default.
 */
export function columnWidth(o: ColumnWidthInput): number {
  if (!o.wide) return o.desktop ?? o.desktopDefault
  if (o.touch) return o.wideDefault
  return o.tabletWide ?? o.wideDefault
}

/** Rounds `px` into `[min, max]`. */
export function clampWidth(px: number, bounds: { min: number; max: number }): number {
  return Math.round(Math.min(bounds.max, Math.max(bounds.min, px)))
}
