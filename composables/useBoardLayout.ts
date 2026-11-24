import type { ComputedRef } from 'vue'
import { classifyLayout, type BoardLayout } from '~/utils/boardLayout'

// One media query listener per query, shared by every caller (Shell, the pages and View all
// ask), added with the first caller and removed when the last one's scope is disposed.
const QUERIES = {
  tablet: '(min-width: 768px)',
  wide: '(min-width: 1024px)',
  desktop: '(min-width: 1200px)',
  touch: '(hover: none) and (pointer: coarse)',
} as const
type Key = keyof typeof QUERIES

const state = {
  tablet: ref(false),
  wide: ref(false),
  desktop: ref(true),
  touch: ref(false),
}
const media: Partial<Record<Key, MediaQueryList>> = {}
const handlers: Partial<Record<Key, (event: MediaQueryListEvent) => void>> = {}
let users = 0

function start() {
  const first = classifyLayout(window.innerWidth)
  state.tablet.value = first !== 'phone'
  state.wide.value = first === 'tablet-wide' || first === 'desktop'
  state.desktop.value = first === 'desktop'
  for (const key of Object.keys(QUERIES) as Key[]) {
    const list = window.matchMedia(QUERIES[key])
    const handler = (event: MediaQueryListEvent) => {
      state[key].value = event.matches
    }
    state[key].value = key === 'touch' || key === 'desktop' ? list.matches : state[key].value
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
 * The battle board's size class and input type. `battle` is true for a Nimble campaign.
 * Without a window (or matchMedia) it reports desktop and no touch.
 */
export function useBoardLayout(): {
  layout: ComputedRef<BoardLayout>
  touch: ComputedRef<boolean>
  battle: ComputedRef<boolean>
} {
  const { campaign } = useCampaignBoard()
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    if (users++ === 0) start()
    onScopeDispose(() => {
      if (--users === 0) stop()
    })
  }
  return {
    layout: computed(() =>
      state.desktop.value
        ? 'desktop'
        : state.wide.value
          ? 'tablet-wide'
          : state.tablet.value
            ? 'tablet'
            : 'phone',
    ),
    touch: computed(() => state.touch.value),
    battle: computed(() => campaign.value?.system === 'nimble'),
  }
}
