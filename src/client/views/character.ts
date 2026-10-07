import type { CharacterLog, CharacterResponse, CharacterSection, CharacterZone } from "../../shared/api.ts";
import { compact, date, esc, spaced } from "../format.ts";
import { bossIcon, classColor, classIcon, difficultyName, specIcon, tierColor } from "../wow.ts";
import { img, skeleton } from "./common.ts";

const COLUMNS = "grid-cols-[2rem_1fr_3rem_3rem_3rem_4.5rem]";

export function renderCharacterHeader(c: CharacterResponse): string {
  const cc = classColor(c.className);
  const wclUrl = `https://www.warcraftlogs.com/character/${c.region.toLowerCase()}/${c.realm.slug}/${c.name.toLowerCase()}`;
  return `
    <div class="panel flex items-center gap-4 p-4">
      ${img(classIcon(c.className), "size-14 border-2", undefined, `border-color:${cc}`)}
      <div class="min-w-0 flex-1">
        <h2 class="truncate text-2xl font-bold" style="color:${cc}">${esc(c.name)}</h2>
        <div class="text-zinc-400">${esc(spaced(c.className))} · ${esc(c.realm.name)} (${c.region})</div>
      </div>
      <a href="${wclUrl}" target="_blank" rel="noreferrer" class="label hidden shrink-0 hover:text-gold sm:block">Open on Warcraft Logs ↗</a>
    </div>`;
}

export const renderCharacterHeaderSkeleton = () => `
  <div class="panel flex items-center gap-4 p-4">
    ${skeleton("size-14")}
    <div class="flex-1 space-y-2">${skeleton("h-6 w-48")}${skeleton("h-4 w-36")}</div>
  </div>`;

/** Raid / Mythic+ switch; only the selected part is loaded. */
export function renderSectionToggle(selected: CharacterSection): string {
  const button = (section: CharacterSection, label: string) =>
    `<button type="button" data-section="${section}"
      class="rounded-sm border px-3 py-1 text-sm transition ${
        section === selected
          ? "border-gold/80 bg-gold/10 text-gold"
          : "border-line text-zinc-300 hover:border-zinc-500"
      }">${label}</button>`;
  return `<div class="flex gap-2">${button("raid", "Raid")}${button("mythicPlus", "Mythic+")}</div>`;
}

const parseCell = (v: number | null, classes: string) =>
  `<span class="text-right tabular-nums ${classes}" style="color:${v === null ? "#52525b" : tierColor(v)}">${v === null ? "–" : Math.floor(v)}</span>`;

export function renderCharacterZone(c: CharacterResponse): string {
  const z = c.zone;
  if (!z) return `<div class="panel p-4 text-sm text-zinc-500">No current zone found.</div>`;
  return `
    <section>
      <h3 class="label mb-2">${esc(z.name)}${z.mythicPlus ? "" : ` · ${difficultyName(z.difficulty)}`}</h3>
      <div class="panel divide-y divide-line">
        ${zoneHeader(z)}
        ${z.bosses.map((b) => bossRow(c, z, b)).join("")}
      </div>
      <p class="mt-3 text-xs text-zinc-500">Best and median parse per boss. Click a boss or dungeon to see the logs.</p>
    </section>`;
}

function zoneHeader(z: CharacterZone): string {
  return `
    <div class="grid ${COLUMNS} gap-3 px-3 py-1.5 text-right">
      <span></span><span class="label text-left">${z.mythicPlus ? "Dungeon" : "Boss"}</span>
      ${z.mythicPlus ? `<span class="label">Key</span>` : ""}
      <span class="label">Best</span><span class="label">Median</span><span class="label">${z.mythicPlus ? "Runs" : "Kills"}</span>
      ${z.mythicPlus ? "" : `<span class="label">Best ${z.bosses.some((b) => b.metric === "hps") ? "HPS" : "DPS"}</span>`}
    </div>`;
}

function bossRow(c: CharacterResponse, z: CharacterZone, b: CharacterZone["bosses"][number]): string {
  const played = b.kills > 0;
  return `
    <button type="button" data-boss="${b.encounterId}" data-metric="${b.metric}" data-difficulty="${z.difficulty}"
      ${played ? "" : "disabled"}
      class="grid w-full ${COLUMNS} items-center gap-3 px-3 py-1.5 text-left hover:bg-panel-2 disabled:opacity-40 disabled:hover:bg-transparent">
      ${img(bossIcon(b.encounterId), "size-8")}
      <span class="flex min-w-0 items-center gap-2">
        <span class="truncate text-zinc-100">${esc(b.name)}</span>
        ${b.spec ? img(specIcon(c.className, b.spec), "size-5") : ""}
      </span>
      ${z.mythicPlus ? `<span class="text-right tabular-nums text-zinc-200">${b.keyLevel ? `+${b.keyLevel}` : "–"}</span>` : ""}
      ${parseCell(played ? b.best : null, "text-lg font-bold")}
      ${parseCell(played ? b.median : null, "")}
      <span class="text-right tabular-nums text-zinc-400">${b.kills}</span>
      ${z.mythicPlus ? "" : `<span class="text-right tabular-nums text-zinc-400">${b.bestAmount ? compact(b.bestAmount) : ""}</span>`}
    </button>
    <div data-logs="${b.encounterId}" class="hidden border-t border-line bg-black/20"></div>`;
}

export const renderCharacterZoneSkeleton = () => `
  <section>
    ${skeleton("mb-2 h-3 w-40")}
    <div class="panel divide-y divide-line">
      ${Array.from(
        { length: 8 },
        () =>
          `<div class="grid ${COLUMNS} items-center gap-3 px-3 py-1.5">${skeleton("size-8")}${skeleton("h-4 w-40")}${skeleton("h-5 w-8 justify-self-end")}${skeleton("h-4 w-8 justify-self-end")}${skeleton("h-4 w-6 justify-self-end")}<span></span></div>`,
      ).join("")}
    </div>
  </section>`;

/** A character's logs on one boss; each row opens the log's analysis. */
export function renderCharacterLogs(logs: CharacterLog[], className: string, mythicPlus: boolean): string {
  if (!logs.length) return `<div class="px-3 py-2 text-sm text-zinc-500">No ranked logs.</div>`;
  const rows = logs.map(
    (l) => `
      <button type="button" data-log="${esc(l.code)}:${l.fight}"
        class="grid w-full ${COLUMNS} items-center gap-3 px-3 py-1 text-left text-sm hover:bg-panel-2">
        <span></span>
        <span class="flex min-w-0 items-center gap-2 text-zinc-400">
          ${img(specIcon(className, l.spec), "size-4")}
          ${date(l.date)}
          <span class="text-zinc-500">${mythicPlus ? `+${l.bracket}` : `${l.bracket} ilvl`}</span>
        </span>
        <span class="text-right font-semibold tabular-nums" style="color:${tierColor(l.parse)}">${Math.floor(l.parse)}</span>
        <span></span><span></span>
        <span class="text-right tabular-nums text-zinc-300">${compact(l.amount)}</span>
      </button>`,
  );
  return `<div class="divide-y divide-line/50">${rows.join("")}</div>`;
}
