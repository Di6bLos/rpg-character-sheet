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

export type PhoneRole = 'player' | 'gm' | 'watcher'
export type PhoneTab = 'actions' | 'hero' | 'party' | 'chat' | 'scribe' | 'encounter' | 'creature'

/** The GM controls the board; a member with a seated hero plays; anyone else watches. */
export function phoneRole(o: { gmControls: boolean; hero: boolean }): PhoneRole {
  if (o.gmControls) return 'gm'
  return o.hero ? 'player' : 'watcher'
}

/** The phone's bottom tabs for a role. The GM's Scribe lives inside Chat, so never a tab. */
export function phoneTabs(role: PhoneRole, scribe: boolean): PhoneTab[] {
  if (role === 'gm') return ['encounter', 'creature', 'party', 'chat']
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
