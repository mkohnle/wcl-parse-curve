import type { HeroTree } from "../shared/api.ts";
import data from "./data/hero-trees.json" with { type: "json" };

const specs: Record<string, HeroTree[]> = data.specs;
const talents: Record<string, number> = data.talents;

export const heroTreesOf = (className: string, spec: string): HeroTree[] =>
  specs[`${className}-${spec}`] ?? [];

/** Hero tree id from a list of talent ids, or null if none matches. */
export function heroTreeOf(talentIds: number[]): number | null {
  for (const id of talentIds) {
    const tree = talents[id];
    if (tree) return tree;
  }
  return null;
}
