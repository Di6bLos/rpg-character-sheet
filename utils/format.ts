export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function extOf(filename: string): string {
  const ext = filename.includes('.') ? (filename.split('.').pop() ?? '') : ''
  return ext
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 5)
}

/** Storage-safe file name that keeps the original readable. */
export function safeFileName(filename: string): string {
  const ext = extOf(filename)
  const base = filename
    .replace(/\.[^.]+$/, '')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${base || 'file'}${ext ? `.${ext}` : ''}`
}

const DAY = 24 * 60 * 60 * 1000

/** "12 min ago", "1 hr ago", "Yesterday", "Nov 6". */
export function timeAgo(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime()
  const diff = Math.max(0, now - then)
  if (diff < 60 * 1000) return 'Just now'
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} min ago`
  if (diff < DAY) return `${Math.floor(diff / 3600000)} hr ago`
  if (diff < 2 * DAY) return 'Yesterday'
  return shortDate(iso)
}

/** "Nov 6" (adds the year when it isn't the current one). */
export function shortDate(iso: string): string {
  const date = new Date(iso)
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

/** "Thu, Nov 12 · 7:00 PM" */
export function sessionDate(iso: string): string {
  const date = new Date(iso)
  const day = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `${day} · ${time}`
}

/** "Nov 8 · 9:14 PM" */
export function stamp(iso: string): string {
  const date = new Date(iso)
  return `${shortDate(iso)} · ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
}

/** Value for <input type="datetime-local"> in the viewer's time zone. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}
