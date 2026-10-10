import type { CurveMetric, HeroTree, Player } from "../../shared/api.ts";
import type { Curve } from "../curve.ts";
import { compact, esc, fmt, metricLabel, spaced } from "../format.ts";
import type { Rank } from "../rank.ts";
import { classColor, specIcon, TIERS, talentIcon, tierColor, tierMetal } from "../wow.ts";
import { img, SEP, skeleton } from "./common.ts";
import { renderGroup } from "./group.ts";

/** The parse a curve is built for, e.g. { label: "+18 parse", parse: 19, amount: 512000, metric: "dps" } */
export interface LabeledParse {
  label: string;
  parse: number;
  /** the player's amount in `metric` */
  amount: number;
  metric: CurveMetric;
}

/** A hero tree with its share among the sampled leaderboard entries (0-1). */
interface TreeOption extends HeroTree {
  share: number;
}

const rankLine = (r: Rank) =>
  `<div class="mt-1 text-sm tabular-nums text-zinc-300">${r.rankApprox ? "~" : ""}#${fmt(r.rank)}
    <span class="text-zinc-500">of ${r.totalKind === "approx" ? "~" : ""}${fmt(r.total)}${r.totalKind === "atLeast" ? "+" : ""}</span></div>`;

/** Header with name, spec and the log's parse. rank undefined: still loading. */
function header(p: Player, main: LabeledParse, rank: Rank | null | undefined): string {
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
        <div class="text-zinc-400">${esc(spaced(p.spec))} ${esc(spaced(p.className))}${p.realm ? `${SEP}${esc(p.realm)}` : ""}${SEP}<span class="text-zinc-200">${fmt(main.amount)}</span> ${metricLabel(main.metric)}${p.run?.itemLevel ? `${SEP}ilvl ${p.run.itemLevel}` : ""}</div>
      </div>
      <div class="ml-auto text-right">
        <div class="label">${esc(main.label)}</div>
        <div class="text-5xl font-bold tabular-nums leading-none ${tierMetal(current)}" style="color:${color}">${current}</div>
        ${rank ? rankLine(rank) : rank === undefined ? skeleton("mt-1 ml-auto h-5 w-24") : ""}
      </div>
    </div>`;
}

function treeToggle(trees: TreeOption[], selected: number | null): string {
  if (!trees.some((t) => t.share > 0)) return "";
  const button = (id: number | null, label: string, share?: number, icon?: string | null) => {
    const on = id === selected;
    return `<button type="button" data-tree="${id ?? ""}" ${share === 0 ? "disabled" : ""}
      class="btn ${on ? "btn-on" : ""} disabled:cursor-not-allowed disabled:opacity-40">
      ${icon ? img(talentIcon(icon), "size-5") : ""}${esc(label)}${share === undefined ? "" : ` <span class="text-zinc-500">${Math.round(share * 100)}%</span>`}
    </button>`;
  };
  return `
    <div class="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
      <span class="label mr-1">Hero tree</span>
      ${button(null, "All")}
      ${trees.map((t) => button(t.id, t.name, t.share, t.icon)).join("")}
    </div>`;
}

/** Curve metric switch; the player's own metric first. Empty without options. */
function metricToggle(metrics: CurveMetric[], own: CurveMetric, selected: CurveMetric): string {
  if (metrics.length < 2) return "";
  const button = (m: CurveMetric) =>
    `<button type="button" data-metric="${m === own ? "" : m}" class="btn ${m === selected ? "btn-on" : ""}">${metricLabel(m)}</button>`;
  return `
    <div class="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
      <span class="label mr-1">Curve</span>
      ${[own, ...metrics.filter((m) => m !== own)].map(button).join("")}
    </div>`;
}

/** Same layout as the analysis: chart and targets as placeholders until the leaderboard is in. */
export function renderAnalysisLoading(p: Player, main: LabeledParse, rank: Rank | undefined): string {
  return `
    <section class="panel overflow-hidden">
      ${header(p, main, rank)}
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
  rank: Rank,
  trees: TreeOption[],
  selectedTree: number | null,
  /** curve metrics on offer; fewer than 2: no switch */
  metrics: CurveMetric[],
  /** everyone in the fight, for the group comparison (M+) */
  group: Player[],
): string {
  // the log's parse; the curve is pinned to it
  const current = Math.floor(main.parse);

  const target = (parse: number, label: string, color: string) => {
    const need = curve.amountAt(parse);
    const diff = need - main.amount;
    return `
      <li class="flex items-center gap-3 py-2">
        <span class="size-2.5 shrink-0 rounded-full" style="background:${color}"></span>
        <span class="flex-1 text-zinc-300">${label}</span>
        <span class="text-right tabular-nums">
          <span class="font-semibold text-zinc-100">${compact(need)}</span>
          <span class="block text-xs text-zinc-500">+${compact(diff)} (+${((diff / main.amount) * 100).toFixed(1)}%)</span>
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
    ? `Among ${esc(tree.name)} players only, estimated.`
    : curve.exactRanks >= curve.total
      ? `All ${fmt(curve.total)} parses.`
      : `Top ${fmt(curve.exactRanks)} of ${fmt(curve.total)}, data below is estimated.`;

  return `
    <section class="panel overflow-hidden">
      ${header(p, main, rank)}
      ${metricToggle(metrics, p.metric, main.metric)}
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
      ${renderGroup(group, p.name)}
      <p class="border-t border-line px-5 py-3 text-xs text-zinc-500">${note}</p>
    </section>`;
}
