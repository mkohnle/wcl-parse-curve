// Hero tree view: the spec curve weighted by the tree's share along the leaderboard.
// The share is measured on sampled pages and assumed constant below them.

import type { Curve } from "./curve.ts";

const PER_PAGE = 100;
/** Pages with fewer known trees are too noisy to use. */
const MIN_KNOWN = 20;

/** Share of `tree` at a given spec rank, or null if the tree never shows up. */
export function treeShare(
  points: readonly (readonly [number, number])[],
  trees: readonly (number | null)[],
  tree: number,
): ((rank: number) => number) | null {
  const pages = new Map<number, { ranks: number; known: number; hits: number }>();
  points.forEach(([rank], i) => {
    const t = trees[i];
    if (t === null) return;
    const p = Math.ceil(rank / PER_PAGE);
    const page = pages.get(p) ?? { ranks: 0, known: 0, hits: 0 };
    page.ranks += rank;
    page.known++;
    if (t === tree) page.hits++;
    pages.set(p, page);
  });
  const samples = [...pages.values()]
    .filter((p) => p.known >= MIN_KNOWN)
    .map((p) => ({ rank: p.ranks / p.known, share: p.hits / p.known }))
    .sort((a, b) => a.rank - b.rank);
  if (!samples.length || samples.every((s) => s.share === 0)) return null;

  // below the data: pooled share of the last two sampled pages
  const tail = samples.slice(-2);
  const tailShare = tail.reduce((a, s) => a + s.share, 0) / tail.length;

  return (rank) => {
    if (rank <= samples[0].rank) return samples[0].share;
    const i = samples.findIndex((s) => s.rank >= rank);
    if (i < 0) return tailShare;
    const a = samples[i - 1];
    const b = samples[i];
    return a.share + ((b.share - a.share) * (rank - a.rank)) / (b.rank - a.rank);
  };
}

/** Overall share of `tree` among sampled entries with a known tree. */
export function sampledShare(trees: readonly (number | null)[], tree: number): number {
  const known = trees.filter((t) => t !== null);
  return known.length ? known.filter((t) => t === tree).length / known.length : 0;
}

/** Curve of one hero tree: same amounts as the spec, ranked only among that tree. */
export function treeCurve(spec: Curve, share: (rank: number) => number): Curve {
  const n = spec.total;
  // grid over spec ranks: dense in the real data, log-spaced below
  const ranks: number[] = [];
  const step = Math.max(1, spec.exactRanks / 400);
  for (let r = 1; r < spec.exactRanks; r += step) ranks.push(r);
  for (let i = 0; i <= 300; i++) ranks.push(spec.exactRanks * (n / spec.exactRanks) ** (i / 300));

  // treeRanks[i]: how many of the tree's players rank at or above spec rank ranks[i]
  const treeRanks = [share(ranks[0])];
  for (let i = 1; i < ranks.length; i++) {
    treeRanks.push(
      treeRanks[i - 1] + ((share(ranks[i - 1]) + share(ranks[i])) / 2) * (ranks[i] - ranks[i - 1]),
    );
  }
  const total = treeRanks[treeRanks.length - 1];

  const interpolate = (xs: number[], ys: number[], x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
    let lo = 0;
    let hi = xs.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] <= x) lo = mid;
      else hi = mid;
    }
    return xs[hi] === xs[lo] ? ys[lo] : ys[lo] + ((ys[hi] - ys[lo]) * (x - xs[lo])) / (xs[hi] - xs[lo]);
  };
  const treeRankAt = (specRank: number) => interpolate(ranks, treeRanks, specRank);
  const specRankAt = (treeRank: number) => interpolate(treeRanks, ranks, treeRank);

  // rank 1 = the tree's best player
  const amountAtRank = (rank: number) => spec.amountAtRank(specRankAt(Math.max(1, rank)));
  return {
    total: Math.round(total),
    exactRanks: Math.round(treeRankAt(spec.exactRanks)),
    amountAtRank,
    percentileOf: (amount) => {
      const specRank = n * (1 - spec.percentileOf(amount) / 100);
      return Math.min(100, Math.max(0, 100 * (1 - treeRankAt(specRank) / total)));
    },
    amountAt: (p) => amountAtRank(total * (1 - p / 100)),
  };
}
