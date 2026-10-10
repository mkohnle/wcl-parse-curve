import type { ZoneList } from "../../shared/api.ts";
import { cached, HOUR } from "../cache.ts";
import { gql } from "./client.ts";

export interface Zone {
  id: number;
  name: string;
  /** past zones are frozen: their rankings no longer change */
  frozen: boolean;
  difficulties: { id: number; name: string }[];
  encounters: { id: number; name: string }[];
}

/** How many expansions back the character page goes. */
const EXPANSIONS = 2;

/** Raids and M+ seasons of the last expansions, newest first; PTR / beta / combined / test zones left out. */
export async function fetchZones(): Promise<{ raid: Zone[]; mythicPlus: Zone[] }> {
  const data = await gql<{
    worldData: { expansions: { id: number; name: string; zones: Zone[] }[] };
  }>(`
    query Zones {
      worldData { expansions { id name zones { id name frozen difficulties { id name } encounters { id name } } } }
    }`);
  const expansions = data.worldData.expansions.sort((a, b) => b.id - a.id).slice(0, EXPANSIONS);
  // PTR copies don't always say so in the name, but all their encounter ids are 50,000+
  // (live M+ seasons can have a few offset ids too)
  const live = expansions.flatMap((x) =>
    x.zones
      .filter(
        (z) =>
          z.encounters.length &&
          !/PTR|Beta|Complete Raid|Dummy|Delves/i.test(z.name) &&
          z.encounters.some((e) => e.id < 50_000),
      )
      .sort((a, b) => b.id - a.id)
      // "Mythic+ Season 2" exists in several expansions: name the expansion
      .map((z) => (/^Mythic\+ Season/i.test(z.name) ? { ...z, name: `${x.name} ${z.name.slice(8)}` } : z)),
  );
  return {
    raid: live.filter((z) => !/Season|Mythic\+/i.test(z.name)),
    mythicPlus: live.filter((z) => / Season \d/i.test(z.name)),
  };
}

/** The current raid (a full one, not a one-boss side raid) and M+ season. */
export function currentZones(zones: { raid: Zone[]; mythicPlus: Zone[] }) {
  return {
    raid: zones.raid.find((z) => z.encounters.length >= 3) ?? zones.raid[0],
    mythicPlus: zones.mythicPlus[0],
  };
}

/** For the character page's zone picker. */
export function zoneList(zones: { raid: Zone[]; mythicPlus: Zone[] }): ZoneList {
  const current = currentZones(zones);
  return {
    // raids: their difficulties, lowest first (M+ has none)
    raid: zones.raid.map(({ id, name, difficulties }) => ({
      id,
      name,
      difficulties: [...difficulties].sort((a, b) => a.id - b.id),
    })),
    mythicPlus: zones.mythicPlus.map(({ id, name }) => ({ id, name, difficulties: [] })),
    current: { raid: current.raid?.id ?? 0, mythicPlus: current.mythicPlus?.id ?? 0 },
  };
}

/** The zone list, cached (about 1 point when it isn't). */
export const getZones = () => cached("zones", 6 * HOUR, fetchZones);

/** True if the encounter belongs to a finished raid or season, whose rankings no longer change. */
export async function isFrozenEncounter(encounterId: number): Promise<boolean> {
  const all = await getZones().catch(() => null);
  const zone = [...(all?.raid ?? []), ...(all?.mythicPlus ?? [])].find((z) =>
    z.encounters.some((e) => e.id === encounterId),
  );
  return zone?.frozen ?? false;
}
