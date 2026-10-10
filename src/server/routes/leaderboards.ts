import { Router } from "express";
import { CURVE_METRICS, type CurveMetric, type DistributionQuery } from "../../shared/api.ts";
import { cached, DAY } from "../cache.ts";
import { getDistribution } from "../distribution.ts";
import { HttpError, int, str } from "../http.ts";
import { isFrozenEncounter } from "../wcl/zones.ts";

export const leaderboards = Router();

const isName = (s: string) => /^[A-Za-z]+$/.test(s);

leaderboards.get("/distribution", async (req, res) => {
  const q: DistributionQuery = {
    encounterId: int(req.query.encounterId),
    difficulty: int(req.query.difficulty),
    partition: int(req.query.partition),
    bracket: int(req.query.bracket),
    metric: CURVE_METRICS.includes(req.query.metric as CurveMetric)
      ? (req.query.metric as CurveMetric)
      : "dps",
    lite: req.query.lite === "1" || req.query.lite === "true",
    className: str(req.query.className),
    spec: str(req.query.spec),
  };
  if (!q.encounterId) throw new HttpError(400, "Invalid encounter");
  if (!isName(q.className)) throw new HttpError(400, `Invalid class "${q.className}"`);
  if (!isName(q.spec)) throw new HttpError(400, `Invalid spec "${q.spec}"`);

  const key = [
    "dist",
    q.encounterId,
    q.difficulty,
    q.partition,
    q.bracket,
    q.metric,
    q.lite,
    q.className,
    q.spec,
  ].join("|");
  // the top 2000 barely move within a day; finished raids and seasons not at all
  const ttl = (await isFrozenEncounter(q.encounterId)) ? 7 * DAY : DAY;
  res.json(await cached(key, ttl, () => getDistribution(q)));
});
