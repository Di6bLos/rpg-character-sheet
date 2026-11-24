// Usage analytics: pure helpers that turn a route and a clicked element into an event.
// The plugin (`plugins/usage-analytics.client.ts`) and `composables/useAnalytics.ts` send them.

export type Surface = 'sheet' | 'party' | 'battle' | 'journal' | 'maps' | 'npcs' | 'other'
export type PageSeat = 'gm' | 'player'
export type Viewport = 'phone' | 'tablet' | 'desktop'
export type EventKind = 'view' | 'click' | 'time'

export interface AnalyticsEvent {
  kind: EventKind
  surface: Surface
  seat: PageSeat | null
  viewport: Viewport
  area?: string
  label?: string
  value?: number
  session?: string
}

/** The pages the playtest compares, in the order the dashboard shows them. */
export const PLAY_SURFACES = ['battle', 'party', 'sheet'] as const satisfies readonly Surface[]

export const SURFACE_LABELS: Record<Surface, string> = {
  battle: 'Battle',
  party: 'Party',
  sheet: 'Character sheet',
  journal: 'Journal',
  maps: 'Maps & images',
  npcs: 'NPCs',
  other: 'Other pages',
}

/** Routes that are never tracked (staff tools, sign in). */
export function untracked(path: string): boolean {
  return (
    path.startsWith('/admin') ||
    path === '/' ||
    path === '/signup' ||
    path.startsWith('/join/') ||
    // `board/index.vue` and `gm/index.vue` only redirect to Battle or Party.
    /^\/campaigns\/[^/]+\/(?:board|gm)\/?$/.test(path)
  )
}

/** Which page a path belongs to. */
export function surfaceFor(path: string): Surface {
  if (/^\/character\/[^/]+\/?$/.test(path)) return 'sheet'
  const board = /^\/campaigns\/[^/]+\/(?:board|gm)\/([^/?#]+)/.exec(path)
  switch (board?.[1]) {
    case 'battle':
      return 'battle'
    case 'party':
      return 'party'
    case 'journal':
      return 'journal'
    case 'maps':
      return 'maps'
    case 'npcs':
      return 'npcs'
    default:
      return 'other'
  }
}

/** GM console or player board; null outside a campaign. */
export function seatFor(path: string): PageSeat | null {
  const m = /^\/campaigns\/[^/]+\/(board|gm)(?:\/|$)/.exec(path)
  if (!m) return null
  return m[1] === 'gm' ? 'gm' : 'player'
}

/** Width buckets for analytics (1200px, apart from the battle board's 1280px desktop class). */
export function viewportFor(width: number): Viewport {
  if (width < 700) return 'phone'
  if (width < 1200) return 'tablet'
  return 'desktop'
}

/**
 * Collapses whitespace and swaps digit runs for "#" so "Roll 2d6+3" and "Roll 1d8+1"
 * count as one button; cut to `max` characters.
 */
export function normalizeLabel(text: string | null | undefined, max = 80): string {
  const clean = (text ?? '').replace(/\s+/g, ' ').replace(/\d+/g, '#').trim()
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

/** First non-empty label: `data-track`, then `aria-label`, then the visible text, then `title`. */
export function pickLabel(parts: {
  track?: string | null
  aria?: string | null
  text?: string | null
  title?: string | null
}): string {
  for (const p of [parts.track, parts.aria, parts.text, parts.title]) {
    const label = normalizeLabel(p)
    if (label) return label
  }
  return ''
}

/** Elements a click counts on. */
export const TRACK_SELECTOR = [
  'button',
  'a[href]',
  'summary',
  'select',
  'input[type="checkbox"]',
  'input[type="radio"]',
  '[role="button"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="option"]',
  '[data-track]',
].join(',')

/** The tracked control a click landed on, or null (outside one, or inside `data-track="off"`). */
export function trackTarget(start: EventTarget | null): Element | null {
  if (!start || !(start instanceof Element)) return null
  if (start.closest('[data-track="off"]')) return null
  const el = start.closest(TRACK_SELECTOR)
  if (!el || el.getAttribute('data-track') === 'off') return null
  return el
}

/** Visible text with block boundaries kept as spaces ("Lvl 5" + "Human Mage" → "Lvl 5 Human Mage"). */
function textOf(el: Element | null | undefined): string {
  if (!el) return ''
  return el instanceof HTMLElement ? el.innerText || (el.textContent ?? '') : (el.textContent ?? '')
}

function labelledBy(el: Element): string {
  const ids = el.getAttribute('aria-labelledby')
  if (!ids) return ''
  return ids
    .split(/\s+/)
    .map((id) => textOf(document.getElementById(id)))
    .join(' ')
}

const ID_SEGMENT = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+)$/i

/** A link's route with ids swapped out: "/campaigns/<uuid>/board/party" → "/campaigns/:id/board/party". */
export function hrefPattern(href: string): string {
  let path = href
  try {
    path = new URL(href, 'http://x').pathname
  } catch {
    // Keep the raw value.
  }
  const parts = path.split('/').map((p) => (ID_SEGMENT.test(p) ? ':id' : p))
  // A sheet link always names one character.
  if (parts[1] === 'character' && parts[2]) parts[2] = ':id'
  return parts.join('/') || '/'
}

/**
 * Replaces any of `names` (heroes, campaigns, players, combatants: things people typed)
 * in `text` with "‹name›", longest first so "Iriel the Bold" goes before "Iriel".
 */
export function scrubNames(text: string, names: Iterable<string>): string {
  const list = [...new Set([...names].map((n) => n.trim()).filter((n) => n.length >= 2))].sort(
    (a, b) => b.length - a.length,
  )
  if (!text || list.length === 0) return text
  const escaped = list.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return text.replace(
    new RegExp(`(?<![\\p{L}\\p{N}])(?:${escaped.join('|')})(?![\\p{L}\\p{N}])`, 'giu'),
    '‹name›',
  )
}

/**
 * The label of a tracked control. Reads text and attributes only, never what was typed
 * into a field. Links are named by their route, never their text (cards and lists show
 * hero, campaign and NPC names); any of `names` left in other labels becomes "‹name›".
 */
export function labelFor(el: Element, names: Iterable<string> = []): string {
  const track = el.getAttribute('data-track')
  const href = el.getAttribute('href')
  if (!track && href && el.tagName === 'A') return normalizeLabel(`Link ${hrefPattern(href)}`)
  const input = el instanceof HTMLInputElement || el instanceof HTMLSelectElement
  // A checkbox's text is its <label>, not its own (empty) content.
  const text = input ? textOf(el.closest('label')) : textOf(el)
  const scrub = (v: string | null) => (v ? scrubNames(v, names) : v)
  return pickLabel({
    track,
    aria: scrub(el.getAttribute('aria-label') || labelledBy(el)),
    text: scrub(text),
    title: scrub(el.getAttribute('title')),
  })
}

const AREA_SELECTOR = '[data-track-area], dialog, section, aside, nav, .panel, [role="region"]'

/** A region's name: its `aria-label`, the element it is labelled by, or its first heading. */
function regionName(region: Element, names: Iterable<string>): string {
  return normalizeLabel(
    scrubNames(
      region.getAttribute('aria-label') ||
        labelledBy(region) ||
        textOf(region.querySelector('h1, h2, h3')),
      names,
    ),
    60,
  )
}

/**
 * Where on the page a control sits: the nearest named region around it. A
 * `data-track-area` wins outright; sections, dialogs, navs and panels give their
 * aria-label or heading; "page" when nothing around it has a name.
 */
export function areaFor(el: Element, names: Iterable<string> = []): string {
  let region = el.closest(AREA_SELECTOR)
  while (region) {
    const explicit = region.getAttribute('data-track-area')
    if (explicit) return normalizeLabel(explicit, 60)
    const name = regionName(region, names)
    if (name) return name
    region = region.parentElement?.closest(AREA_SELECTOR) ?? null
  }
  return 'page'
}
