// Builds src/server/data/talent-trees.json (every spec's full talent trees) from Raidbots' talent data.
// Run after major patches: pnpm update:talent-trees

import { writeFileSync } from "node:fs";
import type { TalentNode, TalentTree } from "../src/shared/api.ts";
import { compactName } from "../src/shared/names.ts";

const SOURCE = "https://www.raidbots.com/static/data/live/talents.json";
const OUT = new URL("../src/server/data/talent-trees.json", import.meta.url);

interface RawEntry {
  type?: string;
  name?: string;
  spellId?: number;
  icon?: string;
  maxRanks?: number;
  traitSubTreeId?: number;
  atlasMemberName?: string;
}
interface RawNode {
  id: number;
  type: string;
  posX: number;
  posY: number;
  next: number[];
  subTreeId?: number;
  entries: RawEntry[];
}
interface RawSpec {
  className: string;
  specName: string;
  classNodes: RawNode[];
  specNodes: RawNode[];
  heroNodes: RawNode[];
  subTreeNodes: RawNode[];
}

const specs = (await (await fetch(SOURCE)).json()) as RawSpec[];

const toNode = (n: RawNode): TalentNode | null => {
  const entries = n.entries.flatMap((e) =>
    e.spellId && e.name
      ? [
          {
            spell: e.spellId,
            name: e.name,
            icon: e.icon ?? "inv_misc_questionmark",
            passive: e.type === "passive",
            maxRanks: e.maxRanks ?? 1,
          },
        ]
      : [],
  );
  if (!entries.length) return null;
  return { id: n.id, x: n.posX, y: n.posY, type: n.type, next: n.next, heroTree: n.subTreeId ?? 0, entries };
};
const nodes = (list: RawNode[]) => list.flatMap((n) => toNode(n) ?? []);

const out: Record<string, TalentTree> = {};
for (const spec of specs) {
  out[`${compactName(spec.className)}-${compactName(spec.specName)}`] = {
    class: nodes(spec.classNodes),
    spec: nodes(spec.specNodes),
    hero: nodes(spec.heroNodes),
    heroTrees: spec.subTreeNodes.flatMap((n) =>
      n.entries.flatMap((e) =>
        e.traitSubTreeId && e.name
          ? [{ id: e.traitSubTreeId, name: e.name, atlas: e.atlasMemberName ?? null }]
          : [],
      ),
    ),
  };
}

writeFileSync(OUT, `${JSON.stringify(out)}\n`);
console.log(`${Object.keys(out).length} specs → ${OUT.pathname}`);
