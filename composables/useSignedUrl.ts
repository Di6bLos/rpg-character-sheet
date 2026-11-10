import { supabase } from '~/lib/supabase'

const TTL_SECONDS = 60 * 60
const cache = new Map<string, { url: string; expires: number }>()

/** Signed URL for a file in a private bucket, cached for most of its lifetime. */
export async function signedUrl(bucket: string, path: string): Promise<string | null> {
  const key = `${bucket}/${path}`
  const hit = cache.get(key)
  if (hit && hit.expires > Date.now()) return hit.url
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, TTL_SECONDS)
  if (error || !data) return null
  cache.set(key, { url: data.signedUrl, expires: Date.now() + (TTL_SECONDS - 300) * 1000 })
  return data.signedUrl
}

/** Opens a private file in a new tab (or downloads it, depending on the browser). */
export async function openFile(bucket: string, path: string): Promise<boolean> {
  const url = await signedUrl(bucket, path)
  if (!url) return false
  window.open(url, '_blank', 'noopener')
  return true
}
