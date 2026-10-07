import { probit } from "../shared/math.ts";

// Parse curve: sampled top-2000 leaderboard, the player's parse as a fixed point,
// log-normal estimate below (log(amount) linear in the normal quantile of the rank).

export interface Curve {
  /** Population size the parse is measured against. */
  total: number;
  /** Ranks up to this one are real leaderboard data. */
  exactRanks: number;
  amountAtRank(rank: number): number;
  /** Parse (0-100) that `amount` would get. */
  percentileOf(amount: number): number;
  /** Amount needed for parse `p` (0-100). */
  amountAt(p: number): number;
}

interface Anchor {
  amount: number;
  parse: number;
  /** Whole-number parse as shown by Warcraft Logs, else unrounded. */
  floored: boolean;
}

type Points = readonly (readonly [rank: number, amount: number])[];

/** Plausible range for the slope of log(amount) per standard deviation. */
const SLOPE_MIN = 0.05;
const SLOPE_MAX = 0.5;
const DEFAULT_SLOPE = 0.15;

/** points: [rank, amount], best first. total: population if known (bracket parses don't report it). */
export function buildCurve(
  points: Points,
  { total, complete, anchor }: { total: number | null; complete: boolean; anchor: Anchor | null },
): Curve {
  const exact = points[points.length - 1][0];
  if (complete) return model(withAnchor(points, exact, anchor), exact, null);
  if (total) {
    const n = Math.max(total, exact + 1);
    return model(withAnchor(points, n, anchor), n, anchor);
  }
  if (anchor) return model(points, solveTotal(points, anchor), anchor);
  return model(points, exact, null);
}

/** A floored parse could be anywhere up to the next one: aim for the middle. */
const anchorTarget = (a: Anchor) => Math.min(99.99, a.floored ? a.parse + 0.5 : a.parse);

/** Add the anchor as a point if it falls between sampled pages. */
function withAnchor(points: Points, n: number, anchor: Anchor | null): Points {
  if (!anchor) return points;
  const rank = n * (1 - anchorTarget(anchor) / 100);
  const i = points.findIndex(([r]) => r > rank);
  if (i <= 0) return points;
  const [r1, a1] = points[i - 1];
  const [r2, a2] = points[i];
  // inside a sampled page the data is exact; keep it monotonic
  if (r2 - r1 <= 1 || anchor.amount > a1 || anchor.amount < a2) return points;
  return [...points.slice(0, i), [rank, anchor.amount], ...points.slice(i)];
}

/** Population size for which the curve passes through the anchor. */
function solveTotal(points: Points, anchor: Anchor): number {
  const exact = points[points.length - 1][0];
  const target = anchorTarget(anchor);
  // anchor inside the top 2000: its rank is known, so the total follows
  if (anchor.amount >= points[points.length - 1][1]) {
    const rank = rankInPoints(points, anchor.amount);
    return Math.max(exact + 1, rank / (1 - target / 100));
  }
  // else bisect: a larger total gives the same amount a higher parse
  let lo = Math.log(exact + 1);
  let hi = Math.log(1e8);
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (model(points, Math.exp(mid), null).percentileOf(anchor.amount) < target) lo = mid;
    else hi = mid;
  }
  return Math.round(Math.exp((lo + hi) / 2));
}

/** Interpolated rank of `amount` within the sampled points. */
function rankInPoints(points: Points, amount: number): number {
  if (amount >= points[0][1]) return 1;
  for (let i = 1; i < points.length; i++) {
    const [r2, a2] = points[i];
    if (amount >= a2) {
      const [r1, a1] = points[i - 1];
      return a1 === a2 ? r2 : r1 + ((a1 - amount) / (a1 - a2)) * (r2 - r1);
    }
  }
  return points[points.length - 1][0];
}

function model(points: Points, n: number, anchor: Anchor | null): Curve {
  const [exact, lastAmount] = points[points.length - 1];
  const z = (rank: number) => probit(1 - (rank - 0.5) / n);
  const pctAtRank = (rank: number) => 100 * (1 - rank / n);

  // keep below the last exact rank (monotonic)
  let anchorPoint: { rank: number; z: number; y: number } | null = null;
  if (anchor && n > exact && anchor.amount < lastAmount) {
    const p = Math.max(anchor.parse, Math.min(anchorTarget(anchor), pctAtRank(exact + 1)));
    const rank = n * (1 - p / 100);
    if (rank > exact + 1) anchorPoint = { rank, z: z(rank), y: Math.log(anchor.amount) };
  }

  const lastExact = { z: z(exact), y: Math.log(lastAmount) };
  const tail = anchorPoint ?? lastExact;
  let slope =
    anchorPoint && lastExact.z - anchorPoint.z > 0.15
      ? (lastExact.y - anchorPoint.y) / (lastExact.z - anchorPoint.z)
      : tailSlope(points, z) || DEFAULT_SLOPE;
  slope = Math.min(SLOPE_MAX, Math.max(SLOPE_MIN, slope));

  // last point with rank <= r
  const indexAt = (r: number) => {
    let lo = 0;
    let hi = points.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (points[mid][0] <= r) lo = mid;
      else hi = mid;
    }
    return lo;
  };

  const amountAtRank = (rank: number): number => {
    const r = Math.min(n, Math.max(1, rank));
    if (r <= exact) {
      // between sampled pages: log(amount) linear in z
      const i = indexAt(r);
      const [r1, a1] = points[i];
      const [r2, a2] = points[Math.min(points.length - 1, i + 1)];
      if (r2 === r1 || a1 === a2) return a1;
      const t = (z(r1) - z(r)) / (z(r1) - z(r2));
      return Math.exp(Math.log(a1) + (Math.log(a2) - Math.log(a1)) * t);
    }
    const zr = z(r);
    if (anchorPoint && r <= anchorPoint.rank) {
      const t = (lastExact.z - zr) / (lastExact.z - anchorPoint.z);
      return Math.exp(lastExact.y + (anchorPoint.y - lastExact.y) * t);
    }
    return Math.exp(tail.y + slope * (zr - tail.z));
  };

  const percentileOf = (amount: number): number => {
    if (amount >= points[0][1]) return 100;
    if (amount <= amountAtRank(n)) return 0;
    // bisect for the rank of `amount`
    let lo = 1;
    let hi = n;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (amountAtRank(mid) > amount) lo = mid;
      else hi = mid;
    }
    return Math.min(100, Math.max(0, pctAtRank((lo + hi) / 2)));
  };

  return {
    total: Math.round(n),
    exactRanks: exact,
    amountAtRank,
    percentileOf,
    amountAt: (p) => amountAtRank(n * (1 - p / 100)),
  };
}

/** Slope of log(amount) over z, fitted on the leaderboard (skips the noisy top 10). */
function tailSlope(points: Points, z: (rank: number) => number): number {
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  let k = 0;
  for (const [rank, amount] of points) {
    if (rank <= 10 && points.length > 20) continue;
    const x = z(rank);
    const y = Math.log(amount);
    sx += x;
    sy += y;
    sxx += x * x;
    sxy += x * y;
    k++;
  }
  const denom = k * sxx - sx * sx;
  return denom > 0 ? (k * sxy - sx * sy) / denom : 0;
}

/** Normal probability density. */
export const normalPdf = (x: number, mean: number, sd: number) =>
  Math.exp(-0.5 * ((x - mean) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI));

/** Mean and sd of the curve, for the normal-fit line. */
export function meanAndStdDev(curve: Curve, samples = 1000): { mean: number; sd: number } {
  const values = Array.from({ length: samples }, (_, i) => curve.amountAt(((i + 0.5) / samples) * 100));
  const mean = values.reduce((a, b) => a + b, 0) / samples;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / samples);
  return { mean, sd };
}
