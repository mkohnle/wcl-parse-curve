import type { Budget } from "../../shared/api.ts";
import { config, hasWclCredentials } from "../config.ts";
import { HttpError } from "../http.ts";

// WCL_BASE_URL only changes the API host; tokens are requested from the main site.
const TOKEN_URL = "https://www.warcraftlogs.com/oauth/token";

// ---------- circuit breaker ----------
// After a 429, send nothing until retry-after, or WCL blocks the IP for an hour.

let blockedUntil = 0;

const minutesUntil = (ms: number) => Math.max(1, Math.ceil((ms - Date.now()) / 60_000));

function rateLimited(): HttpError {
  return new HttpError(
    503,
    `Warcraft Logs rate limit reached. Try again in ${minutesUntil(blockedUntil)} min. The demo report works in the meantime.`,
  );
}

function tripBreaker(res: Response): HttpError {
  const seconds = Number(res.headers.get("retry-after")) || 120;
  blockedUntil = Math.max(blockedUntil, Date.now() + seconds * 1000);
  return rateLimited();
}

// ---------- auth ----------

let token: { value: string; expires: number } | null = null;
let pendingToken: Promise<string> | null = null;

async function fetchToken(): Promise<string> {
  const auth = Buffer.from(`${config.wclClientId}:${config.wclClientSecret}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (res.status === 429) throw tripBreaker(res);
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!res.ok || !data.access_token) {
    throw new Error(`Warcraft Logs auth failed (${res.status}). Check the credentials in .env`);
  }
  token = { value: data.access_token, expires: Date.now() + ((data.expires_in ?? 3600) - 60) * 1000 };
  return token.value;
}

function getToken(): Promise<string> {
  if (token && Date.now() < token.expires) return Promise.resolve(token.value);
  pendingToken ??= fetchToken().finally(() => {
    pendingToken = null;
  });
  return pendingToken;
}

// ---------- requests ----------

// parallel requests count against the IP too
const MAX_CONCURRENT = 4;
let running = 0;
const waiting: (() => void)[] = [];

async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiting.push(resolve));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

/** WCL GraphQL query. `cost`: points it uses, for the local budget estimate. */
export function gql<T>(query: string, variables: Record<string, unknown> = {}, cost = 1): Promise<T> {
  return limited(() => request<T>(query, variables, cost));
}

async function request<T>(query: string, variables: Record<string, unknown>, cost: number): Promise<T> {
  if (Date.now() < blockedUntil) throw rateLimited();
  const res = await fetch(`${config.wclBaseUrl}/api/v2/client`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await getToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (res.status === 401) token = null;
  if (res.status === 429) throw tripBreaker(res);
  spendEstimate(cost);

  const text = await res.text();
  let json: { data?: T; errors?: { message: string }[] };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Warcraft Logs API returned ${res.status}: ${text.slice(0, 200)}`);
  }
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join("; "));
  if (!res.ok || !json.data) throw new Error(`Warcraft Logs API returned ${res.status}`);
  return json.data;
}

// ---------- hourly point budget ----------
// Refuse work below a reserve. The check costs 1 point, so it runs every 10 min
// and query costs are subtracted locally in between.

/** Points kept free. */
const RESERVE = 40;
/** How long a budget check is trusted. */
const BUDGET_TTL = 10 * 60_000;

let budget: { value: Budget; fetchedAt: number } | null = null;
let pendingBudget: Promise<void> | null = null;

function spendEstimate(points: number) {
  if (budget) budget.value.remaining -= points;
}

async function refreshBudget(): Promise<void> {
  const data = await gql<{
    rateLimitData: { limitPerHour: number; pointsSpentThisHour: number; pointsResetIn: number };
  }>(`query Budget { rateLimitData { limitPerHour pointsSpentThisHour pointsResetIn } }`);
  const r = data.rateLimitData;
  budget = {
    value: {
      limit: r.limitPerHour,
      remaining: r.limitPerHour - r.pointsSpentThisHour,
      resetIn: r.pointsResetIn,
    },
    fetchedAt: Date.now(),
  };
}

/** Points left this hour. Throws if WCL isn't reachable. */
export async function getBudget(): Promise<Budget> {
  if (Date.now() < blockedUntil) {
    return { limit: budget?.value.limit ?? 0, remaining: 0, resetIn: (blockedUntil - Date.now()) / 1000 };
  }
  const age = budget ? Date.now() - budget.fetchedAt : Number.POSITIVE_INFINITY;
  // stale, or the hour has reset
  if (!budget || age > BUDGET_TTL || age > budget.value.resetIn * 1000) {
    pendingBudget ??= refreshBudget().finally(() => {
      pendingBudget = null;
    });
    await pendingBudget;
  }
  const b = budget as { value: Budget; fetchedAt: number };
  return { ...b.value, resetIn: Math.max(0, b.value.resetIn - (Date.now() - b.fetchedAt) / 1000) };
}

/** Throw if `points` would eat into the reserve. */
export async function ensureBudget(points: number): Promise<void> {
  const b = await getBudget();
  if (b.remaining - points < RESERVE) {
    throw new HttpError(
      503,
      `The Warcraft Logs API budget for this hour is nearly used up (${Math.floor(b.remaining)} of ${b.limit} points left). ` +
        `It resets in ${Math.max(1, Math.ceil(b.resetIn / 60))} min. The demo report works in the meantime.`,
    );
  }
}
