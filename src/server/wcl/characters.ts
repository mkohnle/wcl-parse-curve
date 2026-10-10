import type {
  CharacterBoss,
  CharacterLog,
  CharacterResponse,
  CharacterZone,
  CurveMetric,
  Metric,
  Realm,
  Region,
} from "../../shared/api.ts";
import { compactName } from "../../shared/names.ts";
import { HttpError } from "../http.ts";
import { gql } from "./client.ts";
import type { Zone } from "./zones.ts";

const REGION_IDS: Record<Region, number> = { US: 1, EU: 2 };

// WCL class ids
const CLASSES = [
  "",
  "DeathKnight",
  "Druid",
  "Hunter",
  "Mage",
  "Monk",
  "Paladin",
  "Priest",
  "Rogue",
  "Shaman",
  "Warlock",
  "Warrior",
  "DemonHunter",
  "Evoker",
];
const HEALER_SPECS = new Set([
  "Druid-Restoration",
  "Shaman-Restoration",
  "Paladin-Holy",
  "Priest-Holy",
  "Priest-Discipline",
  "Monk-Mistweaver",
  "Evoker-Preservation",
]);
const canHeal = (className: string) => [...HEALER_SPECS].some((s) => s.startsWith(`${className}-`));
const isHealer = (className: string, spec: string | null | undefined) =>
  Boolean(spec && HEALER_SPECS.has(`${className}-${compactName(spec)}`));

export async function fetchRealms(region: Region): Promise<Realm[]> {
  const realms: Realm[] = [];
  for (let page = 1; ; page++) {
    const data = await gql<{
      worldData: { region: { servers: { last_page: number; data: Realm[] } } | null };
    }>(
      `query Realms($id: Int!, $page: Int!) {
        worldData { region(id: $id) { servers(limit: 100, page: $page) { last_page data { name slug } } } }
      }`,
      { id: REGION_IDS[region], page },
    );
    const servers = data.worldData.region?.servers;
    if (!servers) break;
    realms.push(...servers.data);
    if (page >= servers.last_page) break;
  }
  return realms.sort((a, b) => a.name.localeCompare(b.name));
}

interface RawZoneRankings {
  difficulty: number;
  rankings?: {
    encounter: { id: number; name: string };
    rankPercent: number | null;
    medianPercent: number | null;
    totalKills: number;
    spec: string | null;
    bestAmount: number;
  }[];
}

interface RawCharacter {
  name: string;
  classID: number;
  server: Realm;
  zone?: RawZoneRankings;
}

/** M+ runs per dungeon, fetched with the character so opening a dungeon costs nothing. kills: as of then. */
export type MythicPlusRuns = Map<number, { metric: Metric; kills: number; logs: CharacterLog[] }>;

/**
 * Best and median parse per boss in one zone (the current raid or M+ season).
 * Raid: 1 point (2 for classes that heal). M+: 5 (10), plus 1 per dungeon played; a refresh only for dungeons with new kills.
 */
export async function fetchCharacter(
  name: string,
  realm: string,
  region: Region,
  zone: Zone | undefined,
  mythicPlus: boolean,
  /** raid difficulty; null = the one WCL picks (the highest with kills) */
  difficulty: number | null = null,
  /** M+ runs from the last load: dungeons without new kills reuse them instead of costing a point each */
  previous: MythicPlusRuns | null = null,
): Promise<{ character: CharacterResponse; runs: MythicPlusRuns }> {
  // healing classes also get hps parses; each boss then uses the metric of the spec played
  const dps = await query("dps");
  const className = CLASSES[dps.classID] ?? "";
  const hps = zone && canHeal(className) ? await query("hps") : null;

  const character: CharacterResponse = {
    name: dps.name,
    className,
    realm: dps.server,
    region,
    zone: zone && dps.zone ? toZone(zone, mythicPlus, className, dps.zone, hps?.zone) : null,
  };

  // M+: best and median only from the highest key level, so fetch every run;
  // a dungeon with the same kills (and metric) as last time has the same runs
  const played = mythicPlus ? (character.zone?.bosses.filter((b) => b.kills > 0) ?? []) : [];
  const unchanged = (b: (typeof played)[number]) => {
    const p = previous?.get(b.encounterId);
    return p !== undefined && p.kills === b.kills && p.metric === b.metric;
  };
  const changed = played.filter((b) => !unchanged(b));
  const runs: MythicPlusRuns = changed.length
    ? await fetchRuns(
        name,
        realm,
        region,
        changed.map((b) => ({ id: b.encounterId, metric: b.metric, kills: b.kills })),
      )
    : new Map();
  for (const b of played) {
    const p = previous?.get(b.encounterId);
    if (p && unchanged(b)) runs.set(b.encounterId, p);
  }
  for (const b of played) {
    const logs = runs.get(b.encounterId)?.logs ?? [];
    const keyLevel = Math.max(...logs.map((l) => l.bracket));
    const parses = logs
      .filter((l) => l.bracket === keyLevel)
      .map((l) => l.parse)
      .sort((x, y) => y - x);
    if (!parses.length) continue;
    b.keyLevel = keyLevel;
    b.best = parses[0];
    const mid = parses.length / 2;
    b.median = parses.length % 2 ? parses[Math.floor(mid)] : (parses[mid - 1] + parses[mid]) / 2;
  }
  return { character, runs };

  async function query(metric: Metric): Promise<RawCharacter> {
    const diff = difficulty ? `, difficulty: ${difficulty}` : "";
    const field = zone ? `zone: zoneRankings(zoneID: ${zone.id}, metric: ${metric}${diff})` : "";
    const data = await gql<{ characterData: { character: RawCharacter | null } }>(
      `query Character($name: String!, $realm: String!, $region: String!) {
        characterData { character(name: $name, serverSlug: $realm, serverRegion: $region) {
          name classID server { name slug }
          ${field}
        } }
      }`,
      { name, realm, region },
    );
    const c = data.characterData.character;
    if (!c) throw new HttpError(404, "Character not found (unknown to Warcraft Logs, or hidden)");
    return c;
  }
}

function toZone(
  zone: Zone,
  mythicPlus: boolean,
  className: string,
  dps: RawZoneRankings,
  hps: RawZoneRankings | undefined,
): CharacterZone {
  return {
    id: zone.id,
    name: zone.name,
    mythicPlus,
    difficulty: dps.difficulty,
    bosses: zone.encounters.map((e): CharacterBoss => {
      const d = dps.rankings?.find((r) => r.encounter.id === e.id);
      const h = hps?.rankings?.find((r) => r.encounter.id === e.id);
      // hps if the boss was played as a healer (or never as anything else)
      const useHps = Boolean(
        h?.totalKills && isHealer(className, h.spec) && (!d?.totalKills || isHealer(className, d.spec)),
      );
      const r = useHps ? h : d;
      const played = Boolean(r?.totalKills);
      return {
        encounterId: e.id,
        name: e.name,
        keyLevel: null,
        best: played ? (r?.rankPercent ?? null) : null,
        median: played ? (r?.medianPercent ?? null) : null,
        kills: r?.totalKills ?? 0,
        // WCL's M+ bestAmount isn't DPS; the log list has the real numbers
        bestAmount: played && !mythicPlus ? (r?.bestAmount ?? null) : null,
        spec: r?.spec ? compactName(r.spec) : null,
        metric: useHps ? "hps" : "dps",
      };
    }),
  };
}

interface RawRank {
  report: { code: string; fightID: number };
  startTime: number;
  amount: number;
  rankPercent: number;
  todayPercent: number;
  todayTotalParses: number;
  bracketData: number;
  spec: string;
}

const toLogs = (ranks: RawRank[] | undefined): CharacterLog[] =>
  (ranks ?? [])
    .map((r) => ({
      code: r.report.code,
      fight: r.report.fightID,
      date: r.startTime,
      amount: r.amount,
      parse: r.rankPercent,
      bracket: r.bracketData,
      todayParse: r.todayPercent,
      todayTotal: r.todayTotalParses,
      spec: compactName(r.spec),
    }))
    .sort((a, b) => b.date - a.date);

/** All M+ runs for several dungeons in one request (1 point per dungeon), key level parses. */
async function fetchRuns(
  name: string,
  realm: string,
  region: Region,
  dungeons: { id: number; metric: Metric; kills: number }[],
): Promise<MythicPlusRuns> {
  const fields = dungeons
    .map((d) => `d${d.id}: encounterRankings(encounterID: ${d.id}, metric: ${d.metric}, byBracket: true)`)
    .join("\n");
  const data = await gql<{ characterData: { character: Record<string, { ranks?: RawRank[] }> | null } }>(
    `query Runs($name: String!, $realm: String!, $region: String!) {
      characterData { character(name: $name, serverSlug: $realm, serverRegion: $region) {
        ${fields}
      } }
    }`,
    { name, realm, region },
    dungeons.length,
  );
  const c = data.characterData.character;
  return new Map(
    dungeons.map((d) => [d.id, { metric: d.metric, kills: d.kills, logs: toLogs(c?.[`d${d.id}`]?.ranks) }]),
  );
}

/** A character's logs on one boss, newest first. byKeyLevel: M+ parses within the key level. */
export async function fetchCharacterLogs(
  name: string,
  realm: string,
  region: Region,
  encounterId: number,
  metric: CurveMetric,
  difficulty: number,
  byKeyLevel: boolean,
): Promise<CharacterLog[]> {
  const data = await gql<{
    characterData: { character: { encounterRankings: { ranks?: RawRank[] } } | null };
  }>(
    `query CharacterLogs($name: String!, $realm: String!, $region: String!, $encounter: Int!,
                         $metric: CharacterRankingMetricType, $difficulty: Int, $byBracket: Boolean) {
      characterData { character(name: $name, serverSlug: $realm, serverRegion: $region) {
        encounterRankings(encounterID: $encounter, metric: $metric, difficulty: $difficulty, byBracket: $byBracket)
      } }
    }`,
    {
      name,
      realm,
      region,
      encounter: encounterId,
      metric,
      difficulty: difficulty || undefined,
      byBracket: byKeyLevel,
    },
  );
  const c = data.characterData.character;
  if (!c) throw new HttpError(404, "Character not found");
  return toLogs(c.encounterRankings.ranks);
}
