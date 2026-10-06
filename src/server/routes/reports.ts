import { Router } from "express";
import { cached, DAY, HOUR } from "../cache.ts";
import { demoFight, demoReport, isDemoCode } from "../demo.ts";
import { HttpError, int, str } from "../http.ts";
import { ensureBudget } from "../wcl/client.ts";
import { FIGHT_COST, fetchFight, fetchReport } from "../wcl/reports.ts";

export const reports = Router();

const isReportCode = (s: string) => /^[A-Za-z0-9]{10,24}$/.test(s);

/** Short enough to show new uploads right away; only bundles identical requests. */
const FRESH = 15_000;

reports.get("/report", async (req, res) => {
  const code = str(req.query.code);
  if (isDemoCode(code)) {
    res.json(demoReport);
    return;
  }
  if (!isReportCode(code)) throw new HttpError(400, "Invalid report code");
  // recent logs can still gain fights (live logging, M+ keys hours apart)
  const { report } = await cached(
    `report|${code}`,
    (r) => (Date.now() - r.endTime > 12 * HOUR ? DAY : FRESH),
    async () => {
      await ensureBudget(1);
      return fetchReport(code);
    },
  );
  res.json(report);
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

  // not ranked yet (still processing): retry soon
  const fight = await cached(
    `fight|${code}|${fightId}`,
    (f) => (f ? DAY : FRESH),
    async () => {
      await ensureBudget(FIGHT_COST);
      return fetchFight(code, fightId);
    },
  );
  if (!fight)
    throw new HttpError(
      404,
      "No rankings for this fight yet. Warcraft Logs ranks fights a few minutes after upload; reload then.",
    );
  res.json(fight);
});
