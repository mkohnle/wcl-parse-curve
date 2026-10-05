import { config } from "../config.ts";

// WCL_BASE_URL only changes the API host; tokens are requested from the main site.
const TOKEN_URL = "https://www.warcraftlogs.com/oauth/token";

function rateLimited(retryAfter: string | null) {
  const minutes = Math.ceil(Number(retryAfter) / 60);
  return new Error(
    `Warcraft Logs rate limit reached. Try again ${minutes > 0 ? `in ${minutes} min` : "later"}.`,
  );
}

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
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (res.status === 429) throw rateLimited(res.headers.get("retry-after"));
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

// Bursts of parallel requests get the whole IP blocked for an hour, so cap concurrency.
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

/** Run a query against the WCL v2 GraphQL API. Variables set to `undefined` are omitted. */
export function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  return limited(() => request<T>(query, variables));
}

async function request<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${config.wclBaseUrl}/api/v2/client`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await getToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (res.status === 401) token = null;
  if (res.status === 429) throw rateLimited(res.headers.get("retry-after"));

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
