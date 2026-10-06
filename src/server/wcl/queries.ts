import type { DistributionQuery, Fight, LogRef, ReportResponse, Zone } from "../../shared/api.ts";
import { heroTreeOf } from "../hero-trees.ts";
import { HttpError } from "../http.ts";
import { gql } from "./client.ts";

export async function fetchLatestZones(): Promise<Zone[]> {
  const data = await gql<{ worldData: { expansions: { id: number; zones: Zone[] }[] } }>(`
    query Zones {
      worldData { expansions { id zones { id name encounters { id name } } } }
    }`);
  const latest = data.worldData.expansions.reduce((a, b) => (b.id > a.id ? b : a));
  return latest.zones.filter((z) => z.encounters.length).sort((a, b) => b.id - a.id);
}

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
    `query Rankings($enc: Int!, $metric: CharacterRankingMetricType, $cls: String, $spec: String,
                    $page: Int, $diff: Int, $part: Int, $bracket: Int) {
      worldData { encounter(id: $enc) {
        characterRankings(metric: $metric, className: $cls, specName: $spec, page: $page,
                          difficulty: $diff, partition: $part, bracket: $bracket,
                          includeCombatantInfo: true)
      } }
    }`,
    {
      enc: q.enc,
      metric: q.metric,
      cls: q.cls,
      spec: q.spec,
      page,
      diff: q.diff || undefined,
      part: q.part || undefined,
      bracket: q.bracket || undefined,
    },
  );
  const encounter = data.worldData.encounter;
  if (!encounter) throw new HttpError(404, `Unknown encounter ${q.enc}`);
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
        }
      : null,
  }));
}

interface RawFight extends Omit<Fight, "duration"> {
  startTime: number;
  endTime: number;
}

/** `endTime`: when the log ended (epoch ms); recent means it may still be live. */
export async function fetchReport(code: string): Promise<{ report: ReportResponse; endTime: number }> {
  const data = await gql<{
    reportData: {
      report: { title: string; endTime: number; zone: ReportResponse["zone"]; fights: RawFight[] } | null;
    };
  }>(
    `query Report($code: String!) {
      reportData { report(code: $code) {
        title
        endTime
        zone { id name }
        fights { id name encounterID difficulty kill keystoneLevel startTime endTime }
      } }
    }`,
    { code },
  );
  const report = data.reportData.report;
  if (!report) throw new HttpError(404, "Report not found");
  return {
    endTime: report.endTime,
    report: {
      title: report.title,
      zone: report.zone,
      fights: report.fights
        .filter((f) => f.encounterID > 0)
        .map(({ startTime, endTime, ...f }) => ({
          ...f,
          kill: Boolean(f.kill),
          duration: endTime - startTime,
        })),
    },
  };
}

export interface RawCharacterRanking {
  name: string;
  class: string;
  spec: string;
  amount: number;
  rankPercent: number;
  bracketPercent?: number;
  totalParses?: number;
  bracket?: number;
}

export interface RawFightRanking {
  encounter: { id: number; name: string };
  difficulty: number;
  partition: number;
  roles?: Partial<Record<"tanks" | "healers" | "dps", { characters: RawCharacterRanking[] }>>;
}

export interface RawFightRankings {
  dps: { data: RawFightRanking[] } | null;
  hps: { data: RawFightRanking[] } | null;
}

/** 2 points per rankings field (measured). */
export const FIGHT_COST = 4;

export async function fetchFightRankings(code: string, fightId: number): Promise<RawFightRankings> {
  const data = await gql<{ reportData: { report: RawFightRankings | null } }>(
    `query FightRankings($code: String!, $fight: Int!) {
      reportData { report(code: $code) {
        dps: rankings(fightIDs: [$fight], playerMetric: dps)
        hps: rankings(fightIDs: [$fight], playerMetric: hps)
      } }
    }`,
    { code, fight: fightId },
    FIGHT_COST,
  );
  const report = data.reportData.report;
  if (!report) throw new HttpError(404, "Report not found");
  return report;
}
