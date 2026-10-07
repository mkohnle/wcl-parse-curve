import { Router } from "express";
import { cached, DAY, HOUR, MINUTE } from "../cache.ts";
import { demoFight, demoReport, isDemoCode } from "../demo.ts";
import { HttpError, int, str } from "../http.ts";
import { ensureBudget } from "../wcl/client.ts";
import { fetchFight, fetchReport, fightCost } from "../wcl/reports.ts";

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
  const fight = await cached(
    `fight|${code}|${fightId}`,
    (f) => (!f ? FRESH : isRecent(endTime) ? 10 * MINUTE : DAY),
    async () => {
      await ensureBudget(fightCost(mythicPlus));
      return fetchFight(code, fightId, mythicPlus);
    },
  );
  if (!fight)
    throw new HttpError(
      404,
      "No rankings for this fight yet. Warcraft Logs ranks fights a few minutes after upload; reload then.",
    );
  res.json(fight);
});
