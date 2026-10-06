import { timingSafeEqual } from "node:crypto";
import { type ErrorRequestHandler, Router } from "express";
import type {
  DistributionQuery,
  DistributionResponse,
  FightResponse,
  LogRef,
  Metric,
  Player,
  Role,
} from "../shared/api.ts";
import { cached, DAY, HOUR, MINUTE } from "./cache.ts";
import { config } from "./config.ts";
import { demoFight, demoRankingPage, demoReport, isDemoCode, isDemoEncounter } from "./demo.ts";
import { heroTreesOf } from "./hero-trees.ts";
import { HttpError, int, str } from "./http.ts";
import { ensureBudget, getBudget } from "./wcl/client.ts";
import {
  FIGHT_COST,
  fetchFightRankings,
  fetchLatestZones,
  fetchRankingPage,
  fetchReport,
  type RankingEntry,
  type RawFightRanking,
} from "./wcl/queries.ts";

export const api = Router();

const PER_PAGE = 100;
/** WCL refuses pages above 20. */
const MAX_PAGE = 20;

const isName = (s: string) => /^[A-Za-z]+$/.test(s);
const isReportCode = (s: string) => /^[A-Za-z0-9]{10,24}$/.test(s);
const stripSpaces = (s: string) => s.replace(/\s+/g, "");

// health check, no WCL call
api.get("/health", (_req, res) => {
  res.json({ ok: true });
});

/** Admin only: in dev, or with the ADMIN_TOKEN header. Others get a plain 404. */
const isAdmin = (token: string | undefined) => {
  if (config.dev) return true;
  if (!config.adminToken || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(config.adminToken);
  return a.length === b.length && timingSafeEqual(a, b);
};

/** Points left, or null if WCL isn't reachable. */
api.get("/budget", async (req, res) => {
  if (!isAdmin(req.get("x-admin-token"))) throw new HttpError(404, "Not found");
  res.json(await getBudget().catch(() => null));
});

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
  res.json(await cached(key, 6 * HOUR, () => getDistribution(q)));
});

/** 4 of 20 pages, 1 point each. As accurate as 8 on synthetic data. */
const SAMPLE_PAGES = [1, 4, 11, MAX_PAGE];
/** Worst case incl. the search for the last page of a short leaderboard. */
const DISTRIBUTION_COST = SAMPLE_PAGES.length + 4;

async function getDistribution(q: DistributionQuery): Promise<DistributionResponse> {
  const demo = isDemoEncounter(q.enc);
  if (!demo) await ensureBudget(DISTRIBUTION_COST);
  const fetchPage = async (p: number) => (demo ? demoRankingPage(q, p) : fetchRankingPage(q, p));

  const pages = new Map<number, RankingEntry[]>();
  const load = async (p: number) => {
    const entries = await fetchPage(p);
    pages.set(p, entries);
    return entries.length;
  };

  if (!(await load(1))) throw new HttpError(404, "No rankings found for that selection");
  if (pages.get(1)?.length === PER_PAGE) {
    await Promise.all(SAMPLE_PAGES.slice(1).map(load));
    // leaderboard ends before page 20: find the last page
    const sampled = SAMPLE_PAGES.filter((p) => pages.get(p)?.length);
    let good = sampled[sampled.length - 1];
    let bad = SAMPLE_PAGES.find((p) => p > good && !pages.get(p)?.length);
    while (bad && bad - good > 1) {
      const mid = (good + bad) >> 1;
      if (await load(mid)) good = mid;
      else bad = mid;
    }
  }

  const points: [number, number][] = [];
  const logs: (LogRef | null)[] = [];
  const trees: (number | null)[] = [];
  for (const [p, entries] of [...pages].sort(([a], [b]) => a - b)) {
    entries.forEach((e, i) => {
      points.push([(p - 1) * PER_PAGE + i + 1, Math.round(e.amount)]);
      logs.push(e.log);
      trees.push(e.tree);
    });
  }
  const last = points[points.length - 1][0];
  return {
    points,
    logs,
    trees,
    heroTrees: heroTreesOf(q.cls, q.spec),
    complete: last % PER_PAGE !== 0 || last < MAX_PAGE * PER_PAGE,
  };
}

api.get("/report", async (req, res) => {
  const code = str(req.query.code);
  if (isDemoCode(code)) {
    res.json(demoReport);
    return;
  }
  if (!isReportCode(code)) throw new HttpError(400, "Invalid report code");
  // live logs still gain fights: cache those briefly
  const { report } = await cached(
    `report|${code}`,
    (r) => (Date.now() - r.endTime > 30 * MINUTE ? DAY : 5 * MINUTE),
    async () => {
      await ensureBudget(1);
      return fetchReport(code);
    },
  );
  res.json(report);
});

api.get("/fight", async (req, res) => {
  const code = str(req.query.code);
  const fightId = int(req.query.fight);
  if (isDemoCode(code)) {
    const fight = demoFight(fightId);
    if (!fight) throw new HttpError(404, "No such fight in the demo report");
    res.json(fight);
    return;
  }
  if (!isReportCode(code) || !fightId) throw new HttpError(400, "Invalid parameters");

  // not ranked yet (still processing): retry soon
  const rankings = await cached(
    `fight|${code}|${fightId}`,
    (r) => (r.dps?.data.length ? DAY : 5 * MINUTE),
    async () => {
      await ensureBudget(FIGHT_COST);
      return fetchFightRankings(code, fightId);
    },
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
  // most likely a failed WCL request
  console.error(err);
  res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
};
api.use(errorHandler);
