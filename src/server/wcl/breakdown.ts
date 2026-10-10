import type { Breakdown, Metric } from "../../shared/api.ts";
import { HttpError } from "../http.ts";
import { gql } from "./client.ts";

// One player's fight, ability by ability: what the log comparison is built from.

interface RawEntry {
  name: string;
  guid: number;
  total: number;
  abilityIcon?: string;
}
interface RawTable {
  data: { totalTime: number; entries: RawEntry[] };
}
interface RawPlayers {
  data: { totalTime: number; entries: { name: string; id: number; activeTime?: number }[] };
}

/** About 3 points: the fight's player list (ids, active time), then the player's casts and damage or healing. */
export async function fetchBreakdown(
  code: string,
  fightId: number,
  name: string,
  metric: Metric,
): Promise<Breakdown> {
  // without a source the casts table lists the players, with their id and active time (1 point)
  const list = await gql<{ reportData: { report: { players: RawPlayers } | null } }>(
    `query Players($code: String!, $fight: Int!) {
      reportData { report(code: $code) { players: table(fightIDs: [$fight], dataType: Casts) } }
    }`,
    { code, fight: fightId },
    1,
  );
  const players = list.reportData.report?.players.data;
  if (!players) throw new HttpError(404, "Report not found");
  const player = players.entries.find((p) => p.name === name);
  if (!player) throw new HttpError(404, `${name} isn't in this fight`);

  const data = await gql<{ reportData: { report: { casts: RawTable; amount: RawTable } } }>(
    `query Breakdown($code: String!, $fight: Int!, $source: Int!) {
      reportData { report(code: $code) {
        casts: table(fightIDs: [$fight], dataType: Casts, sourceID: $source)
        amount: table(fightIDs: [$fight], dataType: ${metric === "hps" ? "Healing" : "DamageDone"}, sourceID: $source)
      } }
    }`,
    { code, fight: fightId, source: player.id },
    2,
  );
  const { casts, amount } = data.reportData.report;

  // by name: a cast and its damage often have different spell ids (e.g. Bladestorm)
  const abilities = new Map<string, Breakdown["abilities"][number]>();
  const ability = (e: RawEntry) => {
    const known = abilities.get(e.name);
    if (known) return known;
    const fresh = {
      id: e.guid,
      name: e.name,
      icon: (e.abilityIcon ?? "").replace(/\.jpg$/, ""),
      casts: 0,
      amount: 0,
    };
    abilities.set(e.name, fresh);
    return fresh;
  };
  for (const e of casts.data.entries) ability(e).casts += e.total;
  for (const e of amount.data.entries) ability(e).amount += e.total;

  return {
    name,
    duration: players.totalTime,
    activeTime: player.activeTime ?? null,
    amount: [...abilities.values()].reduce((sum, a) => sum + a.amount, 0),
    abilities: [...abilities.values()].sort((a, b) => b.amount - a.amount || b.casts - a.casts),
  };
}
