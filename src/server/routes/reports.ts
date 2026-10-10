import { Router } from "express";
import type { FightResponse } from "../../shared/api.ts";
import { cached, DAY, HOUR, MINUTE, peek, prime } from "../cache.ts";
import { demoFight, demoReport, isDemoCode } from "../demo.ts";
import { HttpError, int, str } from "../http.ts";
import { fetchBreakdown } from "../wcl/breakdown.ts";
import { ensureBudget } from "../wcl/client.ts";
import { fetchFight, fetchFightTalents, fetchReport, fightCost } from "../wcl/reports.ts";

export const reports = Router();

const isReportCode = (s: string) => /^[A-Za-z0-9]{10,24}$/.test(s);

/** Short enough to show new uploads right away; only bundles identical requests. */
const FRESH = 15_000;
/** Warcraft Logs keeps updating the rankings of a new log for a while. */
const RECENT = 12 * HOUR;

const isRecent = (endTime: number) => Date.now() - endTime < RECENT;

/** Recent logs can still gain fights (live logging, M+ keys hours apart). */
const getReport = (code: string) =>
  cached(
    `report|${code}`,
    (r) => (isRecent(r.endTime) ? FRESH : DAY),
    async () => {
      await ensureBudget(1);
      return fetchReport(code);
    },
  );

reports.get("/report", async (req, res) => {
  const code = str(req.query.code);
  if (isDemoCode(code)) {
    res.json(demoReport);
    return;
  }
  if (!isReportCode(code)) throw new HttpError(400, "Invalid report code");
  res.json((await getReport(code)).report);
});

reports.get("/fight", async (req, res) => {
  const code = str(req.query.code);
  const fightId = int(req.query.fight);
  if (isDemoCode(code)) {
    const fight = demoFight(fightId);
    if (!fight) throw new HttpError(404, "No such fight in the demo report");
    res.json(fight);
    return;
  }
  if (!isReportCode(code) || !fightId) throw new HttpError(400, "Invalid parameters");

  // the client loads the report first, so this is usually cached
  const { report, endTime } = await getReport(code);
  const mythicPlus = (report.fights.find((f) => f.id === fightId)?.keystoneLevel ?? 0) > 0;
  // not ranked yet: retry soon. Recent: rankings may still change.
  const fresh = await cached(
    `fight|${code}|${fightId}`,
    (f) => (!f ? FRESH : isRecent(endTime) ? 10 * MINUTE : DAY),
    async () => {
      await ensureBudget(fightCost(mythicPlus));
      return fetchFight(code, fightId, mythicPlus);
    },
  );
  // while WCL processes a new upload, fights it had ranked can briefly come back unranked: keep the last ranking
  const rankedKey = `fight-ranked|${code}|${fightId}`;
  if (fresh) prime(rankedKey, DAY, fresh);
  const fight = fresh ?? (await peek<FightResponse>(rankedKey));
  if (!fight)
    throw new HttpError(
      404,
      "No rankings for this fight yet. Warcraft Logs ranks fights a few minutes after upload; reload then.",
    );
  res.json(fight);
});

/** Every player's talents in a raid fight (M+ fights already have them), 1 point per fight. */
reports.get("/fight-talents", async (req, res) => {
  const code = str(req.query.code);
  const fightId = int(req.query.fight);
  if (!isReportCode(code) || !fightId) throw new HttpError(400, "Invalid parameters");
  const { endTime } = await getReport(code);
  res.json(
    await cached(`talents|${code}|${fightId}`, isRecent(endTime) ? 10 * MINUTE : DAY, async () => {
      await ensureBudget(1);
      return fetchFightTalents(code, fightId);
    }),
  );
});

/** One player's casts and damage (or healing) per ability, for the log comparison. About 3 points. */
reports.get("/breakdown", async (req, res) => {
  const code = str(req.query.code);
  const fightId = int(req.query.fight);
  const name = str(req.query.name);
  const metric = req.query.metric === "hps" ? "hps" : "dps";
  if (!isReportCode(code) || !fightId || !name || name.length > 24)
    throw new HttpError(400, "Invalid parameters");
  // a fight's data doesn't change once it's over
  res.json(
    await cached(`breakdown|${code}|${fightId}|${name}|${metric}`, DAY, async () => {
      await ensureBudget(4);
      return fetchBreakdown(code, fightId, name, metric);
    }),
  );
});
