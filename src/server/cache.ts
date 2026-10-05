export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;

const MAX_ENTRIES = 1000;
const entries = new Map<string, { value: Promise<unknown>; expires: number }>();

/** Cache `compute` for `ttlMs`. Concurrent callers share the promise; failures aren't cached. */
export function cached<T>(key: string, ttlMs: number, compute: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = entries.get(key);
  if (hit && now < hit.expires) return hit.value as Promise<T>;

  if (entries.size >= MAX_ENTRIES) {
    for (const [k, e] of entries) if (now >= e.expires) entries.delete(k);
  }

  const value = compute();
  entries.set(key, { value, expires: now + ttlMs });
  value.catch(() => {
    if (entries.get(key)?.value === value) entries.delete(key);
  });
  return value;
}
