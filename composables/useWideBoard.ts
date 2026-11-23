import type { ComputedRef } from 'vue'

// One media query listener shared by every caller (Shell and PartyView both ask),
// added with the first caller and removed when the last one's scope is disposed.
const QUERY = '(min-width: 1200px)'
const wide = ref(false)
let media: MediaQueryList | null = null
let users = 0

function onChange(event: MediaQueryListEvent) {
  wide.value = event.matches
}

/** True when the desktop battle board shows: a Nimble campaign on a screen at least 1200px wide. */
export function useWideBoard(): ComputedRef<boolean> {
  const { campaign } = useCampaignBoard()
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    if (users++ === 0) {
      media = window.matchMedia(QUERY)
      wide.value = media.matches
      media.addEventListener('change', onChange)
    }
    onScopeDispose(() => {
      if (--users > 0 || !media) return
      media.removeEventListener('change', onChange)
      media = null
    })
  }
  return computed(() => wide.value && campaign.value?.system === 'nimble')
}
