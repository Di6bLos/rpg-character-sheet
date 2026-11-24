import type { ComputedRef } from 'vue'
import { SHORT_TOUCH_QUERY, classifyLayout, type BoardLayout } from '~/utils/boardLayout'

// One media query listener per query, shared by every caller (the battle frames and their
// parts ask), added with the first caller and removed when the last one's scope is disposed.
const QUERIES = {
  tablet: '(min-width: 768px)',
  desktop: '(min-width: 1280px)',
  touch: '(hover: none) and (pointer: coarse)',
  short: SHORT_TOUCH_QUERY,
} as const
type Key = keyof typeof QUERIES

const state = {
  tablet: ref(false),
  desktop: ref(true),
  touch: ref(false),
  short: ref(false),
}
const media: Partial<Record<Key, MediaQueryList>> = {}
const handlers: Partial<Record<Key, (event: MediaQueryListEvent) => void>> = {}
let users = 0

function start() {
  const first = classifyLayout(window.innerWidth, window.matchMedia(SHORT_TOUCH_QUERY).matches)
  state.tablet.value = first !== 'phone'
  state.desktop.value = first === 'desktop'
  for (const key of Object.keys(QUERIES) as Key[]) {
    const list = window.matchMedia(QUERIES[key])
    const handler = (event: MediaQueryListEvent) => {
      state[key].value = event.matches
    }
    state[key].value =
      key === 'touch' || key === 'desktop' || key === 'short' ? list.matches : state[key].value
    list.addEventListener('change', handler)
    media[key] = list
    handlers[key] = handler
  }
}

function stop() {
  for (const key of Object.keys(media) as Key[]) {
    const handler = handlers[key]
    if (handler) media[key]?.removeEventListener('change', handler)
    delete media[key]
    delete handlers[key]
  }
}

/**
 * The battle board's size class and input type. Without a window (or matchMedia) it reports
 * desktop and no touch.
 */
export function useBoardLayout(): {
  layout: ComputedRef<BoardLayout>
  touch: ComputedRef<boolean>
} {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    if (users++ === 0) start()
    onScopeDispose(() => {
      if (--users === 0) stop()
    })
  }
  return {
    layout: computed(() =>
      state.short.value
        ? 'phone'
        : state.desktop.value
          ? 'desktop'
          : state.tablet.value
            ? 'tablet'
            : 'phone',
    ),
    touch: computed(() => state.touch.value),
  }
}

/**
 * True while the phone battle frame is mounted (it sets this itself). The app layout hides
 * its nav and points the skip link at the frame only then, so a route that shows something
 * else at phone width (a note, another system) keeps the nav.
 */
export function usePhoneFrameMounted() {
  return useState<boolean>('battle-phone-frame', () => false)
}
