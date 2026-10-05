// Models the full parse distribution of a spec.
//
// Warcraft Logs defines a parse as 100 * (1 - rank / population) on the leaderboard.
// The API only serves the top 2,000 leaderboard entries, so:
//   - ranks up to 2,000 come from (sampled) leaderboard pages,
//   - the player's own log parse pins one more point (the curve passes through it),
//   - everything else is a log-normal estimate: log(amount) is treated as linear in
//     the normal quantile of the rank.

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

export interface Anchor {
  amount: number;
  /** Whole-number parse as shown by Warcraft Logs. */
  parse: number;
}

type Points = readonly (readonly [rank: number, amount: number])[];

/** Plausible range for the slope of log(amount) per standard deviation. */
const SLOPE_MIN = 0.05;
const SLOPE_MAX = 0.5;
const DEFAULT_SLOPE = 0.15;

/**
 * @param points  leaderboard [rank, amount] samples, best first
 * @param total   population size if known (overall parses report it, bracket parses don't)
 * @param complete whether `points` reach the end of the leaderboard
 * @param anchor  the player's own amount and log parse
 */
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

/** Target parse for an anchor: the log floors, so the true value lies in [parse, parse + 1). */
const anchorTarget = (a: Anchor) => Math.min(99.99, a.parse + 0.5);

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
  // Within the leaderboard data the anchor's rank is known: population follows directly.
  if (anchor.amount >= points[points.length - 1][1]) {
    const rank = rankInPoints(points, anchor.amount);
    return Math.max(exact + 1, rank / (1 - target / 100));
  }
  // Otherwise bisect: a larger population puts a fixed amount at a higher parse.
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

  // Stay below the last exact rank to keep the curve monotonic.
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

  // index of the last point with rank <= r (points are sorted by rank)
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
      // Between sampled pages, interpolate log(amount) in z-space: follows the bend of the tail.
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
    // amountAtRank is decreasing: bisect for the rank that matches `amount`
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

/** Least-squares slope of log(amount) over z for the leaderboard data (skipping the noisy very top). */
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

/** Inverse standard normal CDF (Acklam's approximation, rel. error < 1.2e-9). */
export function probit(p: number): number {
  const a = [
    -39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716,
    2.506628277459239,
  ];
  const b = [
    -54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572,
  ];
  const c = [
    -0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968,
    2.938163982698783,
  ];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const q = Math.min(1 - 1e-12, Math.max(1e-12, p));
  const low = 0.02425;
  if (q < low) {
    const t = Math.sqrt(-2 * Math.log(q));
    return (
      (((((c[0] * t + c[1]) * t + c[2]) * t + c[3]) * t + c[4]) * t + c[5]) /
      ((((d[0] * t + d[1]) * t + d[2]) * t + d[3]) * t + 1)
    );
  }
  if (q > 1 - low) {
    const t = Math.sqrt(-2 * Math.log(1 - q));
    return (
      -(((((c[0] * t + c[1]) * t + c[2]) * t + c[3]) * t + c[4]) * t + c[5]) /
      ((((d[0] * t + d[1]) * t + d[2]) * t + d[3]) * t + 1)
    );
  }
  const t = q - 0.5;
  const r = t * t;
  return (
    ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * t) /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  );
}

/** Normal probability density. */
export const normalPdf = (x: number, mean: number, sd: number) =>
  Math.exp(-0.5 * ((x - mean) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI));

/** Mean and standard deviation of the modeled population (for the normal-fit overlay). */
export function meanAndStdDev(curve: Curve, samples = 1000): { mean: number; sd: number } {
  const values = Array.from({ length: samples }, (_, i) => curve.amountAt(((i + 0.5) / samples) * 100));
  const mean = values.reduce((a, b) => a + b, 0) / samples;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / samples);
  return { mean, sd };
}
