import type { DistributionQuery, DistributionResponse, LogRef } from "../shared/api.ts";
import { MAX_PAGE, PAGE_SIZE } from "../shared/leaderboard.ts";
import { demoRankingPage, isDemoEncounter } from "./demo.ts";
import { heroTreesOf } from "./hero-trees.ts";
import { HttpError } from "./http.ts";
import { ensureBudget } from "./wcl/client.ts";
import { fetchRankingPage, type RankingEntry } from "./wcl/leaderboards.ts";

/** 4 of 20 pages, 1 point each. As accurate as 8 on synthetic data. */
const SAMPLE_PAGES = [1, 4, 11, MAX_PAGE];
/** Worst case incl. the search for the last page of a short leaderboard. */
const DISTRIBUTION_COST = SAMPLE_PAGES.length + 4;

/** Sampled leaderboard of a spec: the data the curve is built from. */
export async function getDistribution(q: DistributionQuery): Promise<DistributionResponse> {
  const demo = isDemoEncounter(q.encounterId);
  if (!demo) await ensureBudget(DISTRIBUTION_COST);
  const fetchPage = async (p: number) => (demo ? demoRankingPage(q, p) : fetchRankingPage(q, p));

  const pages = new Map<number, RankingEntry[]>();
  const load = async (p: number) => {
    const entries = await fetchPage(p);
    pages.set(p, entries);
    return entries.length;
  };

  if (!(await load(1))) throw new HttpError(404, "No rankings found for that selection");
  if (pages.get(1)?.length === PAGE_SIZE) {
    await Promise.all(SAMPLE_PAGES.slice(1).map(load));
    // leaderboard ends before page 20: find the last page
    const sampled = SAMPLE_PAGES.filter((p) => pages.get(p)?.length);
    let good = sampled[sampled.length - 1];
    let bad = SAMPLE_PAGES.find((p) => p > good && !pages.get(p)?.length);
    while (bad && bad - good > 1) {
      const mid = (good + bad) >> 1;
      if (await load(mid)) good = mid;
      else bad = mid;
    }
  }

  const points: [number, number][] = [];
  const logs: (LogRef | null)[] = [];
  const trees: (number | null)[] = [];
  for (const [p, entries] of [...pages].sort(([a], [b]) => a - b)) {
    entries.forEach((e, i) => {
      points.push([(p - 1) * PAGE_SIZE + i + 1, Math.round(e.amount)]);
      logs.push(e.log);
      trees.push(e.tree);
    });
  }
  const last = points[points.length - 1][0];
  return {
    points,
    logs,
    trees,
    heroTrees: heroTreesOf(q.className, q.spec),
    complete: last % PAGE_SIZE !== 0 || last < MAX_PAGE * PAGE_SIZE,
  };
}
