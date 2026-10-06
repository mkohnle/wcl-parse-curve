import type {
  ApiError,
  Budget,
  DistributionQuery,
  DistributionResponse,
  FightResponse,
  ReportResponse,
} from "../shared/api.ts";

async function getJson<T>(
  path: string,
  params: Record<string, string | number>,
  headers: Record<string, string> = {},
): Promise<T> {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const res = await fetch(`${path}?${qs}`, { headers });
  const body = (await res.json().catch(() => null)) as T | ApiError | null;
  if (!res.ok || body === null || (typeof body === "object" && "error" in body)) {
    throw new Error((body as ApiError | null)?.error ?? `Request failed (${res.status})`);
  }
  return body as T;
}

/** Memoize promises; failures are dropped so they can be retried. */
function memo<A extends unknown[], T>(fn: (...args: A) => Promise<T>): (...args: A) => Promise<T> {
  const cache = new Map<string, Promise<T>>();
  return (...args) => {
    const key = JSON.stringify(args);
    let p = cache.get(key);
    if (!p) {
      p = fn(...args);
      p.catch(() => cache.delete(key));
      cache.set(key, p);
    }
    return p;
  };
}

const ADMIN_KEY = "adminToken";

/** Store a token from ?admin=… once and drop it from the URL. */
export function captureAdminToken() {
  const url = new URL(location.href);
  const token = url.searchParams.get("admin");
  if (!token) return;
  try {
    localStorage.setItem(ADMIN_KEY, token);
  } catch {}
  url.searchParams.delete("admin");
  history.replaceState(null, "", url);
}

const adminToken = () => {
  try {
    return localStorage.getItem(ADMIN_KEY) ?? "";
  } catch {
    return "";
  }
};

/** Admin only (404 otherwise). Not memoized: the budget changes with every lookup. */
export const getBudget = () => getJson<Budget | null>("/api/budget", {}, { "x-admin-token": adminToken() });

export const getReport = memo((code: string) => getJson<ReportResponse>("/api/report", { code }));

export const getFight = memo((code: string, fight: number) =>
  getJson<FightResponse>("/api/fight", { code, fight }),
);

export const getDistribution = memo((q: DistributionQuery) =>
  getJson<DistributionResponse>("/api/distribution", { ...q }),
);
