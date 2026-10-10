import type {
  FightTalent,
  RioProfile,
  RioTalent,
  TalentNode,
  TalentTree,
  TopTalents,
} from "../../shared/api.ts";
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

/** A taken talent on a node: by spell (Raider.IO) or by talent entry (a fight's data). */
interface Pick {
  rank: number;
  spell?: number;
  entry?: number;
}

/** Comparison extras for a node's shown entry: a badge and a frame color overriding the default. */
type Mark = (
  entry: TalentNode["entries"][number],
  taken: boolean,
) => { badge?: string; frame?: string } | null;

function treeBox(
  title: string,
  nodes: TalentNode[],
  chosen: Map<number, Pick>,
  emblem = "",
  mark?: Mark,
): string {
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
      const entry =
        n.entries.find((e) => (pick?.entry ? e.id === pick.entry : e.spell === pick?.spell)) ?? n.entries[0];
      const rank = pick?.rank ?? 0;
      const full = pick !== undefined && rank >= entry.maxRanks;
      const shape = n.type === "choice" ? "" : entry.passive ? "rounded-full" : "rounded-sm";
      const extra = mark?.(entry, pick !== undefined) ?? null;
      // gold when fully taken, green when partly, dim when not taken
      const frame = extra?.frame ?? (full ? "#e5cc80" : pick ? "#1eff00" : "#5a5249");
      const look = pick ? "" : extra?.frame ? "grayscale opacity-70" : "grayscale opacity-45";
      const clip = n.type === "choice" ? `clip-path:${OCTAGON};` : "";
      return `
        <a href="https://www.wowhead.com/spell=${entry.spell}" data-wowhead="spell=${entry.spell}" target="_blank" rel="noreferrer"
           class="absolute hover:z-10" style="left:${px(n.x, minX)}px;top:${px(n.y, minY)}px">
          <span class="block size-[36px] p-[2px] ${shape} transition hover:brightness-125" style="${clip}background:${frame}">
            <img src="${talentIcon(entry.icon)}" data-fallback="${talentIcon("inv_misc_questionmark")}" alt="" loading="lazy" class="block size-full ${shape} ${look}" style="${clip}" />
          </span>
          ${extra?.badge ? `<span class="absolute -top-1.5 -left-1.5 rounded-sm border border-black bg-black/90 px-1 text-[10px] font-bold leading-tight" style="color:${extra.frame}">${extra.badge}</span>` : ""}
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
    entries: [{ id: 0, spell: t.spell, name: t.name, icon: t.icon, passive: false, maxRanks: t.maxRank }],
  }));
}

/** The popup frame: spec background, a header bar (title, extras on the right, close) and the body. */
function popup(className: string, spec: string, title: string, extras: string, body: string): string {
  return `
    <div data-talents-popup class="fixed inset-0 z-40 grid place-items-center bg-black/75 p-4 backdrop-blur-sm">
      <div class="panel relative max-h-full w-full max-w-6xl overflow-auto">
        ${spec ? `<div class="pointer-events-none absolute inset-0 bg-cover bg-center opacity-60" style="background-image:url(${background(className, spec)})"></div>` : ""}
        <div class="pointer-events-none absolute inset-0" style="background:radial-gradient(ellipse at center, transparent 30%, rgb(12 9 7 / .75))"></div>
        <div class="relative">
          <div class="site-header flex items-center gap-3 px-4 py-2">
            ${spec ? img(specIcon(className, spec), "size-7") : ""}
            <span class="font-bold uppercase tracking-[0.14em] text-gold">${esc(title)}</span>
            <span class="ml-auto"></span>
            ${extras}
            <button type="button" data-close-talents class="btn" aria-label="Close">✕</button>
          </div>
          ${body}
        </div>
      </div>
    </div>`;
}

const LOADING = `<div class="py-24 text-center text-sm text-zinc-400">Loading the talent tree…</div>`;

const heroEmblem = (tree: TalentTree | null | undefined, heroId: number | undefined) => {
  const hero = tree?.heroTrees.find((h) => h.id === heroId);
  return {
    name: hero?.name ?? "Hero",
    emblem: hero?.atlas ? `<img src="${atlas(hero.atlas)}" alt="" class="size-12 drop-shadow-lg" />` : "",
  };
};

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
  const hero = heroEmblem(tree, heroId);

  const body =
    tree === undefined
      ? LOADING
      : `<div class="flex flex-wrap items-start justify-center gap-x-12 gap-y-8 px-6 pt-4 pb-8">
          ${treeBox(spaced(className), tree ? tree.class : chosenOnly(of("class")), chosen)}
          ${treeBox(hero.name, tree ? tree.hero.filter((n) => n.heroTree === heroId) : chosenOnly(of("hero")), chosen, hero.emblem)}
          ${treeBox(spaced(spec), tree ? tree.spec : chosenOnly(of("spec")), chosen)}
        </div>`;
  const copy = p.talents
    ? `<button type="button" data-copy-talents="${esc(p.talents)}" class="btn">Copy import string</button>`
    : "";
  return popup(className, spec, "Talents", copy, body);
}

/** Taken by at least half of the top players or not: red if they do and the player doesn't, amber the other way. */
const MOST = 0.5;
/** Fewer top players with the same hero tree than this: compare with all top 100 instead. */
const MIN_SAME_TREE = 10;

/**
 * A fight's build against the top 100: the same trees, plus how many top players take each talent.
 * Red: popular but not taken. Amber: taken but rare among the top. tree undefined: still loading.
 */
export function renderTalentCompare(
  className: string,
  spec: string,
  picks: FightTalent[],
  top: TopTalents,
  tree: TalentTree | null | undefined,
): string {
  if (tree === undefined) return popup(className, spec, "Talents vs top 100", "", LOADING);
  if (!tree || !picks.length) {
    return popup(
      className,
      spec,
      "Talents vs top 100",
      "",
      `<div class="py-24 text-center text-sm text-zinc-400">No talent data for this fight.</div>`,
    );
  }
  // the fight lists talent entries; the tree is drawn by node
  const nodeOf = new Map(
    [...tree.class, ...tree.spec, ...tree.hero].flatMap((n) => n.entries.map((e) => [e.id, n.id])),
  );
  const chosen = new Map<number, Pick>();
  for (const t of picks) {
    const node = nodeOf.get(t.id);
    if (node !== undefined && t.rank > 0) chosen.set(node, { entry: t.id, rank: t.rank });
  }
  const heroId = tree.hero.find((n) => chosen.has(n.id))?.heroTree;
  const hero = heroEmblem(tree, heroId);
  // compared with the top players of the same hero tree (their builds differ), if there are enough of them
  const sameTree = heroId ? top.byHeroTree[heroId] : undefined;
  const group = sameTree && sameTree.players >= MIN_SAME_TREE ? sameTree : null;
  const share = (group ?? top).share;
  const title = group ? `Talents vs top ${group.players} ${hero.name}` : "Talents vs top 100";

  const mark: Mark = (entry, taken) => {
    const rate = share[entry.id] ?? 0;
    const percent = `${Math.round(rate * 100)}%`;
    if (!taken && rate >= MOST) return { badge: percent, frame: "#ef4444" };
    if (taken && rate < MOST) return { badge: percent, frame: "#f59e0b" };
    return null;
  };
  // an untaken choice node shows the option the top players pick most
  const popularFirst = (nodes: TalentNode[]) =>
    nodes.map((n) =>
      chosen.has(n.id) || n.entries.length < 2
        ? n
        : { ...n, entries: [...n.entries].sort((a, b) => (share[b.id] ?? 0) - (share[a.id] ?? 0)) },
    );

  const legend = `
    <span class="flex items-center gap-1.5 text-xs text-zinc-400"><span class="size-2.5 rounded-sm bg-[#ef4444]"></span>Most take, not taken</span>
    <span class="flex items-center gap-1.5 text-xs text-zinc-400"><span class="size-2.5 rounded-sm bg-[#f59e0b]"></span>Taken, most don't</span>`;
  // hero talents: no marks, everyone takes them all
  const body = `<div class="flex flex-wrap items-start justify-center gap-x-12 gap-y-8 px-6 pt-4 pb-8">
      ${treeBox(spaced(className), popularFirst(tree.class), chosen, "", mark)}
      ${treeBox(
        hero.name,
        tree.hero.filter((n) => n.heroTree === heroId),
        chosen,
        hero.emblem,
      )}
      ${treeBox(spaced(spec), popularFirst(tree.spec), chosen, "", mark)}
    </div>`;
  return popup(className, spec, title, legend, body);
}
