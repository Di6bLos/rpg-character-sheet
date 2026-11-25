export interface AuthLink {
  /** What went wrong with the link, or '' when it carried no error. */
  error: string
  /** The address without its hash, or null when there is no hash to remove. */
  cleanUrl: string | null
}

/** Reads the error Supabase puts in an email link's hash (expired or already used). */
export function readAuthLink(url: Pick<Location, 'hash' | 'pathname' | 'search'>): AuthLink {
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
  const failed = hash.has('error') || hash.has('error_code')
  return {
    error: failed ? hash.get('error_description') || 'This reset link isn’t valid.' : '',
    cleanUrl: url.hash ? url.pathname + url.search : null,
  }
}

/** How long a reset link's session counts as a reset: the link's lifetime (`otp_expiry`). */
export const RECOVERY_MAX_MS = 60 * 60 * 1000

/** Whether a saved `{ userId, at }` reset mark still belongs to this session's user. */
export function recoveryStillValid(
  raw: string | null,
  userId: string | null,
  now: number,
  maxAgeMs = RECOVERY_MAX_MS,
): boolean {
  if (!raw || !userId) return false
  try {
    const saved = JSON.parse(raw) as { userId?: unknown; at?: unknown }
    return (
      saved.userId === userId &&
      typeof saved.at === 'number' &&
      now >= saved.at &&
      now - saved.at < maxAgeMs
    )
  } catch {
    return false
  }
}
