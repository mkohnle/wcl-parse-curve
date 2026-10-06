import { gql } from "./client.ts";

export interface Zone {
  id: number;
  name: string;
  encounters: { id: number; name: string }[];
}

/** Zones of the latest expansion, newest first. */
export async function fetchLatestZones(): Promise<Zone[]> {
  const data = await gql<{ worldData: { expansions: { id: number; zones: Zone[] }[] } }>(`
    query Zones {
      worldData { expansions { id zones { id name encounters { id name } } } }
    }`);
  const latest = data.worldData.expansions.reduce((a, b) => (b.id > a.id ? b : a));
  return latest.zones.filter((z) => z.encounters.length).sort((a, b) => b.id - a.id);
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
