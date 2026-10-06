// Response shapes of our own /api endpoints, shared by server and client.

export type Metric = "dps" | "hps";
export type Role = "tank" | "healer" | "dps";

export interface ApiError {
  error: string;
}

/** Warcraft Logs API points for the current hour. */
export interface Budget {
  limit: number;
  remaining: number;
  /** seconds */
  resetIn: number;
}

export interface Zone {
  id: number;
  name: string;
  encounters: { id: number; name: string }[];
}

export interface Fight {
  id: number;
  name: string;
  encounterID: number;
  difficulty: number;
  kill: boolean;
  keystoneLevel: number | null;
  /** ms */
  duration: number;
}

export interface ReportResponse {
  title: string;
  zone: { id: number; name: string } | null;
  fights: Fight[];
}

export interface Player {
  name: string;
  /** Class without spaces, e.g. "DeathKnight" */
  cls: string;
  /** Spec without spaces, e.g. "BeastMastery" */
  spec: string;
  role: Role;
  metric: Metric;
  amount: number;
  /** Overall parse (0-100) as shown on Warcraft Logs. */
  parse: number;
  /** Parse within the ilvl / key level bracket. */
  bracketParse: number | null;
  /** Population `parse` is measured against. */
  totalParses: number | null;
  /** Bracket index (M+: key level - 1). */
  bracket: number | null;
}

export interface FightResponse {
  enc: number;
  diff: number;
  part: number;
  players: Player[];
}

export interface DistributionQuery {
  enc: number;
  /** 0 = any (Mythic+) */
  diff: number;
  /** 0 = current */
  part: number;
  /** Bracket index, 0 = all brackets */
  bracket: number;
  metric: Metric;
  cls: string;
  spec: string;
}

export type Region = "EU" | "US";

export interface Realm {
  name: string;
  slug: string;
}

/** A character's best and median parse on one boss or dungeon. */
export interface CharacterBoss {
  encounterID: number;
  name: string;
  /** M+: highest key level run; best and median then only count runs at that key */
  keyLevel: number | null;
  /** null without kills */
  best: number | null;
  median: number | null;
  kills: number;
  bestAmount: number | null;
  spec: string | null;
  metric: Metric;
}

export interface CharacterZone {
  id: number;
  name: string;
  mythicPlus: boolean;
  difficulty: number;
  bosses: CharacterBoss[];
}

export interface CharacterResponse {
  name: string;
  /** Class without spaces, e.g. "DeathKnight" */
  cls: string;
  realm: Realm;
  region: Region;
  zones: CharacterZone[];
}

/** One of a character's logs on a boss. */
export interface CharacterLog {
  code: string;
  fight: number;
  /** epoch ms */
  date: number;
  amount: number;
  parse: number;
  /** item level (raid) or key level (M+) */
  bracket: number;
  spec: string;
}

/** A player's log on Warcraft Logs. */
export interface LogRef {
  name: string;
  /** e.g. "Onyxia (EU)" */
  server: string;
  code: string;
  fight: number;
}

export interface HeroTree {
  id: number;
  name: string;
  /** keystone talent icon name, e.g. "inv_ability_slayerwarrior_slayersdominance" */
  icon: string | null;
}

export interface DistributionResponse {
  /** Sampled [rank, amount] points, best first (top 2,000 max). */
  points: [rank: number, amount: number][];
  /** The log behind each point (same order), null if hidden. */
  logs: (LogRef | null)[];
  /** Hero tree id of each point (same order), null if unknown. */
  trees: (number | null)[];
  /** The spec's hero trees. */
  heroTrees: HeroTree[];
  /** True if `points` reach the end of the leaderboard. */
  complete: boolean;
}
