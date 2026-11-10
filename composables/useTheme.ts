import { accentVars, resolveAccent, themeMeta, type ThemeId } from '~/utils/themes'

const STORAGE_KEY = 'lantern-look'

interface Look {
  theme: ThemeId
  accent: string | null
}

function readCached(): Look | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Look>
    return { theme: themeMeta(parsed.theme).id, accent: parsed.accent ?? null }
  } catch {
    return null
  }
}

/** Applies a theme + accent to the document without persisting it. */
export function applyLook(theme: ThemeId, accent: string | null) {
  const root = document.documentElement
  root.dataset.theme = theme
  const vars = accentVars(theme, resolveAccent(theme, accent))
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value)
}

export function useTheme() {
  const auth = useAuthStore()

  const theme = computed<ThemeId>(() => themeMeta(auth.profile?.theme).id)
  const accent = computed(() => resolveAccent(theme.value, auth.profile?.accent))

  /** Re-applies the saved look (profile first, then the local cache). */
  function applySaved() {
    const look: Look = auth.profile
      ? { theme: themeMeta(auth.profile.theme).id, accent: auth.profile.accent }
      : (readCached() ?? { theme: 'classic', accent: null })
    applyLook(look.theme, look.accent)
    if (auth.profile) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(look))
      } catch {
        // Storage can be unavailable (private mode); the look still applies.
      }
    }
  }

  async function save(next: ThemeId, nextAccent: string | null) {
    await auth.updateProfile({ theme: next, accent: nextAccent })
    applySaved()
  }

  return { theme, accent, applySaved, save }
}
