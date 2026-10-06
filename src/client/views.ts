import type {
  CharacterLog,
  CharacterResponse,
  Fight,
  HeroTree,
  Player,
  ReportResponse,
  Role,
} from "../shared/api.ts";
import type { Curve } from "./curve.ts";
import { compact, duration, esc, fmt, spaced } from "./format.ts";
import { DEMO_CODE } from "./report-input.ts";
import {
  bossIcon,
  classColor,
  classIcon,
  difficultyName,
  specIcon,
  TIERS,
  talentIcon,
  tierColor,
  zoneIcon,
} from "./wow.ts";

const img = (src: string, cls: string, fallback?: string, style = "") =>
  `<img src="${src}" alt="" loading="lazy" class="icon ${cls}"${fallback ? ` data-fallback="${fallback}"` : ""}${style ? ` style="${style}"` : ""} />`;

export function renderReportHeader(code: string, report: ReportResponse): string {
  const zone = report.zone;
  return `
    <div class="panel flex items-center gap-4 p-4">
      ${zone ? img(zoneIcon(zone.id), "size-14") : ""}
      <div class="min-w-0 flex-1">
        <h2 class="truncate text-2xl font-bold text-zinc-100">${esc(report.title)}</h2>
        ${zone && zone.name !== report.title ? `<div class="text-zinc-400">${esc(zone.name)}</div>` : ""}
      </div>
      ${
        code === DEMO_CODE
          ? `<span class="label shrink-0 rounded-sm border border-gold/40 px-2 py-1 text-gold">Demo data</span>`
          : `<a href="https://www.warcraftlogs.com/reports/${esc(code)}" target="_blank" rel="noreferrer"
               class="label hidden shrink-0 hover:text-gold sm:block">Open on Warcraft Logs ↗</a>`
      }
    </div>`;
}

export function renderFights(fights: Fight[], zoneId: number | undefined, selected: number | null): string {
  const cards = fights.map((f) => {
    const on = f.id === selected;
    const mode = f.keystoneLevel ? `+${f.keystoneLevel}` : difficultyName(f.difficulty);
    return `
      <button type="button" data-fight="${f.id}"
        class="flex items-center gap-3 rounded-md border p-2 pr-3 text-left transition ${
          on
            ? "border-gold/80 bg-gold/10 ring-1 ring-gold/40"
            : "border-line bg-panel hover:border-zinc-500 hover:bg-panel-2"
        }">
        ${img(bossIcon(f.encounterID), "size-10", zoneId ? zoneIcon(zoneId) : undefined)}
        <div class="min-w-0">
          <div class="truncate font-semibold text-zinc-100">${esc(f.name)}</div>
          <div class="text-xs text-zinc-400">
            <span class="${f.kill ? "text-emerald-400" : "text-red-400"}">${f.kill ? "Kill" : "Wipe"}</span>
            · ${mode} · ${duration(f.duration)}
          </div>
        </div>
      </button>`;
  });
  return `
    <section>
      <h3 class="label mb-2">1 · Choose a fight</h3>
      <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">${cards.join("")}</div>
    </section>`;
}

const ROLE_GROUPS: [Role, string][] = [
  ["tank", "Tanks"],
  ["healer", "Healers"],
  ["dps", "Damage"],
];

/** byKeyLevel: show the key level parse (M+). */
export function renderPlayers(players: Player[], selected: string | null, byKeyLevel: boolean): string {
  const shown = (p: Player) => (byKeyLevel ? (p.bracketParse ?? p.parse) : p.parse);
  const groups = ROLE_GROUPS.map(([role, title]) => {
    const list = players.filter((p) => p.role === role).sort((a, b) => b.amount - a.amount);
    if (!list.length) return "";
    const cards = list.map((p) => {
      const cc = classColor(p.cls);
      const on = p.name === selected;
      return `
        <button type="button" data-player="${esc(p.name)}"
          class="flex w-full items-center gap-3 rounded-md border p-2 pr-3 text-left transition ${
            on
              ? "border-gold/80 bg-gold/10 ring-1 ring-gold/40"
              : "border-line bg-panel hover:border-zinc-500 hover:bg-panel-2"
          }">
          ${img(specIcon(p.cls, p.spec), "size-10", undefined, `border-color:${cc}`)}
          <div class="min-w-0 flex-1">
            <div class="truncate font-semibold" style="color:${cc}">${esc(p.name)}</div>
            <div class="truncate text-xs text-zinc-500">${esc(spaced(p.spec))} · ${compact(p.amount)} ${p.metric.toUpperCase()}</div>
          </div>
          <div class="text-2xl font-bold tabular-nums" style="color:${tierColor(shown(p))}">${Math.floor(shown(p))}</div>
        </button>`;
    });
    return `<div><div class="label mb-2">${title}</div><div class="space-y-2">${cards.join("")}</div></div>`;
  });
  return `
    <section>
      <h3 class="label mb-2">2 · Pick a player</h3>
      <div class="panel grid gap-5 p-4 md:grid-cols-3">${groups.join("")}</div>
    </section>`;
}

export function renderAnalysisLoading(p: Player): string {
  return `
    <section class="panel flex items-center gap-4 p-5">
      ${img(specIcon(p.cls, p.spec), "size-12 animate-pulse")}
      <div class="text-zinc-400">Fetching the ${esc(spaced(p.spec))} ${esc(spaced(p.cls))} leaderboard…</div>
    </section>`;
}

/** e.g. { label: "+18 parse", parse: 19 } */
export interface LabeledParse {
  label: string;
  parse: number;
}

/** A hero tree with its share among the sampled leaderboard entries (0-1). */
export interface TreeOption extends HeroTree {
  share: number;
}

function renderTreeToggle(trees: TreeOption[], selected: number | null): string {
  if (!trees.some((t) => t.share > 0)) return "";
  const button = (id: number | null, label: string, share?: number, icon?: string | null) => {
    const on = id === selected;
    const empty = share === 0;
    return `<button type="button" data-tree="${id ?? ""}" ${empty ? "disabled" : ""}
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

/** main: the parse the curve is built for. selectedTree: hero tree the curve is limited to. */
export function renderAnalysis(
  p: Player,
  curve: Curve,
  main: LabeledParse,
  trees: TreeOption[],
  selectedTree: number | null,
): string {
  const cc = classColor(p.cls);
  const metric = p.metric.toUpperCase();
  // the log's parse; the curve is pinned to it
  const current = Math.floor(main.parse);
  const color = tierColor(current);

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
      <div class="flex flex-wrap items-center gap-4 border-b border-line p-5"
           style="background:linear-gradient(90deg, ${cc}26, transparent 65%)">
        ${img(specIcon(p.cls, p.spec), "size-16 border-2", undefined, `border-color:${cc}`)}
        <div class="min-w-0">
          <div class="font-display text-3xl font-bold" style="color:${cc}">${esc(p.name)}</div>
          <div class="text-zinc-400">${esc(spaced(p.spec))} ${esc(spaced(p.cls))} · <span class="text-zinc-200">${fmt(p.amount)}</span> ${metric}</div>
        </div>
        <div class="ml-auto text-right">
          <div><div class="label">${esc(main.label)}</div>
            <div class="text-5xl font-bold tabular-nums leading-none" style="color:${color}">${current}</div></div>
        </div>
      </div>
      ${renderTreeToggle(trees, selectedTree)}
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

// ---------- characters ----------

const parseCell = (v: number | null, cls: string) =>
  `<span class="text-right tabular-nums ${cls}" style="color:${v === null ? "#52525b" : tierColor(v)}">${v === null ? "–" : Math.floor(v)}</span>`;

export function renderCharacter(c: CharacterResponse): string {
  const cc = classColor(c.cls);
  const wclUrl = `https://www.warcraftlogs.com/character/${c.region.toLowerCase()}/${c.realm.slug}/${c.name.toLowerCase()}`;
  const zones = c.zones.map((z) => {
    const rows = z.bosses.map((b) => {
      const played = b.kills > 0;
      return `
        <button type="button" data-boss="${b.encounterID}" data-metric="${b.metric}" data-diff="${z.difficulty}"
          ${played ? "" : "disabled"}
          class="grid w-full grid-cols-[2rem_1fr_3rem_3rem_3rem_4.5rem] items-center gap-3 px-3 py-1.5 text-left hover:bg-panel-2 disabled:opacity-40 disabled:hover:bg-transparent">
          ${img(bossIcon(b.encounterID), "size-8")}
          <span class="flex min-w-0 items-center gap-2">
            <span class="truncate text-zinc-100">${esc(b.name)}</span>
            ${b.spec ? img(specIcon(c.cls, b.spec.replace(/\s+/g, "")), "size-5") : ""}
          </span>
          ${z.mythicPlus ? `<span class="text-right tabular-nums text-zinc-200">${b.keyLevel ? `+${b.keyLevel}` : "–"}</span>` : ""}
          ${parseCell(played ? b.best : null, "text-lg font-bold")}
          ${parseCell(played ? b.median : null, "")}
          <span class="text-right tabular-nums text-zinc-400">${b.kills}</span>
          ${z.mythicPlus ? "" : `<span class="text-right tabular-nums text-zinc-400">${b.bestAmount ? compact(b.bestAmount) : ""}</span>`}
        </button>
        <div data-logs="${b.encounterID}" class="hidden border-t border-line bg-black/20"></div>`;
    });
    return `
      <section>
        <h3 class="label mb-2">${esc(z.name)}${z.mythicPlus ? " · parses at the highest key" : ` · ${difficultyName(z.difficulty)}`}</h3>
        <div class="panel divide-y divide-line">
          <div class="grid grid-cols-[2rem_1fr_3rem_3rem_3rem_4.5rem] gap-3 px-3 py-1.5 text-right">
            <span></span><span class="label text-left">${z.mythicPlus ? "Dungeon" : "Boss"}</span>
            ${z.mythicPlus ? `<span class="label">Key</span>` : ""}
            <span class="label">Best</span><span class="label">Median</span><span class="label">${z.mythicPlus ? "Runs" : "Kills"}</span>
            ${z.mythicPlus ? "" : `<span class="label">Best ${z.bosses.some((b) => b.metric === "hps") ? "HPS" : "DPS"}</span>`}
          </div>
          ${rows.join("")}
        </div>
      </section>`;
  });
  return `
    <div class="space-y-6">
      <div class="panel flex items-center gap-4 p-4">
        ${img(classIcon(c.cls), "size-14 border-2", undefined, `border-color:${cc}`)}
        <div class="min-w-0 flex-1">
          <h2 class="truncate text-2xl font-bold" style="color:${cc}">${esc(c.name)}</h2>
          <div class="text-zinc-400">${esc(spaced(c.cls))} · ${esc(c.realm.name)} (${c.region})</div>
        </div>
        <a href="${wclUrl}" target="_blank" rel="noreferrer" class="label hidden shrink-0 hover:text-gold sm:block">Open on Warcraft Logs ↗</a>
      </div>
      ${zones.join("")}
      <p class="text-xs text-zinc-500">Best and median parse per boss. Click a boss to see the logs, then a log to open it on the curve.</p>
    </div>`;
}

/** A character's logs on one boss; each row opens the log's analysis. */
export function renderCharacterLogs(logs: CharacterLog[], cls: string, mythicPlus: boolean): string {
  if (!logs.length) return `<div class="px-3 py-2 text-sm text-zinc-500">No ranked logs.</div>`;
  const rows = logs.map(
    (l) => `
      <button type="button" data-log="${esc(l.code)}:${l.fight}"
        class="grid w-full grid-cols-[2rem_1fr_3rem_3rem_3rem_4.5rem] items-center gap-3 px-3 py-1 text-left text-sm hover:bg-panel-2">
        <span></span>
        <span class="flex min-w-0 items-center gap-2 text-zinc-400">
          ${img(specIcon(cls, l.spec.replace(/\s+/g, "")), "size-4")}
          ${new Date(l.date).toLocaleDateString()}
          <span class="text-zinc-500">${mythicPlus ? `+${l.bracket}` : `${l.bracket} ilvl`}</span>
        </span>
        <span class="text-right font-semibold tabular-nums" style="color:${tierColor(l.parse)}">${Math.floor(l.parse)}</span>
        <span></span><span></span>
        <span class="text-right tabular-nums text-zinc-300">${compact(l.amount)}</span>
      </button>`,
  );
  return `<div class="divide-y divide-line/50">${rows.join("")}</div>`;
}
