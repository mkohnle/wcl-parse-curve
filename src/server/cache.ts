export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

const MAX_ENTRIES = 1000;
const entries = new Map<string, { value: Promise<unknown>; expires: number }>();

/** Store a value that was fetched as part of something else. */
export function prime<T>(key: string, ttl: number, value: T) {
  entries.set(key, { value: Promise.resolve(value), expires: Date.now() + ttl });
}

/**
 * Cache `compute` for `ttl` ms, or for `ttl(value)` once it resolved.
 * Concurrent callers share the promise; failures aren't cached.
 */
export function cached<T>(
  key: string,
  ttl: number | ((value: T) => number),
  compute: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const hit = entries.get(key);
  if (hit && now < hit.expires) return hit.value as Promise<T>;

  if (entries.size >= MAX_ENTRIES) {
    for (const [k, e] of entries) if (now >= e.expires) entries.delete(k);
  }

  const value = compute();
  // until resolved, keep it so concurrent callers share the request
  const entry = { value: value as Promise<unknown>, expires: Number.POSITIVE_INFINITY };
  entries.set(key, entry);
  value.then(
    (v) => {
      entry.expires = Date.now() + (typeof ttl === "number" ? ttl : ttl(v));
    },
    () => {
      if (entries.get(key) === entry) entries.delete(key);
    },
  );
  return value;
}
