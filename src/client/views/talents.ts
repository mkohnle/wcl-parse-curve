import type { RioProfile, RioTalent, TalentNode, TalentTree } from "../../shared/api.ts";
import { esc, spaced } from "../format.ts";
import { specIcon, talentIcon } from "../wow.ts";
import { img } from "./common.ts";

// The talent popup: a spec's full trees like in-game, the chosen talents lit.

/** Grid step of the in-game tree coordinates, and how many pixels one step gets here. */
const STEP = 600;
const CELL = 44;
const ICON = 36;

const atlas = (name: string) => `https://wow.zamimg.com/images/wow/TextureAtlas/live/${name}.webp`;
/** The in-game talent background, e.g. talents-background-warrior-arms */
const background = (className: string, spec: string) =>
  atlas(`talents-background-${className.toLowerCase()}-${spec.toLowerCase()}`);

/** Octagon for choice nodes, like in-game. */
const OCTAGON = "polygon(30% 0,70% 0,100% 30%,100% 70%,70% 100%,30% 100%,0 70%,0 30%)";

function treeBox(title: string, nodes: TalentNode[], chosen: Map<number, RioTalent>, emblem = ""): string {
  if (!nodes.length) return "";
  const minX = Math.min(...nodes.map((n) => n.x));
  const minY = Math.min(...nodes.map((n) => n.y));
  const px = (v: number, min: number) => ((v - min) / STEP) * CELL;
  const width = Math.max(...nodes.map((n) => px(n.x, minX))) + ICON;
  const height = Math.max(...nodes.map((n) => px(n.y, minY))) + ICON;
  const center = (n: TalentNode) => [px(n.x, minX) + ICON / 2, px(n.y, minY) + ICON / 2];
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // connections first, so the icons sit on top; lit when both ends are taken
  const lines = nodes
    .flatMap((n) =>
      n.next.flatMap((id) => {
        const m = byId.get(id);
        if (!m) return [];
        const [x1, y1] = center(n);
        const [x2, y2] = center(m);
        const lit = chosen.has(n.id) && chosen.has(m.id);
        return [
          `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${lit ? "#e5cc80" : "#4a3b2c"}" stroke-width="${lit ? 2.5 : 2}" stroke-opacity="${lit ? 0.85 : 0.7}"/>`,
        ];
      }),
    )
    .join("");

  const icons = nodes
    .map((n) => {
      const pick = chosen.get(n.id);
      const entry = n.entries.find((e) => e.spell === pick?.spell) ?? n.entries[0];
      const rank = pick?.rank ?? 0;
      const full = pick !== undefined && rank >= entry.maxRanks;
      const shape = n.type === "choice" ? "" : entry.passive ? "rounded-full" : "rounded-sm";
      // gold when fully taken, green when partly, dim when not taken
      const frame = full ? "#e5cc80" : pick ? "#1eff00" : "#5a5249";
      const look = pick ? "" : "grayscale opacity-45";
      const clip = n.type === "choice" ? `clip-path:${OCTAGON};` : "";
      return `
        <a href="https://www.wowhead.com/spell=${entry.spell}" data-wowhead="spell=${entry.spell}" target="_blank" rel="noreferrer"
           class="absolute hover:z-10" style="left:${px(n.x, minX)}px;top:${px(n.y, minY)}px">
          <span class="block size-[36px] p-[2px] ${shape} transition hover:brightness-125" style="${clip}background:${frame}">
            <img src="${talentIcon(entry.icon)}" data-fallback="${talentIcon("inv_misc_questionmark")}" alt="" loading="lazy" class="block size-full ${shape} ${look}" style="${clip}" />
          </span>
          ${
            entry.maxRanks > 1
              ? `<span class="absolute -right-1.5 -bottom-1.5 rounded-sm border border-black bg-black/90 px-1 text-[10px] font-bold leading-tight ${full ? "text-gold" : pick ? "text-[#1eff00]" : "text-zinc-500"}">${rank}/${entry.maxRanks}</span>`
              : ""
          }
        </a>`;
    })
    .join("");

  return `
    <div class="flex flex-col items-center">
      <div class="mb-3 flex h-12 items-center gap-2">
        ${emblem}
        <span class="text-sm font-bold uppercase tracking-[0.14em] text-gold" style="text-shadow:0 1px 3px #000">${esc(title)}</span>
      </div>
      <div class="relative" style="width:${width}px;height:${height}px">
        <svg class="absolute inset-0 overflow-visible" width="${width}" height="${height}" aria-hidden="true">${lines}</svg>
        ${icons}
      </div>
    </div>`;
}

/** Fallback without the full tree: just the chosen talents at their spots. */
function chosenOnly(talents: RioTalent[]): TalentNode[] {
  return talents.map((t) => ({
    id: t.node,
    x: t.x,
    y: t.y,
    type: "single",
    next: [],
    heroTree: 0,
    entries: [{ spell: t.spell, name: t.name, icon: t.icon, passive: false, maxRanks: t.maxRank }],
  }));
}

/**
 * Popup with the class, hero and spec tree side by side on the spec's in-game background.
 * tree: the spec's full trees; undefined while loading, null if unavailable (then only the chosen talents show).
 */
export function renderTalents(p: RioProfile, className: string, tree: TalentTree | null | undefined): string {
  const spec = p.spec ?? "";
  const chosen = new Map(p.talentTree.map((t) => [t.node, t]));
  const of = (t: RioTalent["tree"]) => p.talentTree.filter((x) => x.tree === t);

  // only the hero tree the character picked
  const heroId = tree?.hero.find((n) => chosen.has(n.id))?.heroTree;
  const heroTree = tree?.heroTrees.find((h) => h.id === heroId);
  const emblem = heroTree?.atlas
    ? `<img src="${atlas(heroTree.atlas)}" alt="" class="size-12 drop-shadow-lg" />`
    : "";

  const body =
    tree === undefined
      ? `<div class="py-24 text-center text-sm text-zinc-400">Loading the talent tree…</div>`
      : `<div class="flex flex-wrap items-start justify-center gap-x-12 gap-y-8 px-6 pt-4 pb-8">
          ${treeBox(spaced(className), tree ? tree.class : chosenOnly(of("class")), chosen)}
          ${treeBox(heroTree?.name ?? "Hero", tree ? tree.hero.filter((n) => n.heroTree === heroId) : chosenOnly(of("hero")), chosen, emblem)}
          ${treeBox(spaced(spec), tree ? tree.spec : chosenOnly(of("spec")), chosen)}
        </div>`;

  return `
    <div data-talents-popup class="fixed inset-0 z-40 grid place-items-center bg-black/75 p-4 backdrop-blur-sm">
      <div class="panel relative max-h-full w-full max-w-6xl overflow-auto">
        ${spec ? `<div class="pointer-events-none absolute inset-0 bg-cover bg-center opacity-60" style="background-image:url(${background(className, spec)})"></div>` : ""}
        <div class="pointer-events-none absolute inset-0" style="background:radial-gradient(ellipse at center, transparent 30%, rgb(12 9 7 / .75))"></div>
        <div class="relative">
          <div class="site-header flex items-center gap-3 px-4 py-2">
            ${spec ? img(specIcon(className, spec), "size-7") : ""}
            <span class="font-bold uppercase tracking-[0.14em] text-gold">Talents</span>
            ${p.talents ? `<button type="button" data-copy-talents="${esc(p.talents)}" class="btn ml-auto">Copy import string</button>` : ""}
            <button type="button" data-close-talents class="btn ${p.talents ? "" : "ml-auto"}" aria-label="Close">✕</button>
          </div>
          ${body}
        </div>
      </div>
    </div>`;
}
