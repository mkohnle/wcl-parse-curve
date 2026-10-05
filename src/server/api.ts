import { type ErrorRequestHandler, Router } from "express";
import type {
  DistributionQuery,
  DistributionResponse,
  FightResponse,
  Metric,
  Player,
  Role,
} from "../shared/api.ts";
import { cached, HOUR, MINUTE } from "./cache.ts";
import { HttpError, int, str } from "./http.ts";
import {
  fetchFightRankings,
  fetchLatestZones,
  fetchRankingAmounts,
  fetchReport,
  type RawFightRanking,
} from "./wcl/queries.ts";

export const api = Router();

const PER_PAGE = 100;
/** The WCL API refuses pages above this ("The maximum page value supported by the API is 20"). */
const MAX_PAGE = 20;

const isName = (s: string) => /^[A-Za-z]+$/.test(s);
const isReportCode = (s: string) => /^[A-Za-z0-9]{10,24}$/.test(s);
const stripSpaces = (s: string) => s.replace(/\s+/g, "");

api.get("/zones", async (_req, res) => {
  res.json(await cached("zones", 6 * HOUR, fetchLatestZones));
});

api.get("/distribution", async (req, res) => {
  const q: DistributionQuery = {
    enc: int(req.query.enc),
    diff: int(req.query.diff),
    part: int(req.query.part),
    bracket: int(req.query.bracket),
    metric: req.query.metric === "hps" ? "hps" : "dps",
    cls: str(req.query.cls),
    spec: str(req.query.spec),
  };
  if (!q.enc) throw new HttpError(400, "Invalid encounter");
  if (!isName(q.cls)) throw new HttpError(400, `Invalid class "${q.cls}"`);
  if (!isName(q.spec)) throw new HttpError(400, `Invalid spec "${q.spec}"`);

  const key = ["dist", q.enc, q.diff, q.part, q.bracket, q.metric, q.cls, q.spec].join("|");
  res.json(await cached(key, HOUR, () => getDistribution(q)));
});

/**
 * Pages to sample from the leaderboard. Each page costs ~1 point of the client's
 * hourly API budget (720 by default), so we interpolate between these instead
 * of fetching all 20.
 */
const SAMPLE_PAGES = [1, 2, 3, 5, 8, 12, 16, MAX_PAGE];

async function getDistribution(q: DistributionQuery): Promise<DistributionResponse> {
  const pages = new Map<number, number[]>();
  const load = async (p: number) => {
    pages.set(p, await fetchRankingAmounts(q, p));
    return (pages.get(p) as number[]).length;
  };

  if (!(await load(1))) throw new HttpError(404, "No rankings found for that selection");
  if (pages.get(1)?.length === PER_PAGE) {
    await Promise.all(SAMPLE_PAGES.slice(1).map(load));
    // If the leaderboard ends before page 20, binary search the exact last page.
    const sampled = SAMPLE_PAGES.filter((p) => pages.get(p)?.length);
    let good = sampled[sampled.length - 1];
    let bad = SAMPLE_PAGES.find((p) => p > good && !pages.get(p)?.length);
    while (bad && bad - good > 1) {
      const mid = (good + bad) >> 1;
      if (await load(mid)) good = mid;
      else bad = mid;
    }
  }

  const points: [number, number][] = [...pages]
    .sort(([a], [b]) => a - b)
    .flatMap(([p, amounts]) =>
      amounts.map((a, i): [number, number] => [(p - 1) * PER_PAGE + i + 1, Math.round(a)]),
    );
  const last = points[points.length - 1][0];
  return { points, complete: last % PER_PAGE !== 0 || last < MAX_PAGE * PER_PAGE };
}

api.get("/report", async (req, res) => {
  const code = str(req.query.code);
  if (!isReportCode(code)) throw new HttpError(400, "Invalid report code");
  res.json(await cached(`report|${code}`, 10 * MINUTE, () => fetchReport(code)));
});

api.get("/fight", async (req, res) => {
  const code = str(req.query.code);
  const fightId = int(req.query.fight);
  if (!isReportCode(code) || !fightId) throw new HttpError(400, "Invalid parameters");

  const rankings = await cached(`fight|${code}|${fightId}`, 10 * MINUTE, () =>
    fetchFightRankings(code, fightId),
  );
  if (req.query.debug) {
    res.json(rankings);
    return;
  }

  const dps = rankings.dps?.data[0];
  const hps = rankings.hps?.data[0];
  if (!dps) throw new HttpError(404, "No rankings for this fight (trash, not ranked, or still processing)");

  const body: FightResponse = {
    enc: dps.encounter.id,
    diff: dps.difficulty,
    part: dps.partition,
    players: [
      ...toPlayers(dps, "tanks", "dps"),
      ...toPlayers(hps, "healers", "hps"),
      ...toPlayers(dps, "dps", "dps"),
    ],
  };
  res.json(body);
});

const ROLE: Record<"tanks" | "healers" | "dps", Role> = { tanks: "tank", healers: "healer", dps: "dps" };

function toPlayers(ranking: RawFightRanking | undefined, group: keyof typeof ROLE, metric: Metric): Player[] {
  return (ranking?.roles?.[group]?.characters ?? []).map((c) => ({
    name: c.name,
    cls: stripSpaces(c.class),
    spec: stripSpaces(c.spec),
    role: ROLE[group],
    metric,
    amount: c.amount,
    parse: c.rankPercent,
    bracketParse: c.bracketPercent ?? null,
    totalParses: c.totalParses ?? null,
    bracket: c.bracket ?? null,
  }));
}

api.use((_req, _res) => {
  throw new HttpError(404, "Not found");
});

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  // Anything else is most likely a failed Warcraft Logs request.
  console.error(err);
  res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
};
api.use(errorHandler);
