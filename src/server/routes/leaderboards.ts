import { Router } from "express";
import type { DistributionQuery } from "../../shared/api.ts";
import { cached, HOUR } from "../cache.ts";
import { getDistribution } from "../distribution.ts";
import { HttpError, int, str } from "../http.ts";

export const leaderboards = Router();

const isName = (s: string) => /^[A-Za-z]+$/.test(s);

leaderboards.get("/distribution", async (req, res) => {
  const q: DistributionQuery = {
    encounterId: int(req.query.encounterId),
    difficulty: int(req.query.difficulty),
    partition: int(req.query.partition),
    bracket: int(req.query.bracket),
    metric: req.query.metric === "hps" ? "hps" : "dps",
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
    q.className,
    q.spec,
  ].join("|");
  res.json(await cached(key, 6 * HOUR, () => getDistribution(q)));
});
