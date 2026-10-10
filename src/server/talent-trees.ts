import type { TalentTree } from "../shared/api.ts";
import data from "./data/talent-trees.json" with { type: "json" };

const trees = data as Record<string, TalentTree>;

/** A spec's full talent trees, e.g. ("Warrior", "Arms"); null if unknown. */
export const talentTreeOf = (className: string, spec: string): TalentTree | null =>
  trees[`${className}-${spec}`] ?? null;
