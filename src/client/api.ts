import type {
  ApiError,
  Breakdown,
  Budget,
  CharacterLog,
  CharacterResponse,
  CharacterSection,
  CurveMetric,
  DistributionQuery,
  DistributionResponse,
  FightResponse,
  FightTalent,
  Metric,
  Realm,
  Region,
  ReportResponse,
  RioProfile,
  TalentTree,
  ZoneList,
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

/** Dev only. Not memoized: the budget changes with every lookup. */
export const getBudget = () => getJson<Budget | null>("/api/budget", {});

/** Not memoized: a recent log can gain fights at any time. */
export const getReport = (code: string) => getJson<ReportResponse>("/api/report", { code });

export const getFight = memo((code: string, fight: number) =>
  getJson<FightResponse>("/api/fight", { code, fight }),
);

export const getBreakdown = memo((code: string, fight: number, name: string, metric: Metric) =>
  getJson<Breakdown>("/api/breakdown", { code, fight, name, metric }),
);

export const getFightTalents = memo((code: string, fight: number) =>
  getJson<Record<string, FightTalent[]>>("/api/fight-talents", { code, fight }),
);

export const getDistribution = memo((q: DistributionQuery) =>
  getJson<DistributionResponse>("/api/distribution", { ...q, lite: q.lite ? 1 : 0 }),
);

export const getRealms = memo((region: Region) => getJson<Realm[]>("/api/realms", { region }));

export const getCharacter = memo(
  (
    name: string,
    realm: string,
    region: Region,
    section: CharacterSection,
    zone: number | null,
    difficulty: number | null,
  ) =>
    getJson<CharacterResponse>("/api/character", {
      name,
      realm,
      region,
      section,
      ...(zone ? { zone } : {}),
      ...(difficulty ? { difficulty } : {}),
    }),
);

export const getZones = memo(() => getJson<ZoneList>("/api/zones", {}));

export const getRio = memo((name: string, realm: string, region: Region) =>
  getJson<RioProfile>("/api/rio", { name, realm, region }),
);

/** Each spec's full talent trees, built into fingerprinted files (cached for good, fresh after changes). */
const talentTrees = import.meta.glob<TalentTree>("./data/talent-trees/*.json", { import: "default" });

/** A spec's full talent trees, e.g. ("Warrior", "Arms"); null if unknown. */
export const getTalentTree = (className: string, spec: string): Promise<TalentTree | null> =>
  talentTrees[`./data/talent-trees/${className}-${spec}.json`]?.() ?? Promise.resolve(null);

export const getCharacterLogs = memo(
  (
    name: string,
    realm: string,
    region: Region,
    encounterId: number,
    metric: CurveMetric,
    difficulty: number,
    keyLevel: boolean,
    /** a run that must be included; refetched if the cached list predates it */
    run?: { code: string; fight: number },
  ) =>
    getJson<CharacterLog[]>("/api/character/logs", {
      name,
      realm,
      region,
      encounterId,
      metric,
      difficulty,
      keyLevel: keyLevel ? 1 : 0,
      ...run,
    }),
);
