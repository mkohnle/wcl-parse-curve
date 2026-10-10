import type {
  Fight,
  FightResponse,
  Metric,
  MetricResult,
  Player,
  ReportResponse,
  Role,
  RunStats,
} from "../../shared/api.ts";
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
      report: {
        title: string;
        startTime: number;
        endTime: number;
        zone: ReportResponse["zone"];
        fights: RawFight[];
      } | null;
    };
  }>(
    `query Report($code: String!) {
      reportData { report(code: $code) {
        title
        startTime
        endTime
        zone { id name }
        fights { id name encounterID difficulty kill keystoneLevel keystoneBonus startTime endTime }
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
      startTime: report.startTime,
      zone: report.zone,
      fights: report.fights
        .filter((f) => f.encounterID > 0)
        .map(({ startTime, endTime, encounterID, ...f }) => ({
          ...f,
          encounterId: encounterID,
          kill: Boolean(f.kill),
          keystoneBonus: f.keystoneBonus || null,
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
  /** raid: the player's item level (M+: the key level) */
  bracketData?: number;
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

/** 2 points per rankings field, M+ adds 1 each for the summary and interrupts tables (measured). */
export const fightCost = (mythicPlus: boolean) => (mythicPlus ? 6 : 4);

interface RawTable<T> {
  data: T;
}
interface RawSummary {
  /** one per death */
  deathEvents: { name: string }[];
  damageDone: { name: string; total: number }[];
  healingDone: { name: string; total: number }[];
  playerDetails: Partial<
    Record<RoleGroup, { name: string; maxItemLevel?: number; potionUse?: number; healthstoneUse?: number }[]>
  >;
}
/** Per kicked enemy spell, who kicked it how often. */
type RawInterrupts = { entries?: { details?: { name: string; total: number }[] }[] };

/** Players of a fight with their parses, or null if the fight isn't ranked (yet). M+ adds run stats. */
export async function fetchFight(
  code: string,
  fightId: number,
  mythicPlus: boolean,
): Promise<FightResponse | null> {
  const data = await gql<{
    reportData: {
      report: {
        dps: { data: RawFightRanking[] } | null;
        hps: { data: RawFightRanking[] } | null;
        summary?: RawTable<RawSummary>;
        kicks?: RawTable<{ entries: RawInterrupts[] }>;
      } | null;
    };
  }>(
    `query FightRankings($code: String!, $fight: Int!) {
      reportData { report(code: $code) {
        dps: rankings(fightIDs: [$fight], playerMetric: dps)
        hps: rankings(fightIDs: [$fight], playerMetric: hps)
        ${
          mythicPlus
            ? `summary: table(fightIDs: [$fight], dataType: Summary)
               kicks: table(fightIDs: [$fight], dataType: Interrupts)`
            : ""
        }
      } }
    }`,
    { code, fight: fightId },
    fightCost(mythicPlus),
  );
  const report = data.reportData.report;
  if (!report) throw new HttpError(404, "Report not found");
  const dps = report.dps?.data[0];
  const hps = report.hps?.data[0];
  if (!dps) return null;

  const stats =
    report.summary && report.kicks ? runStats(report.summary.data, report.kicks.data.entries) : null;
  const players = [
    ...toPlayers(dps, "tanks", "dps", hps),
    ...toPlayers(hps, "healers", "hps", dps),
    ...toPlayers(dps, "dps", "dps", hps),
  ].map((p) => {
    if (!stats) return p;
    // in M+ bracketData is the key level; the item level comes with the run stats
    const run = stats(p.name);
    return { ...p, run, itemLevel: run.itemLevel };
  });
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

function runStats(summary: RawSummary, interrupts: RawInterrupts[]): (name: string) => RunStats {
  const add = (m: Map<string, number>, name: string, n: number) => m.set(name, (m.get(name) ?? 0) + n);
  const deaths = new Map<string, number>();
  for (const d of summary.deathEvents) add(deaths, d.name, 1);
  const kicks = new Map<string, number>();
  for (const group of interrupts)
    for (const spell of group.entries ?? []) for (const k of spell.details ?? []) add(kicks, k.name, k.total);
  const damage = new Map(summary.damageDone.map((d) => [d.name, d.total]));
  const healing = new Map(summary.healingDone.map((d) => [d.name, d.total]));
  const groupDamage = [...damage.values()].reduce((a, b) => a + b, 0);
  const details = new Map(
    Object.values(summary.playerDetails)
      .flat()
      .map((p) => [p.name, p]),
  );
  return (name) => {
    const d = details.get(name);
    return {
      deaths: deaths.get(name) ?? 0,
      interrupts: kicks.get(name) ?? 0,
      damage: damage.get(name) ?? 0,
      damageShare: groupDamage ? (damage.get(name) ?? 0) / groupDamage : 0,
      healing: healing.get(name) ?? 0,
      healthItems: (d?.healthstoneUse ?? 0) + (d?.potionUse ?? 0),
      itemLevel: d?.maxItemLevel ?? null,
    };
  };
}

/** otherRanking: the same fight in the other metric, for `Player.other`. */
function toPlayers(
  ranking: RawFightRanking | undefined,
  group: RoleGroup,
  metric: Metric,
  otherRanking: RawFightRanking | undefined,
): Player[] {
  const others = Object.values(otherRanking?.roles ?? {}).flatMap((g) => g?.characters ?? []);
  const otherOf = (name: string): MetricResult | null => {
    const o = others.find((x) => x.name === name);
    return o
      ? {
          amount: o.amount,
          parse: o.rankPercent,
          bracketParse: o.bracketPercent ?? null,
          totalParses: o.totalParses ?? null,
        }
      : null;
  };
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
    other: otherOf(c.name),
    run: null,
    itemLevel: c.bracketData ?? null,
  }));
}
