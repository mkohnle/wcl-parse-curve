// Response shapes of our own /api endpoints, shared by server and client.

export type Metric = "dps" | "hps";
/** What a curve can show: the player's metric, or another one WCL keeps leaderboards for. */
export type CurveMetric = Metric | "bossdps";
export const CURVE_METRICS: CurveMetric[] = ["dps", "hps", "bossdps"];
export type Role = "tank" | "healer" | "dps";
export type Region = "EU" | "US";

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

// ---------- reports ----------

export interface Fight {
  id: number;
  name: string;
  encounterId: number;
  difficulty: number;
  kill: boolean;
  keystoneLevel: number | null;
  /** M+: key upgrades when timed (1-3), null when depleted */
  keystoneBonus: number | null;
  /** ms */
  duration: number;
}

export interface ReportResponse {
  title: string;
  /** epoch ms */
  startTime: number;
  zone: { id: number; name: string } | null;
  fights: Fight[];
}

export interface Player {
  name: string;
  /** without spaces, e.g. "DeathKnight" */
  className: string;
  /** without spaces, e.g. "BeastMastery" */
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
  /** Rank behind `parse`, from Warcraft Logs. */
  rank: number | null;
  /** Warcraft Logs marks most ranks as estimates ("~123"). */
  rankApprox: boolean;
  /** Bracket index (M+: key level - 1). */
  bracket: number | null;
  /** null if unknown (e.g. demo) */
  realm: string | null;
  region: string | null;
  /** The same fight in the other metric (HPS for damage dealers, DPS for healers); null if unranked. */
  other: MetricResult | null;
  /** M+ only, else null */
  run: RunStats | null;
  itemLevel: number | null;
  /** talents in this fight; M+ only (they come with the run stats), raid: see /api/fight-talents */
  talents: FightTalent[] | null;
}

/** A player's result in one metric, from the fight's rankings. */
export interface MetricResult {
  amount: number;
  parse: number;
  bracketParse: number | null;
  totalParses: number | null;
}

/** A talent taken in a fight: the talent entry and its rank. */
export interface FightTalent {
  id: number;
  rank: number;
}

/** A player's stats over a whole M+ run. */
export interface RunStats {
  deaths: number;
  interrupts: number;
  damage: number;
  /** share of the group's damage (0-1) */
  damageShare: number;
  healing: number;
  /** healthstones and potions */
  healthItems: number;
  itemLevel: number | null;
}

export interface FightResponse {
  encounterId: number;
  difficulty: number;
  partition: number;
  players: Player[];
  /** Players in the fight that Warcraft Logs didn't rank. */
  unranked: number;
}

// ---------- leaderboards ----------

export interface DistributionQuery {
  encounterId: number;
  /** 0 = any (Mythic+) */
  difficulty: number;
  /** 0 = current */
  partition: number;
  /** Bracket index, 0 = all brackets */
  bracket: number;
  metric: CurveMetric;
  /** fewer sampled pages, for the optional metrics */
  lite: boolean;
  className: string;
  spec: string;
}

/** A player's log on Warcraft Logs. */
export interface LogRef {
  name: string;
  /** e.g. "Onyxia (EU)" */
  server: string;
  code: string;
  fight: number;
  /** epoch ms */
  date: number;
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
  /** Talent pick rates among the top 100. */
  topTalents: TopTalents;
}

/** How often the top players take each talent. */
export interface TopTalents {
  /** players with known talents */
  players: number;
  /** talent entry id -> share (0-1) */
  share: Record<number, number>;
  /** the same among the players of each hero tree, for the hero talents */
  byHeroTree: Record<number, { players: number; share: Record<number, number> }>;
}

// ---------- characters ----------

export interface Realm {
  name: string;
  slug: string;
}

/** Which part of a character page: the current raid or M+ season. */
export type CharacterSection = "raid" | "mythicPlus";

/** A character's best and median parse on one boss or dungeon. */
export interface CharacterBoss {
  encounterId: number;
  name: string;
  /** M+: highest key level run; best and median then only count runs at that key */
  keyLevel: number | null;
  /** null without kills */
  best: number | null;
  median: number | null;
  kills: number;
  bestAmount: number | null;
  /** without spaces */
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

export interface ZoneOption {
  id: number;
  name: string;
  /** raids only, e.g. 3 Normal, 4 Heroic, 5 Mythic */
  difficulties: { id: number; name: string }[];
}

/** Raids and M+ seasons to pick on the character page, newest first. */
export interface ZoneList {
  raid: ZoneOption[];
  mythicPlus: ZoneOption[];
  /** the zone shown when none is picked */
  current: { raid: number; mythicPlus: number };
}

export interface CharacterResponse {
  name: string;
  /** without spaces, e.g. "DeathKnight" */
  className: string;
  realm: Realm;
  region: Region;
  /** null if there is no current zone of that kind */
  zone: CharacterZone | null;
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
  /** Unrounded parse as of today, as fight rankings show it (`parse` is the one locked in back then). */
  todayParse: number;
  /** Population `todayParse` is measured against. */
  todayTotal: number;
  /** without spaces */
  spec: string;
}

// ---------- Raider.IO ----------

export interface RioRanks {
  world: number;
  region: number;
  realm: number;
}

/** A best M+ run per dungeon. */
export interface RioRun {
  dungeon: string;
  level: number;
  /** keystone upgrades when timed (1-3), 0 when depleted */
  upgrades: number;
  score: number;
  /** ms */
  time: number;
  /** timer, ms */
  par: number;
  icon: string;
}

/** An equipped item. */
export interface RioItem {
  slot: string;
  id: number;
  name: string;
  level: number;
  /** WoW item quality: 0 poor ... 4 epic, 5 legendary */
  quality: number;
  icon: string;
  /** for the exact Wowhead tooltip */
  bonus: number[];
  enchant: number | null;
  gems: number[];
}

/** A chosen talent, positioned like in the in-game tree. */
export interface RioTalent {
  /** tree node id, same as in TalentTree */
  node: number;
  spell: number;
  name: string;
  icon: string;
  /** in-game tree coordinates */
  x: number;
  y: number;
  rank: number;
  maxRank: number;
  tree: "class" | "hero" | "spec";
}

/** A character on Raider.IO: current M+ season, gear, talents and pictures. */
export interface RioProfile {
  score: number;
  /** Raider.IO's color for the score */
  color: string;
  ranks: { overall: RioRanks; class: RioRanks } | null;
  runs: RioRun[];
  url: string;
  /** Blizzard renders: small avatar and the bigger portrait crop */
  avatar: string | null;
  portrait: string | null;
  itemLevel: number | null;
  gear: RioItem[];
  /** active spec without spaces, e.g. "BeastMastery"; the talents are for this one */
  spec: string | null;
  /** in-game talent import string */
  talents: string | null;
  talentTree: RioTalent[];
}

// ---------- talent trees ----------

/** A talent node of a spec's full tree (Raidbots data). */
export interface TalentNode {
  id: number;
  /** in-game tree coordinates */
  x: number;
  y: number;
  /** "single", "choice" (one of two) or "tiered" */
  type: string;
  /** nodes this one leads to */
  next: number[];
  /** hero tree id, 0 for class and spec nodes */
  heroTree: number;
  /** id: the talent entry, as in WCL's talent lists */
  entries: { id: number; spell: number; name: string; icon: string; passive: boolean; maxRanks: number }[];
}

/** A spec's class, spec and hero trees. */
export interface TalentTree {
  class: TalentNode[];
  spec: TalentNode[];
  hero: TalentNode[];
  /** atlas: Blizzard texture name of the hero tree's emblem */
  heroTrees: { id: number; name: string; atlas: string | null }[];
}
