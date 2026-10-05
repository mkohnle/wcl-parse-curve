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

export interface DistributionResponse {
  /** Sampled [rank, amount] points, best first (top 2,000 max). */
  points: [rank: number, amount: number][];
  /** True if `points` reach the end of the leaderboard. */
  complete: boolean;
}
