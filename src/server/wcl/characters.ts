import type {
  CharacterBoss,
  CharacterLog,
  CharacterResponse,
  CharacterZone,
  Metric,
  Realm,
  Region,
  Zone,
} from "../../shared/api.ts";
import { HttpError } from "../http.ts";
import { gql } from "./client.ts";

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
const canHeal = (cls: string) => [...HEALER_SPECS].some((s) => s.startsWith(`${cls}-`));

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

/** Latest raid and M+ season, skipping PTR / beta / combined zones. */
export function currentZones(zones: Zone[]): { raid: Zone | undefined; mythicPlus: Zone | undefined } {
  // PTR copies don't always say so in the name, but all their encounter ids are 50,000+
  // (live M+ seasons can have a few offset ids too)
  const live = zones.filter(
    (z) => !/PTR|Beta|Complete Raid|Dummy/i.test(z.name) && z.encounters.some((e) => e.id < 50_000),
  );
  return {
    raid: live.find((z) => !/Mythic\+/i.test(z.name) && z.encounters.length >= 3),
    mythicPlus: live.find((z) => /^Mythic\+ Season/i.test(z.name)),
  };
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

/** M+ runs per dungeon, fetched with the character so opening a dungeon costs nothing. */
export type MythicPlusRuns = Map<number, { metric: Metric; logs: CharacterLog[] }>;

/**
 * Best and median parse per boss in the current raid and M+ season.
 * Costs 2 points (4 for classes that heal) plus 1 per M+ dungeon played.
 */
export async function fetchCharacter(
  name: string,
  realm: string,
  region: Region,
  zones: { raid: Zone | undefined; mythicPlus: Zone | undefined },
): Promise<{ character: CharacterResponse; runs: MythicPlusRuns }> {
  const wanted = [
    ["raid", zones.raid],
    ["mplus", zones.mythicPlus],
  ].filter((z): z is [string, Zone] => Boolean(z[1]));

  // healing classes also get hps parses; each boss then uses the metric of the spec played
  const first = await query(false);
  const cls = CLASSES[first.classID] ?? "";
  const hps = canHeal(cls) ? await query(true) : null;

  const character: CharacterResponse = {
    name: first.name,
    cls,
    realm: first.server,
    region,
    zones: wanted.map(([key, zone]): CharacterZone => {
      const dps = first[key] as RawZoneRankings;
      const heal = hps?.[key] as RawZoneRankings | undefined;
      return {
        id: zone.id,
        name: zone.name,
        mythicPlus: key === "mplus",
        difficulty: dps.difficulty,
        bosses: zone.encounters.map((e): CharacterBoss => {
          const d = dps.rankings?.find((r) => r.encounter.id === e.id);
          const h = heal?.rankings?.find((r) => r.encounter.id === e.id);
          // hps if the boss was played as a healer (or never as anything else)
          const healer = (spec: string | null | undefined) =>
            Boolean(spec && HEALER_SPECS.has(`${cls}-${spec}`));
          const useHeal = Boolean(h?.totalKills && healer(h.spec) && (!d?.totalKills || healer(d.spec)));
          const r = useHeal ? h : d;
          return {
            encounterID: e.id,
            name: e.name,
            keyLevel: null,
            best: r?.totalKills ? r.rankPercent : null,
            median: r?.totalKills ? r.medianPercent : null,
            kills: r?.totalKills ?? 0,
            // WCL's M+ bestAmount isn't DPS; the log list has the real numbers
            bestAmount: r?.totalKills && key !== "mplus" ? r.bestAmount : null,
            spec: r?.spec ?? null,
            metric: useHeal ? "hps" : "dps",
          };
        }),
      };
    }),
  };

  // M+: best and median only from the highest key level, so fetch every run
  const mplus = character.zones.find((z) => z.mythicPlus);
  const played = mplus?.bosses.filter((b) => b.kills > 0) ?? [];
  const runs: MythicPlusRuns = played.length
    ? await fetchRuns(
        name,
        realm,
        region,
        played.map((b) => ({ id: b.encounterID, metric: b.metric })),
      )
    : new Map();
  for (const b of played) {
    const logs = runs.get(b.encounterID)?.logs ?? [];
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

  async function query(heal: boolean) {
    const metric = heal ? "hps" : "dps";
    const fields = wanted
      .map(([key, zone]) => `${key}: zoneRankings(zoneID: ${zone.id}, metric: ${metric})`)
      .join("\n");
    const data = await gql<{
      characterData: {
        character: ({ name: string; classID: number; server: Realm } & Record<string, unknown>) | null;
      };
    }>(
      `query Character($name: String!, $realm: String!, $region: String!) {
        characterData { character(name: $name, serverSlug: $realm, serverRegion: $region) {
          name classID server { name slug }
          ${fields}
        } }
      }`,
      { name, realm, region },
      wanted.length,
    );
    const c = data.characterData.character;
    if (!c) throw new HttpError(404, "Character not found (unknown to Warcraft Logs, or hidden)");
    return c;
  }
}

interface RawRank {
  report: { code: string; fightID: number };
  startTime: number;
  amount: number;
  rankPercent: number;
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
      spec: r.spec,
    }))
    .sort((a, b) => b.date - a.date);

/** All M+ runs for several dungeons in one request (1 point per dungeon), key level parses. */
async function fetchRuns(
  name: string,
  realm: string,
  region: Region,
  dungeons: { id: number; metric: Metric }[],
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
  return new Map(dungeons.map((d) => [d.id, { metric: d.metric, logs: toLogs(c?.[`d${d.id}`]?.ranks) }]));
}

/** A character's logs on one boss, newest first. byKeyLevel: M+ parses within the key level. */
export async function fetchCharacterLogs(
  name: string,
  realm: string,
  region: Region,
  encounterID: number,
  metric: Metric,
  difficulty: number,
  byKeyLevel: boolean,
): Promise<CharacterLog[]> {
  const data = await gql<{
    characterData: {
      character: {
        encounterRankings: {
          ranks?: RawRank[];
        };
      } | null;
    };
  }>(
    `query CharacterLogs($name: String!, $realm: String!, $region: String!, $enc: Int!,
                         $metric: CharacterRankingMetricType, $diff: Int, $byBracket: Boolean) {
      characterData { character(name: $name, serverSlug: $realm, serverRegion: $region) {
        encounterRankings(encounterID: $enc, metric: $metric, difficulty: $diff, byBracket: $byBracket)
      } }
    }`,
    { name, realm, region, enc: encounterID, metric, diff: difficulty || undefined, byBracket: byKeyLevel },
  );
  const c = data.characterData.character;
  if (!c) throw new HttpError(404, "Character not found");
  return toLogs(c.encounterRankings.ranks);
}
