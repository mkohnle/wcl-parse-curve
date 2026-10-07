import type { Player, RunStats } from "../shared/api.ts";

// Tags for the players of an M+ run, from their parses and run stats.

export interface Tag {
  label: string;
  /** how it's decided, shown on hover */
  title: string;
  /** Tailwind classes */
  classes: string;
}

type Ran = Player & { run: RunStats };

/** Parse points a death costs in the MVP ranking. */
const DEATH_PENALTY = 5;
/** Deaths that make a run messy enough for Unkillable. */
const MANY_DEATHS = 3;
/** Off-healer: at least this share of the healer's healing. */
const OFF_HEAL_SHARE = 0.5;

const RULES: {
  tag: Tag;
  pick: (ps: Ran[], parse: (p: Player) => number) => Ran[];
}[] = [
  {
    tag: {
      label: "MVP",
      title: `Highest key level parse; each death counts as -${DEATH_PENALTY}`,
      classes: "bg-gold/15 text-gold",
    },
    pick: (ps, parse) => {
      const scores = ps.map((p) => parse(p) - DEATH_PENALTY * p.run.deaths);
      return only(ps, scores, Math.max(...scores));
    },
  },
  {
    tag: {
      label: "Top damage",
      title: "Most damage in the group",
      classes: "bg-orange-500/15 text-orange-300",
    },
    pick: (ps) => top(ps, (p) => p.run.damage),
  },
  {
    tag: { label: "Kicks", title: "Most interrupts", classes: "bg-sky-400/15 text-sky-300" },
    pick: (ps) => top(ps, (p) => p.run.interrupts),
  },
  {
    tag: {
      label: "Underdog",
      title: "Lowest item level, yet a parse above the group's middle",
      classes: "bg-emerald-400/15 text-emerald-300",
    },
    pick: (ps, parse) => {
      const levels = ps.map((p) => p.run.itemLevel);
      if (levels.some((l) => l === null)) return [];
      const low = bottom(ps, (p) => p.run.itemLevel as number);
      return low.length && parse(low[0]) > median(ps.map(parse)) ? low : [];
    },
  },
  {
    tag: {
      label: "Damage tank",
      title: "Tank with more damage than a damage dealer",
      classes: "bg-amber-400/15 text-amber-300",
    },
    pick: (ps) => {
      const dealers = ps.filter((p) => p.role === "dps");
      if (!dealers.length) return [];
      const least = Math.min(...dealers.map((p) => p.run.damage));
      return ps.filter((p) => p.role === "tank" && p.run.damage > least);
    },
  },
  {
    tag: {
      label: "Off-healer",
      title: `Most healing outside the healer, at least ${OFF_HEAL_SHARE * 100}% of the healer's`,
      classes: "bg-lime-400/15 text-lime-300",
    },
    pick: (ps) => {
      const healers = ps.filter((p) => p.role === "healer");
      if (!healers.length) return [];
      const healerHealing = Math.max(...healers.map((p) => p.run.healing));
      const best = top(
        ps.filter((p) => p.role !== "healer"),
        (p) => p.run.healing,
      );
      return best.filter((p) => p.run.healing >= OFF_HEAL_SHARE * healerHealing);
    },
  },
  {
    tag: {
      label: "Unkillable",
      title: `The only one who never died, in a run with ${MANY_DEATHS}+ deaths`,
      classes: "bg-violet-400/15 text-violet-300",
    },
    pick: (ps) => {
      const total = ps.reduce((a, p) => a + p.run.deaths, 0);
      const alive = ps.filter((p) => p.run.deaths === 0);
      return total >= MANY_DEATHS && alive.length === 1 ? alive : [];
    },
  },
  {
    tag: {
      label: "Floor inspector",
      title: "Most deaths (2+)",
      classes: "bg-red-500/15 text-red-300",
    },
    pick: (ps) => top(ps, (p) => p.run.deaths).filter((p) => p.run.deaths >= 2),
  },
  {
    tag: {
      label: "Thirsty",
      title: "Used the most healthstones and potions (2+)",
      classes: "bg-teal-400/15 text-teal-300",
    },
    pick: (ps) => top(ps, (p) => p.run.healthItems).filter((p) => p.run.healthItems >= 2),
  },
];

/** The one player with `target`; nobody on a tie. */
function only(ps: Ran[], values: number[], target: number): Ran[] {
  const hits = ps.filter((_, i) => values[i] === target);
  return hits.length === 1 ? hits : [];
}

/** The one player with the highest positive value; nobody on a tie. */
function top(ps: Ran[], value: (p: Ran) => number): Ran[] {
  const values = ps.map(value);
  const max = Math.max(0, ...values);
  return max > 0 ? only(ps, values, max) : [];
}

/** The one player with the lowest value; nobody on a tie. */
function bottom(ps: Ran[], value: (p: Ran) => number): Ran[] {
  const values = ps.map(value);
  return ps.length ? only(ps, values, Math.min(...values)) : [];
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Tags per player name; empty outside M+ (no run stats). */
export function runTags(players: Player[], parse: (p: Player) => number): Map<string, Tag[]> {
  const tags = new Map<string, Tag[]>();
  const ps = players.filter((p): p is Ran => p.run !== null);
  if (!ps.length) return tags;
  for (const { tag, pick } of RULES) {
    for (const p of pick(ps, parse)) tags.set(p.name, [...(tags.get(p.name) ?? []), tag]);
  }
  return tags;
}
