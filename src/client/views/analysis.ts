import type { HeroTree, Player } from "../../shared/api.ts";
import type { Curve } from "../curve.ts";
import { compact, esc, fmt, spaced } from "../format.ts";
import { classColor, specIcon, TIERS, talentIcon, tierColor } from "../wow.ts";
import { img, skeleton } from "./common.ts";

/** e.g. { label: "+18 parse", parse: 19 } */
export interface LabeledParse {
  label: string;
  parse: number;
}

/** A hero tree with its share among the sampled leaderboard entries (0-1). */
interface TreeOption extends HeroTree {
  share: number;
}

/** Header with name, spec and the log's parse: known before the leaderboard arrives. */
function header(p: Player, main: LabeledParse): string {
  const cc = classColor(p.className);
  const current = Math.floor(main.parse);
  const color = tierColor(current);
  const name =
    p.realm && (p.region === "EU" || p.region === "US")
      ? `<button type="button" data-character title="Open character page"
           class="font-display text-3xl font-bold hover:brightness-125" style="color:${cc}">${esc(p.name)}</button>`
      : `<div class="font-display text-3xl font-bold" style="color:${cc}">${esc(p.name)}</div>`;
  return `
    <div class="flex flex-wrap items-center gap-4 border-b border-line p-5"
         style="background:linear-gradient(90deg, ${cc}26, transparent 65%)">
      ${img(specIcon(p.className, p.spec), "size-16 border-2", undefined, `border-color:${cc}`)}
      <div class="min-w-0">
        ${name}
        <div class="text-zinc-400">${esc(spaced(p.spec))} ${esc(spaced(p.className))}${p.realm ? ` · ${esc(p.realm)}` : ""} · <span class="text-zinc-200">${fmt(p.amount)}</span> ${p.metric.toUpperCase()}</div>
      </div>
      <div class="ml-auto text-right">
        <div class="label">${esc(main.label)}</div>
        <div class="text-5xl font-bold tabular-nums leading-none" style="color:${color}">${current}</div>
      </div>
    </div>`;
}

function treeToggle(trees: TreeOption[], selected: number | null): string {
  if (!trees.some((t) => t.share > 0)) return "";
  const button = (id: number | null, label: string, share?: number, icon?: string | null) => {
    const on = id === selected;
    return `<button type="button" data-tree="${id ?? ""}" ${share === 0 ? "disabled" : ""}
      class="flex items-center gap-1.5 rounded-sm border px-3 py-1 text-sm transition ${
        on ? "border-gold/80 bg-gold/10 text-gold" : "border-line text-zinc-300 hover:border-zinc-500"
      } disabled:cursor-not-allowed disabled:opacity-40">
      ${icon ? img(talentIcon(icon), "size-5") : ""}${esc(label)}${share === undefined ? "" : ` <span class="text-zinc-500">${Math.round(share * 100)}%</span>`}
    </button>`;
  };
  return `
    <div class="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
      <span class="label mr-1" title="Share among the sampled top of the leaderboard">Hero tree</span>
      ${button(null, "All")}
      ${trees.map((t) => button(t.id, t.name, t.share, t.icon)).join("")}
    </div>`;
}

/** Same layout as the analysis: chart and targets as placeholders until the leaderboard is in. */
export function renderAnalysisLoading(p: Player, main: LabeledParse): string {
  return `
    <section class="panel overflow-hidden">
      ${header(p, main)}
      <div class="grid lg:grid-cols-[1fr_290px]">
        <div class="p-5">
          <div class="flex aspect-[900/340] w-full items-center justify-center rounded-sm bg-panel-2/60 text-sm text-zinc-500 animate-pulse">
            Loading the ${esc(spaced(p.spec))} ${esc(spaced(p.className))} leaderboard…
          </div>
        </div>
        <aside class="space-y-3 border-t border-line p-5 lg:border-t-0 lg:border-l">
          ${skeleton("h-3 w-16")}
          ${Array.from({ length: 4 }, () => skeleton("h-9 w-full")).join("")}
        </aside>
      </div>
    </section>`;
}

/** main: the parse the curve is built for. selectedTree: hero tree the curve is limited to. */
export function renderAnalysis(
  p: Player,
  curve: Curve,
  main: LabeledParse,
  trees: TreeOption[],
  selectedTree: number | null,
): string {
  // the log's parse; the curve is pinned to it
  const current = Math.floor(main.parse);

  const target = (parse: number, label: string, color: string) => {
    const need = curve.amountAt(parse);
    const diff = need - p.amount;
    return `
      <li class="flex items-center gap-3 py-2">
        <span class="size-2.5 shrink-0 rounded-full" style="background:${color}"></span>
        <span class="flex-1 text-zinc-300">${label}</span>
        <span class="text-right tabular-nums">
          <span class="font-semibold text-zinc-100">${compact(need)}</span>
          <span class="block text-xs text-zinc-500">+${compact(diff)} (+${((diff / p.amount) * 100).toFixed(1)}%)</span>
        </span>
      </li>`;
  };
  const targets = [
    ...(current < 100 ? [target(current + 1, `Next point (${current + 1})`, tierColor(current + 1))] : []),
    ...TIERS.filter((t) => t.min > current + 1)
      .reverse()
      .map((t) => target(t.min, `${t.name} (${t.min})`, t.color)),
  ];

  const stat = (label: string, value: string) =>
    `<div><div class="label">${label}</div><div class="text-lg font-semibold tabular-nums text-zinc-100">${value}</div></div>`;

  const tree = trees.find((t) => t.id === selectedTree);
  const note = tree
    ? `Ranked only among ${esc(tree.name)} players. Their share below the sampled top of the leaderboard is estimated, so this is not a Warcraft Logs number.`
    : curve.exactRanks >= curve.total
      ? `Based on the complete leaderboard of ${fmt(curve.total)} parses.`
      : `The top ${fmt(curve.exactRanks)} of ${fmt(curve.total)} parses are real leaderboard data. Below that the curve is estimated and passes through this player's log parse.`;

  return `
    <section class="panel overflow-hidden">
      ${header(p, main)}
      ${treeToggle(trees, selectedTree)}
      <div class="grid lg:grid-cols-[1fr_290px]">
        <div class="p-5">
          <div id="chart" class="relative"></div>
          <div class="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-500">
            <span><span class="mr-1 inline-block h-2 w-3 rounded-sm bg-zinc-400/90 align-middle"></span>Leaderboard data</span>
            <span><span class="mr-1 inline-block h-2 w-3 rounded-sm bg-zinc-400/35 align-middle"></span>Estimated</span>
            <span><span class="mr-1 inline-block w-4 border-t-2 border-dashed border-white/70 align-middle"></span>Normal fit</span>
          </div>
        </div>
        <aside class="space-y-5 border-t border-line p-5 lg:border-t-0 lg:border-l">
          <div>
            <div class="label mb-1">To reach</div>
            ${targets.length ? `<ul class="divide-y divide-line">${targets.join("")}</ul>` : `<div class="py-2 text-gold">Already the best. 👑</div>`}
          </div>
          <div class="grid grid-cols-3 gap-3 border-t border-line pt-4">
            ${stat("Parses", compact(curve.total))}
            ${stat("Median", compact(curve.amountAt(50)))}
            ${stat("#1", compact(curve.amountAtRank(1)))}
          </div>
        </aside>
      </div>
      <p class="border-t border-line px-5 py-3 text-xs text-zinc-500">${note}</p>
    </section>`;
}
