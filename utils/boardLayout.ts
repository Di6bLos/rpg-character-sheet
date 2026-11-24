/**
 * Size class of the battle board: phone < 768, tablet 768-1279, desktop 1280+. A short touch
 * screen (`short`: at most 540px tall with a coarse pointer, i.e. a phone turned sideways) is
 * a phone at any width: the tablet frame leaves it no room under the bars.
 */
export type BoardLayout = 'phone' | 'tablet' | 'desktop'

/** The media query for `classifyLayout`'s `short`. */
export const SHORT_TOUCH_QUERY = '(max-height: 540px) and (pointer: coarse)'

export function classifyLayout(width: number, short = false): BoardLayout {
  if (short) return 'phone'
  if (width >= 1280) return 'desktop'
  if (width >= 768) return 'tablet'
  return 'phone'
}

/**
 * The on-screen keyboard is open when the visual viewport is more than 150px shorter. Measured
 * in layout px (`viewportHeight * scale`), so pinch-zooming in, which shrinks the visual
 * viewport too, never reads as the keyboard.
 */
export function keyboardOpen(innerHeight: number, viewportHeight: number, scale = 1): boolean {
  return innerHeight - viewportHeight * scale > 150
}

/** A long press (`useLongPress`): held this long (ms) without moving more than the slop (px). */
export const LONG_PRESS_MS = 500
export const LONG_PRESS_SLOP = 8

export type PhoneRole = 'player' | 'gm' | 'watcher'
export type PhoneTab = 'actions' | 'hero' | 'party' | 'chat' | 'scribe' | 'encounter' | 'creature'

/** The GM controls the board; a member with a seated hero plays; anyone else watches. */
export function phoneRole(o: { gmControls: boolean; hero: boolean }): PhoneRole {
  if (o.gmControls) return 'gm'
  return o.hero ? 'player' : 'watcher'
}

/** The phone's bottom tabs for a role; Scribe is the last tab whenever it's available. */
export function phoneTabs(role: PhoneRole, scribe: boolean): PhoneTab[] {
  if (role === 'gm') {
    return scribe
      ? ['encounter', 'creature', 'party', 'chat', 'scribe']
      : ['encounter', 'creature', 'party', 'chat']
  }
  if (role === 'player') {
    return scribe
      ? ['actions', 'hero', 'party', 'chat', 'scribe']
      : ['actions', 'hero', 'party', 'chat']
  }
  return scribe ? ['party', 'chat', 'scribe'] : ['party', 'chat']
}

const DEFAULT_TAB: Record<PhoneRole, PhoneTab> = {
  player: 'actions',
  gm: 'encounter',
  watcher: 'party',
}

/** The saved tab when this role still has it; otherwise the role's default. */
export function pickTab(role: PhoneRole, scribe: boolean, saved: string | null): PhoneTab {
  const tabs = phoneTabs(role, scribe)
  return tabs.find((t) => t === saved) ?? DEFAULT_TAB[role]
}
