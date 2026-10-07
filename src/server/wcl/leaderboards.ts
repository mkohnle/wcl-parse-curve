import type { DistributionQuery, LogRef } from "../../shared/api.ts";
import { heroTreeOf } from "../hero-trees.ts";
import { HttpError } from "../http.ts";
import { gql } from "./client.ts";

export interface RankingEntry {
  amount: number;
  /** null for anonymous or hidden logs */
  log: LogRef | null;
  /** hero tree id, null if unknown */
  tree: number | null;
}

interface RawRanking {
  amount: number;
  name: string;
  /** epoch ms */
  startTime: number;
  server?: { name: string; region: string };
  report?: { code: string; fightID: number };
  talents?: { talentID: number }[];
}

/** One leaderboard page (100 entries), best first. Empty past the end. */
export async function fetchRankingPage(q: DistributionQuery, page: number): Promise<RankingEntry[]> {
  const data = await gql<{
    worldData: {
      encounter: { characterRankings: { rankings?: RawRanking[]; error?: string } } | null;
    };
  }>(
    `query Rankings($encounter: Int!, $metric: CharacterRankingMetricType, $className: String,
                    $spec: String, $page: Int, $difficulty: Int, $partition: Int, $bracket: Int) {
      worldData { encounter(id: $encounter) {
        characterRankings(metric: $metric, className: $className, specName: $spec, page: $page,
                          difficulty: $difficulty, partition: $partition, bracket: $bracket,
                          includeCombatantInfo: true)
      } }
    }`,
    {
      encounter: q.encounterId,
      metric: q.metric,
      className: q.className,
      spec: q.spec,
      page,
      difficulty: q.difficulty || undefined,
      partition: q.partition || undefined,
      bracket: q.bracket || undefined,
    },
  );
  const encounter = data.worldData.encounter;
  if (!encounter) throw new HttpError(404, `Unknown encounter ${q.encounterId}`);
  // out-of-range pages return { error } instead of failing
  return (encounter.characterRankings.rankings ?? []).map((r) => ({
    amount: r.amount,
    tree: heroTreeOf((r.talents ?? []).map((t) => t.talentID)),
    log: r.report?.code
      ? {
          name: r.name,
          server: r.server ? `${r.server.name} (${r.server.region})` : "",
          code: r.report.code,
          fight: r.report.fightID,
          date: r.startTime,
        }
      : null,
  }));
}
