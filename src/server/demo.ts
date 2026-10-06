// Demo report without WCL calls. Parses come from synthetic leaderboards,
// so the curve must reproduce every one of them.

import type {
  DistributionQuery,
  FightResponse,
  Metric,
  Player,
  ReportResponse,
  Role,
} from "../shared/api.ts";
import { probit } from "../shared/math.ts";
import { heroTreesOf } from "./hero-trees.ts";
import type { RankingEntry } from "./wcl/queries.ts";

export const DEMO_CODE = "demo";
export const isDemoCode = (code: string) => code.toLowerCase() === DEMO_CODE;

const RAID_ENC = 9_000_001;
const DUNGEON_ENC = 9_000_002;
const KEY_LEVEL = 15;
/** Bracket index = key level - 1. */
const KEY_BRACKET = KEY_LEVEL - 1;

export const isDemoEncounter = (enc: number) => enc === RAID_ENC || enc === DUNGEON_ENC;

export const demoReport: ReportResponse = {
  title: "Demo report",
  zone: { id: 55, name: "Synthetic data, no API calls" },
  fights: [
    {
      id: 1,
      name: "Demo Boss",
      encounterID: RAID_ENC,
      difficulty: 4,
      kill: true,
      keystoneLevel: null,
      duration: 312_000,
    },
    {
      id: 2,
      name: "Demo Dungeon",
      encounterID: DUNGEON_ENC,
      difficulty: 10,
      kill: true,
      keystoneLevel: KEY_LEVEL,
      duration: 1_745_000,
    },
  ],
};

type Member = [name: string, cls: string, spec: string, role: Role];

const RAID: Member[] = [
  ["Ironhide", "DeathKnight", "Blood", "tank"],
  ["Lightwall", "Paladin", "Protection", "tank"],
  ["Mendora", "Priest", "Holy", "healer"],
  ["Leafsong", "Druid", "Restoration", "healer"],
  ["Tidecall", "Shaman", "Restoration", "healer"],
  ["Embervoice", "Evoker", "Preservation", "healer"],
  ["Axegrind", "Warrior", "Arms", "dps"],
  ["Rageborn", "Warrior", "Fury", "dps"],
  ["Plaguefist", "DeathKnight", "Unholy", "dps"],
  ["Frostbyte", "Mage", "Frost", "dps"],
  ["Pyrona", "Mage", "Fire", "dps"],
  ["Starfall", "Druid", "Balance", "dps"],
  ["Felrunner", "DemonHunter", "Havoc", "dps"],
  ["Deadeye", "Hunter", "Marksmanship", "dps"],
  ["Beastly", "Hunter", "BeastMastery", "dps"],
  ["Shivshank", "Rogue", "Assassination", "dps"],
  ["Doomwhisper", "Warlock", "Affliction", "dps"],
  ["Chaosbolt", "Warlock", "Destruction", "dps"],
  ["Judgemental", "Paladin", "Retribution", "dps"],
  ["Palmstrike", "Monk", "Windwalker", "dps"],
];

const DUNGEON: Member[] = [
  ["Kegsmash", "Monk", "Brewmaster", "tank"],
  ["Atonia", "Priest", "Discipline", "healer"],
  ["Rageborn", "Warrior", "Fury", "dps"],
  ["Frostbyte", "Mage", "Frost", "dps"],
  ["Felrunner", "DemonHunter", "Havoc", "dps"],
];

const TANK_SPECS = new Set([
  "DeathKnight-Blood",
  "DemonHunter-Vengeance",
  "Druid-Guardian",
  "Monk-Brewmaster",
  "Paladin-Protection",
  "Warrior-Protection",
]);

// ---------- deterministic randomness ----------

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 seeded from a string */
function random(seed: string): () => number {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- leaderboards ----------

interface Board {
  size: number;
  median: number;
  sigma: number;
  skew: number;
}

function board(q: Pick<DistributionQuery, "enc" | "bracket" | "metric" | "cls" | "spec">): Board {
  const r = random(`${q.enc}|${q.bracket}|${q.metric}|${q.cls}|${q.spec}`);
  const tank = TANK_SPECS.has(`${q.cls}-${q.spec}`);
  const base = q.metric === "hps" ? 180_000 : tank ? 110_000 : 230_000;
  // log-uniform size, ~800 to ~64k
  const size = Math.round(800 * 80 ** r());
  return {
    size: q.bracket ? Math.round(size / 4) + 300 : size,
    median: base * (0.85 + 0.3 * r()) * (q.enc === DUNGEON_ENC ? 1.15 : 1),
    sigma: 0.16 + 0.1 * r(),
    skew: 0.03 * r(),
  };
}

function amountAtRank(b: Board, rank: number): number {
  const z = probit(1 - (rank - 0.5) / b.size);
  return b.median * Math.exp(b.sigma * z + b.skew * Math.max(0, z) ** 2);
}

const PER_PAGE = 100;
const MAX_PAGE = 20;

/** Demo version of fetchRankingPage. No logs: there is nothing to link to. */
export function demoRankingPage(q: DistributionQuery, page: number): RankingEntry[] {
  if (page > MAX_PAGE) return [];
  const b = board(q);
  const first = (page - 1) * PER_PAGE + 1;
  const count = Math.max(0, Math.min(PER_PAGE, b.size - first + 1));
  const treeAt = demoTrees(q, b);
  return Array.from({ length: count }, (_, i) => ({
    amount: amountAtRank(b, first + i),
    log: null,
    tree: treeAt(first + i),
  }));
}

/** First hero tree's share drifts from top to bottom, so the filter shows a difference. */
function demoTrees(q: DistributionQuery, b: Board): (rank: number) => number | null {
  const [a, c] = heroTreesOf(q.cls, q.spec);
  if (!a || !c) return () => null;
  const r = random(`${q.enc}|${q.bracket}|${q.cls}|${q.spec}|trees`);
  const top = 0.2 + 0.6 * r();
  const bottom = 0.2 + 0.6 * r();
  return (rank) => {
    const share = top + ((bottom - top) * rank) / b.size;
    return random(`${q.cls}|${q.spec}|${rank}`)() < share ? a.id : c.id;
  };
}

// ---------- fights ----------

const clampParse = (p: number) => Math.max(0, Math.min(100, Math.round(p)));
const parseAt = (b: Board, rank: number) => Math.floor(100 * (1 - rank / b.size));

export function demoFight(fightId: number): FightResponse | null {
  const fight = demoReport.fights.find((f) => f.id === fightId);
  if (!fight) return null;
  const mythicPlus = fight.encounterID === DUNGEON_ENC;

  const players = (mythicPlus ? DUNGEON : RAID).map(([name, cls, spec, role]): Player => {
    const r = random(`${fight.id}|${name}`);
    const metric: Metric = role === "healer" ? "hps" : "dps";
    const overall = board({ enc: fight.encounterID, bracket: 0, metric, cls, spec });
    // spread players from gray to orange
    const target = 3 + 94 * r();

    if (!mythicPlus) {
      const rank = Math.max(1, Math.round(overall.size * (1 - target / 100)));
      const parse = parseAt(overall, rank);
      return {
        name,
        cls,
        spec,
        role,
        metric,
        amount: amountAtRank(overall, rank),
        parse,
        bracketParse: clampParse(parse + (r() - 0.5) * 30),
        totalParses: overall.size,
        bracket: null,
      };
    }

    // M+: key level parse from the key level board; overall parse is made up (WCL weighs key level)
    const keyBoard = board({ enc: fight.encounterID, bracket: KEY_BRACKET, metric, cls, spec });
    const rank = Math.max(1, Math.round(keyBoard.size * (1 - target / 100)));
    const bracketParse = parseAt(keyBoard, rank);
    return {
      name,
      cls,
      spec,
      role,
      metric,
      amount: amountAtRank(keyBoard, rank),
      parse: clampParse(bracketParse + (r() - 0.3) * 40),
      bracketParse,
      totalParses: overall.size,
      bracket: KEY_BRACKET,
    };
  });

  return { enc: fight.encounterID, diff: fight.difficulty, part: 0, players };
}
