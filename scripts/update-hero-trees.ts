// Builds src/server/data/hero-trees.json from Raidbots' talent data.
// Run after major patches: pnpm update:hero-trees

import { writeFileSync } from "node:fs";

const SOURCE = "https://www.raidbots.com/static/data/live/talents.json";
const OUT = new URL("../src/server/data/hero-trees.json", import.meta.url);

interface Entry {
  id: number;
  name?: string;
  icon?: string;
  traitSubTreeId?: number;
}
interface Node {
  subTreeId?: number;
  entryNode?: boolean;
  entries: Entry[];
}
interface Spec {
  className: string;
  specName: string;
  heroNodes: Node[];
  subTreeNodes: Node[];
}

const specs = (await (await fetch(SOURCE)).json()) as Spec[];
const noSpaces = (s: string) => s.replace(/\s+/g, "");

const out = {
  source: SOURCE,
  /** "Warrior-Arms" → its hero trees; icon: the keystone talent's icon */
  specs: {} as Record<string, { id: number; name: string; icon: string | null }[]>,
  /** talent entry id → hero tree id */
  talents: {} as Record<string, number>,
};

for (const spec of specs) {
  const trees = spec.subTreeNodes.flatMap((n) =>
    n.entries.flatMap((e) => (e.traitSubTreeId && e.name ? [{ id: e.traitSubTreeId, name: e.name, entry: e.id }] : [])),
  );
  const keystoneIcon = (tree: number) =>
    spec.heroNodes.find((n) => n.subTreeId === tree && n.entryNode)?.entries[0]?.icon ?? null;
  out.specs[`${noSpaces(spec.className)}-${noSpaces(spec.specName)}`] = trees.map(({ id, name }) => ({
    id,
    name,
    icon: keystoneIcon(id),
  }));
  // the tree's choice node itself, and every talent inside the tree
  for (const t of trees) out.talents[t.entry] = t.id;
  for (const node of spec.heroNodes) {
    if (node.subTreeId) for (const e of node.entries) out.talents[e.id] = node.subTreeId;
  }
}

writeFileSync(OUT, `${JSON.stringify(out)}\n`);
console.log(`${Object.keys(out.specs).length} specs, ${Object.keys(out.talents).length} hero talents → ${OUT.pathname}`);
