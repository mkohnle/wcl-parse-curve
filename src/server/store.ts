// Optional second cache level in Redis (Upstash's REST API): long-lived entries survive restarts and
// deploys. Without the two env vars, or when Redis is slow or down, everything works from memory alone.

const url = process.env.UPSTASH_REDIS_REST_URL ?? "";
const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? "";
export const hasStore = Boolean(url && token);

/** Bump when cached data changes shape, so old entries are ignored. */
const PREFIX = "logscope:1:";
/** Never wait longer than this on Redis; a miss is fine. */
const TIMEOUT = 1500;

async function command(args: (string | number)[]): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`Redis ${res.status}`);
  return ((await res.json()) as { result: unknown }).result;
}

/** The stored value, or undefined if there is none (or Redis isn't reachable). */
export async function load<T>(key: string): Promise<T | undefined> {
  if (!hasStore) return undefined;
  try {
    const raw = await command(["GET", PREFIX + key]);
    return typeof raw === "string" ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

/** Store a value for `ttl` ms; fire and forget. */
export function save(key: string, value: unknown, ttl: number) {
  if (!hasStore) return;
  command(["SET", PREFIX + key, JSON.stringify(value), "PX", Math.round(ttl)]).catch(() => {});
}
