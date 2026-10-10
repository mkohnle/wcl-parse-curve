import type { Fight, Player, ReportResponse, Role } from "../../shared/api.ts";
import { compact, date, duration, esc, spaced } from "../format.ts";
import { runTags, type Tag } from "../run-tags.ts";
import { DEMO_CODE } from "../search-input.ts";
import { bossIcon, classColor, difficultyName, specIcon, tierColor, tierMetal, zoneIcon } from "../wow.ts";
import { img, SEP, skeleton } from "./common.ts";

export function renderReportHeader(code: string, report: ReportResponse): string {
  const zone = report.zone;
  return `
    <div class="panel flex items-center gap-4 p-4">
      ${zone ? img(zoneIcon(zone.id), "size-14") : ""}
      <div class="min-w-0 flex-1">
        <h2 class="truncate text-2xl font-bold text-zinc-100">${esc(report.title)}</h2>
        <div class="text-zinc-400">${zone && zone.name !== report.title ? `${esc(zone.name)}${SEP}` : ""}${date(report.startTime)}</div>
      </div>
      ${
        code === DEMO_CODE
          ? `<span class="label shrink-0 rounded-sm border border-gold/40 px-2 py-1 text-gold">Demo data</span>`
          : `<a href="https://www.warcraftlogs.com/reports/${esc(code)}" target="_blank" rel="noreferrer"
               class="label hidden shrink-0 hover:text-gold sm:block">Open on Warcraft Logs ↗</a>`
      }
    </div>`;
}

export const renderReportHeaderSkeleton = () => `
  <div class="panel flex items-center gap-4 p-4">
    ${skeleton("size-14")}
    <div class="flex-1 space-y-2">${skeleton("h-6 w-64")}${skeleton("h-4 w-40")}</div>
  </div>`;

export function renderFights(fights: Fight[], zoneId: number | undefined, selected: number | null): string {
  const cards = fights.map((f) => {
    const on = f.id === selected;
    const mode = f.keystoneLevel ? `+${f.keystoneLevel}` : difficultyName(f.difficulty);
    const [result, color] = !f.kill
      ? [f.keystoneLevel ? "Incomplete" : "Wipe", "text-red-400"]
      : !f.keystoneLevel
        ? ["Kill", "text-emerald-400"]
        : f.keystoneBonus
          ? [`Timed +${f.keystoneBonus}`, "text-emerald-400"]
          : ["Depleted", "text-amber-400"];
    return `
      <button type="button" data-fight="${f.id}"
        class="flex items-center gap-3 rounded-md border p-2 pr-3 text-left transition ${
          on
            ? "border-gold/80 bg-gold/10 ring-1 ring-gold/40"
            : "border-line bg-panel hover:border-zinc-500 hover:bg-panel-2"
        }">
        ${img(bossIcon(f.encounterId), "size-10", zoneId ? zoneIcon(zoneId) : undefined)}
        <div class="min-w-0">
          <div class="truncate font-semibold text-zinc-100">${esc(f.name)}</div>
          <div class="text-xs text-zinc-400">
            <span class="${color}">${result}</span>
            ${SEP}${mode}${SEP}${duration(f.duration)}
          </div>
        </div>
      </button>`;
  });
  return section("Fights", `<div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">${cards.join("")}</div>`);
}

export const renderFightsSkeleton = () =>
  section(
    "Fights",
    `<div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">${Array.from(
      { length: 3 },
      () =>
        `<div class="panel flex items-center gap-3 p-2">${skeleton("size-10")}<div class="flex-1 space-y-1.5">${skeleton("h-4 w-32")}${skeleton("h-3 w-24")}</div></div>`,
    ).join("")}</div>`,
  );

const ROLE_GROUPS: [Role, string][] = [
  ["tank", "Tanks"],
  ["healer", "Healers"],
  ["dps", "Damage"],
];

const badge = (t: Tag) =>
  `<span title="${t.title}" class="shrink-0 rounded-sm px-1 text-[10px] font-bold uppercase ${t.classes}">${t.label}</span>`;

/** byKeyLevel: show the key level parse (M+). */
export function renderPlayers(
  players: Player[],
  unranked: number,
  selected: string | null,
  byKeyLevel: boolean,
): string {
  const shown = (p: Player) => (byKeyLevel ? (p.bracketParse ?? p.parse) : p.parse);

  // M+ only: deaths and kicks come with the fight
  const tags = runTags(players, shown);

  const groups = ROLE_GROUPS.map(([role, title]) => {
    const list = players.filter((p) => p.role === role).sort((a, b) => b.amount - a.amount);
    if (!list.length) return "";
    const cards = list.map((p) => {
      const cc = classColor(p.className);
      const on = p.name === selected;
      const parse = Math.floor(shown(p));
      const mvp = tags.get(p.name)?.some((t) => t.label === "MVP");
      return `
        <button type="button" data-player="${esc(p.name)}"
          class="flex w-full items-center gap-3 rounded-md border p-2 pr-3 text-left transition ${
            on
              ? "border-gold/80 bg-gold/10 ring-1 ring-gold/40"
              : "border-line bg-panel hover:border-zinc-500 hover:bg-panel-2"
          } ${mvp ? "border-t-2 border-t-gold" : ""}">
          ${img(specIcon(p.className, p.spec), "size-10 border-2", undefined, `border-color:${tierColor(parse)}`)}
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-1">
              <span class="mr-0.5 truncate font-semibold" style="color:${cc}">${esc(p.name)}</span>
              ${(tags.get(p.name) ?? []).map(badge).join("")}
            </div>
            <div class="truncate text-xs text-zinc-500">${esc(spaced(p.spec))}${SEP}<span class="font-semibold text-zinc-200">${compact(p.amount)} ${p.metric.toUpperCase()}</span></div>
          </div>
          <div class="text-2xl font-bold tabular-nums ${tierMetal(parse)}" style="color:${tierColor(parse)}">${parse}</div>
        </button>`;
    });
    return `<div><div class="group-bar">${title}</div><div class="space-y-2">${cards.join("")}</div></div>`;
  });
  return section(
    "Players",
    `<div class="panel grid gap-5 p-4 md:grid-cols-3">${groups.join("")}</div>${
      unranked
        ? `<p class="mt-2 text-xs text-zinc-500">${unranked === 1 ? "1 player isn't" : `${unranked} players aren't`} ranked by Warcraftlogs.</p>`
        : ""
    }`,
  );
}

export const renderPlayersSkeleton = () =>
  section(
    "Players",
    `<div class="panel grid gap-5 p-4 md:grid-cols-3">${ROLE_GROUPS.map(
      () =>
        `<div class="space-y-2">${skeleton("h-3 w-16")}${Array.from({ length: 3 }, () => skeleton("h-14 w-full")).join("")}</div>`,
    ).join("")}</div>`,
  );

const section = (title: string, body: string) => `
  <section>
    <h3 class="heading">${title}</h3>
    ${body}
  </section>`;
