/** Size class of the battle board: phone < 768, tablet 768-1023, tablet-wide 1024-1199, desktop 1200+. */
export type BoardLayout = 'phone' | 'tablet' | 'tablet-wide' | 'desktop'

export function classifyLayout(width: number): BoardLayout {
  if (width >= 1200) return 'desktop'
  if (width >= 1024) return 'tablet-wide'
  if (width >= 768) return 'tablet'
  return 'phone'
}

/** The on-screen keyboard is open when the visual viewport is more than 150px shorter. */
export function keyboardOpen(innerHeight: number, viewportHeight: number): boolean {
  return innerHeight - viewportHeight > 150
}

export type PressEvent =
  | { type: 'down'; x: number; y: number; t: number }
  | { type: 'move'; x: number; y: number; t: number }
  | { type: 'up' | 'cancel'; t: number }

export const LONG_PRESS_MS = 500
export const LONG_PRESS_SLOP = 8

/** True when a `down` was held 500ms or more, never moving over 8px, before `up`. */
export function longPress(events: PressEvent[]): boolean {
  let start: { x: number; y: number; t: number } | null = null
  for (const e of events) {
    if (e.type === 'down') start = e
    else if (!start) continue
    else if (e.type === 'move') {
      if (Math.hypot(e.x - start.x, e.y - start.y) > LONG_PRESS_SLOP) return false
    } else if (e.type === 'cancel') return false
    else return e.t - start.t >= LONG_PRESS_MS
  }
  return false
}
