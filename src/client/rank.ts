import type { DistributionResponse, LogRef, Player } from "../shared/api.ts";
import type { Curve } from "./curve.ts";

/** e.g. "#105 of ~4,400"; approx: estimated, atLeast: only a lower bound is known ("2,000+"). */
export interface Rank {
  rank: number;
  total: number;
  rankApprox: boolean;
  totalKind: "exact" | "approx" | "atLeast";
}

/** Warcraft Logs' own rank for the overall parse, known with the fight. */
export const loggedRank = (p: Player): Rank | null =>
  p.rank && p.totalParses
    ? { rank: p.rank, total: p.totalParses, rankApprox: p.rankApprox, totalKind: "exact" }
    : null;

/** Rank implied by an unrounded parse and its population. */
export const rankFromParse = (parse: number, total: number): Rank => ({
  rank: Math.max(1, Math.round(total * (1 - parse / 100))),
  total,
  rankApprox: true,
  totalKind: "exact",
});

/** Where `amount` sits on the curve. */
export const estimatedRank = (curve: Curve, amount: number): Rank => ({
  rank: Math.max(1, Math.round(curve.total * (1 - curve.percentileOf(amount) / 100))),
  total: curve.total,
  rankApprox: true,
  totalKind: "approx",
});

/**
 * Exact if the log itself is on the leaderboard or lands inside a sampled page,
 * else WCL's rank, else the curve's estimate.
 */
export function rankOnLeaderboard(
  dist: DistributionResponse,
  curve: Curve,
  log: Pick<LogRef, "name" | "code" | "fight">,
  amount: number,
  logged: Rank | null,
): Rank {
  const { points } = dist;
  const own = dist.logs.findIndex(
    (l) => l?.code === log.code && l.fight === log.fight && l.name === log.name,
  );
  // leaderboard amounts are rounded
  const i = points.findIndex(([, a]) => a <= Math.round(amount));
  const exact =
    own >= 0
      ? points[own][0]
      : i === 0
        ? 1
        : i > 0 && points[i][0] - points[i - 1][0] <= 1
          ? points[i - 1][0] + 1
          : null;
  if (logged && !exact) return logged;
  const lowerBound = !dist.complete && !logged && curve.total <= curve.exactRanks + 1;
  const total = lowerBound ? curve.exactRanks : curve.total;
  const totalKind = lowerBound ? "atLeast" : dist.complete || logged ? "exact" : "approx";
  return exact
    ? { rank: exact, total, rankApprox: false, totalKind }
    : { ...estimatedRank(curve, amount), total, totalKind };
}
