import { load, save } from "./store.ts";

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

const MAX_ENTRIES = 1000;
/** Entries kept at least this long also go to Redis (if set up); shorter ones aren't worth the round trip. */
const PERSIST_FROM = 10 * MINUTE;

const entries = new Map<string, { value: Promise<unknown>; expires: number }>();

/** The cached value if there and not expired. Memory only. */
export function peek<T>(key: string): Promise<T> | undefined {
  const hit = entries.get(key);
  return hit && Date.now() < hit.expires ? (hit.value as Promise<T>) : undefined;
}

/** Store a value that was fetched as part of something else. Memory only. */
export function prime<T>(key: string, ttl: number, value: T) {
  entries.set(key, { value: Promise.resolve(value), expires: Date.now() + ttl });
}

/** How a value is kept in Redis: with its own expiry, so memory and Redis agree. */
interface Stored<T> {
  value: T;
  /** epoch ms */
  until: number;
}

/**
 * Cache `compute` for `ttl` ms, or for `ttl(value)` once it resolved: in memory, and for long-lived
 * entries in Redis too, which is checked before computing. Concurrent callers share the promise;
 * failures aren't cached.
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

  let storedUntil = 0;
  const value = (async () => {
    const stored = await load<Stored<T>>(key);
    if (stored && stored.until > Date.now()) {
      storedUntil = stored.until;
      return stored.value;
    }
    return compute();
  })();
  // until resolved, keep it so concurrent callers share the request
  const entry = { value: value as Promise<unknown>, expires: Number.POSITIVE_INFINITY };
  entries.set(key, entry);
  value.then(
    (v) => {
      if (storedUntil) {
        entry.expires = storedUntil;
        return;
      }
      const ms = typeof ttl === "number" ? ttl : ttl(v);
      entry.expires = Date.now() + ms;
      if (ms >= PERSIST_FROM) save(key, { value: v, until: entry.expires } satisfies Stored<T>, ms);
    },
    () => {
      if (entries.get(key) === entry) entries.delete(key);
    },
  );
  return value;
}
