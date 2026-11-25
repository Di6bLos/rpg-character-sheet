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
