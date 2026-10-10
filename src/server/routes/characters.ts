import { Router } from "express";
import {
  type CharacterLog,
  type CharacterResponse,
  CURVE_METRICS,
  type CurveMetric,
  type Region,
} from "../../shared/api.ts";
import { cached, DAY, HOUR, MINUTE, peek, prime } from "../cache.ts";
import { characterParams, HttpError, int, region, str } from "../http.ts";
import { fetchLatestRun, fetchRio } from "../raiderio.ts";
import { fetchCharacter, fetchCharacterLogs, fetchRealms, type MythicPlusRuns } from "../wcl/characters.ts";
import { ensureBudget } from "../wcl/client.ts";
import { currentZones, getZones, zoneList } from "../wcl/zones.ts";

export const characters = Router();

const CHARACTER_TTL = 30 * MINUTE;
/** At least this often an M+ page is checked on WCL, even if Raider.IO shows no new run. */
const RECHECK = 6 * HOUR;

/** The last M+ load of a character, for cheap updates. */
interface LastMythicPlus {
  character: CharacterResponse;
  runs: MythicPlusRuns;
  /** Raider.IO's latest run then (see fetchLatestRun) */
  latestRun: string | null;
  /** when WCL was last asked in full */
  at: number;
}

const logsKey = (
  c: { name: string; realm: string; region: Region },
  encounterId: number,
  metric: string,
  difficulty: number,
  byKeyLevel: boolean,
) =>
  `charlogs|${c.region}|${c.realm}|${c.name.toLowerCase()}|${encounterId}|${metric}|${difficulty}|${byKeyLevel}`;

characters.get("/realms", async (req, res) => {
  const r = region(req.query.region);
  res.json(
    await cached(`realms|${r}`, 7 * DAY, async () => {
      await ensureBudget(3);
      return fetchRealms(r);
    }),
  );
});

const zones = getZones;

/** Raids and M+ seasons of the last two expansions. */
characters.get("/zones", async (_req, res) => {
  res.json(zoneList(await zones()));
});

/** ?section=raid|mythicPlus: only that part is loaded (and paid for). ?zone: a past raid or season, else the current. */
characters.get("/character", async (req, res) => {
  const c = characterParams(req);
  const mythicPlus = req.query.section === "mythicPlus";
  const all = await zones();
  const list = mythicPlus ? all.mythicPlus : all.raid;
  const zone =
    list.find((z) => z.id === int(req.query.zone)) ?? currentZones(all)[mythicPlus ? "mythicPlus" : "raid"];
  const wanted = int(req.query.difficulty);
  const difficulty = !mythicPlus && zone?.difficulties.some((d) => d.id === wanted) ? wanted : null;
  const key = `char|${c.region}|${c.realm}|${c.name.toLowerCase()}|${mythicPlus ? "mplus" : "raid"}|${zone?.id ?? 0}|${difficulty ?? 0}`;
  // past zones no longer change
  const ttl = zone?.frozen ? DAY : CHARACTER_TTL;
  // the last M+ load, kept longer: an update then only refetches dungeons with new kills,
  // or nothing at all if Raider.IO shows no new run since
  const lastKey = `${key}|last`;
  // the M+ runs came along: opening a dungeon is then free
  const primeLogs = (character: CharacterResponse, runs: MythicPlusRuns) => {
    const zoneDifficulty = character.zone?.difficulty ?? 0;
    for (const [encounterId, r] of runs) {
      prime(logsKey(c, encounterId, r.metric, zoneDifficulty, true), ttl, r.logs);
    }
  };
  res.json(
    await cached(key, ttl, async () => {
      const last = mythicPlus ? await peek<LastMythicPlus>(lastKey) : undefined;
      // free check first (current season only: past ones don't change anyway)
      const latestRun =
        mythicPlus && !zone?.frozen
          ? await fetchLatestRun(c.name, c.realm, c.region).catch(() => null)
          : null;
      if (last && latestRun !== null && latestRun === last.latestRun && Date.now() - last.at < RECHECK) {
        primeLogs(last.character, last.runs);
        return last.character;
      }
      await ensureBudget(mythicPlus ? 12 : 2);
      const { character, runs } = await fetchCharacter(
        c.name,
        c.realm,
        c.region,
        zone,
        mythicPlus,
        difficulty,
        last?.runs ?? null,
      );
      // WCL was just asked in full; the next full check is due in RECHECK (Raider.IO can lag or miss a logged run)
      if (mythicPlus)
        prime(lastKey, DAY, { character, runs, latestRun, at: Date.now() } satisfies LastMythicPlus);
      primeLogs(character, runs);
      return character;
    }),
  );
});

characters.get("/character/logs", async (req, res) => {
  const c = characterParams(req);
  const encounterId = int(req.query.encounterId);
  const difficulty = int(req.query.difficulty);
  const metric = CURVE_METRICS.includes(req.query.metric as CurveMetric)
    ? (req.query.metric as CurveMetric)
    : "dps";
  const byKeyLevel = req.query.keyLevel === "1";
  if (!encounterId) throw new HttpError(400, "Invalid encounter");
  // optional: a run that must be in the list (e.g. from a log uploaded after it was cached)
  const code = str(req.query.code);
  const fight = int(req.query.fight);

  const key = logsKey(c, encounterId, metric, difficulty, byKeyLevel);
  const fetch = async () => {
    await ensureBudget(1);
    return fetchCharacterLogs(c.name, c.realm, c.region, encounterId, metric, difficulty, byKeyLevel);
  };
  const has = (logs: CharacterLog[]) => logs.some((l) => l.code === code && l.fight === fight);
  const logs = await cached(key, CHARACTER_TTL, fetch);
  if (!code || has(logs)) {
    res.json(logs);
    return;
  }
  // refetch once; if WCL still doesn't list it, don't ask again for a while
  res.json(
    await cached(`${key}|${code}|${fight}`, 10 * MINUTE, async () => {
      const fresh = await fetch();
      if (has(fresh)) prime(key, CHARACTER_TTL, fresh);
      return fresh;
    }),
  );
});

/** Raider.IO M+ score, ranks and best runs; no WCL points. */
characters.get("/rio", async (req, res) => {
  const c = characterParams(req);
  const profile = await cached(`rio|${c.region}|${c.realm}|${c.name.toLowerCase()}`, 30 * MINUTE, () =>
    fetchRio(c.name, c.realm, c.region),
  );
  if (!profile) throw new HttpError(404, "Not on Raider.IO");
  res.json(profile);
});
