import type { Fight, FightResponse, Metric, Player, ReportResponse, Role } from "../../shared/api.ts";
import { compactName } from "../../shared/names.ts";
import { HttpError } from "../http.ts";
import { gql } from "./client.ts";

interface RawFight extends Omit<Fight, "duration" | "encounterId"> {
  encounterID: number;
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
        .map(({ startTime, endTime, encounterID, ...f }) => ({
          ...f,
          encounterId: encounterID,
          kill: Boolean(f.kill),
          duration: endTime - startTime,
        })),
    },
  };
}

interface RawCharacterRanking {
  name: string;
  class: string;
  spec: string;
  amount: number;
  rankPercent: number;
  bracketPercent?: number;
  totalParses?: number;
  /** e.g. 123 or "~123" */
  rank?: number | string;
  server?: { name: string; region: string };
  bracket?: number;
}

interface RawFightRanking {
  encounter: { id: number };
  difficulty: number;
  partition: number;
  /** players in the fight */
  size?: number;
  roles?: Partial<Record<RoleGroup, { characters: RawCharacterRanking[] }>>;
}

type RoleGroup = "tanks" | "healers" | "dps";
const ROLE: Record<RoleGroup, Role> = { tanks: "tank", healers: "healer", dps: "dps" };

/** 2 points per rankings field (measured). */
export const FIGHT_COST = 4;

/** Players of a fight with their parses, or null if the fight isn't ranked (yet). */
export async function fetchFight(code: string, fightId: number): Promise<FightResponse | null> {
  const data = await gql<{
    reportData: {
      report: { dps: { data: RawFightRanking[] } | null; hps: { data: RawFightRanking[] } | null } | null;
    };
  }>(
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
  const dps = report.dps?.data[0];
  const hps = report.hps?.data[0];
  if (!dps) return null;
  const players = [
    ...toPlayers(dps, "tanks", "dps"),
    ...toPlayers(hps, "healers", "hps"),
    ...toPlayers(dps, "dps", "dps"),
  ];
  // right after upload WCL can return rankings with every parse still 0
  if (players.every((p) => !p.parse && !p.bracketParse)) return null;
  return {
    encounterId: dps.encounter.id,
    difficulty: dps.difficulty,
    partition: dps.partition,
    players,
    unranked: Math.max(0, (dps.size ?? 0) - players.length),
  };
}

function toPlayers(ranking: RawFightRanking | undefined, group: RoleGroup, metric: Metric): Player[] {
  return (ranking?.roles?.[group]?.characters ?? []).map((c) => ({
    name: c.name,
    className: compactName(c.class),
    spec: compactName(c.spec),
    role: ROLE[group],
    metric,
    amount: c.amount,
    parse: c.rankPercent,
    bracketParse: c.bracketPercent ?? null,
    totalParses: c.totalParses ?? null,
    rank: Number.parseInt(String(c.rank ?? "").replace("~", ""), 10) || null,
    rankApprox: String(c.rank ?? "").startsWith("~"),
    bracket: c.bracket ?? null,
    realm: c.server?.name ?? null,
    region: c.server?.region ?? null,
  }));
}
