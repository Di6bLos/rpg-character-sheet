/**
 * A value as JSON with every object's keys sorted, so values a jsonb column stores alike (the
 * same keys in any order, undefined properties left out) give the same string.
 */
export function jsonKey(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  )
}
