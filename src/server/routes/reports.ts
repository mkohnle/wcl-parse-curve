import { Router } from "express";
import { cached, DAY, MINUTE } from "../cache.ts";
import { demoFight, demoReport, isDemoCode } from "../demo.ts";
import { HttpError, int, str } from "../http.ts";
import { ensureBudget } from "../wcl/client.ts";
import { FIGHT_COST, fetchFight, fetchReport } from "../wcl/reports.ts";

export const reports = Router();

const isReportCode = (s: string) => /^[A-Za-z0-9]{10,24}$/.test(s);

reports.get("/report", async (req, res) => {
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
    (f) => (f ? DAY : 5 * MINUTE),
    async () => {
      await ensureBudget(FIGHT_COST);
      return fetchFight(code, fightId);
    },
  );
  if (!fight) throw new HttpError(404, "No rankings for this fight (trash, not ranked, or still processing)");
  res.json(fight);
});
