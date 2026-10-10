import type { CharacterLog, CharacterResponse, CharacterSection, CharacterZone } from "../../shared/api.ts";
import { compact, date, esc, spaced } from "../format.ts";
import { bossIcon, classColor, classIcon, difficultyName, specIcon, tierColor } from "../wow.ts";
import { renderZoneSummary } from "./character-summary.ts";
import { img, SEP, skeleton } from "./common.ts";

const RAID_COLUMNS = "grid-cols-[2rem_1fr_3rem_3rem_3rem_4.5rem]";
/** M+: key level (with Raider.IO's stars below) instead of the best amount */
const MPLUS_COLUMNS = "grid-cols-[2.25rem_1fr_3.5rem_3rem_3rem_3.5rem]";
const columns = (mythicPlus: boolean) => (mythicPlus ? MPLUS_COLUMNS : RAID_COLUMNS);

/** Raider.IO dungeon names and WCL boss names, compared without case and punctuation. */
export const dungeonKey = (name: string) => name.toLowerCase().replace(/[^a-z]/g, "");

export function renderCharacterHeader(c: CharacterResponse): string {
  const cc = classColor(c.className);
  const region = c.region.toLowerCase();
  const wclUrl = `https://www.warcraftlogs.com/character/${region}/${c.realm.slug}/${c.name.toLowerCase()}`;
  const armoryUrl = `https://worldofwarcraft.blizzard.com/${c.region === "US" ? "en-us" : "en-gb"}/character/${region}/${c.realm.slug}/${c.name.toLowerCase()}`;
  const link = (href: string, label: string) =>
    `<a href="${href}" target="_blank" rel="noreferrer" class="label hover:text-gold">${label} ↗</a>`;
  return `
    <div class="panel relative overflow-hidden">
      <div data-rio-portrait class="pointer-events-none absolute inset-y-0 right-0 w-2/5 bg-cover bg-right-top opacity-0 transition-opacity duration-500"></div>
      <div class="relative flex items-center gap-4 p-4">
      <span data-rio-avatar>${img(classIcon(c.className), "size-14 border-2", undefined, `border-color:${cc}`)}</span>
      <div class="min-w-0 flex-1">
        <div class="flex min-w-0 items-center gap-3">
          <h2 class="truncate text-2xl font-bold" style="color:${cc}">${esc(c.name)}</h2>
          <span data-rio-badge class="shrink-0"></span>
        </div>
        <div class="flex flex-wrap items-center gap-x-2 text-zinc-400">
          ${esc(spaced(c.className))}${SEP}${esc(c.realm.name)} (${c.region})
        </div>
      </div>
      <div class="hidden shrink-0 flex-col items-end gap-1 sm:flex">
        ${link(wclUrl, "Warcraft Logs")}
        ${link(armoryUrl, "Armory")}
      </div>
      </div>
      <div data-rio-gear class="relative"></div>
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
      class="btn ${section === selected ? "btn-on" : ""}">${label}</button>`;
  return `<div class="flex gap-2">${button("raid", "Raid")}${button("mythicPlus", "Mythic+")}</div>`;
}

const parseCell = (v: number | null, classes: string) =>
  `<span class="text-right tabular-nums ${classes}" style="color:${v === null ? "#5a5249" : tierColor(v)}">${v === null ? "–" : Math.floor(v)}</span>`;

export function renderCharacterZone(c: CharacterResponse): string {
  const z = c.zone;
  if (!z) return `<div class="panel p-4 text-sm text-zinc-500">No current zone found.</div>`;
  return `
    <section>
      <h3 class="heading">${esc(z.name)}${z.mythicPlus ? "" : ` (${difficultyName(z.difficulty)})`}</h3>
      ${renderZoneSummary(z)}
      <div class="panel divide-y divide-line">
        ${zoneHeader(z)}
        ${z.bosses.map((b) => bossRow(c, z, b)).join("")}
      </div>
    </section>`;
}

function zoneHeader(z: CharacterZone): string {
  return `
    <div class="grid ${columns(z.mythicPlus)} gap-3 px-3 py-1.5 text-right">
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
      class="grid w-full ${columns(z.mythicPlus)} items-center gap-3 px-3 ${z.mythicPlus ? "py-2" : "py-1.5"} text-left hover:bg-panel-2 disabled:opacity-40 disabled:hover:bg-transparent">
      ${img(bossIcon(b.encounterId), z.mythicPlus ? "size-9" : "size-8")}
      <span class="min-w-0">
        <span class="flex min-w-0 items-center gap-2">
          <span class="truncate text-zinc-100">${esc(b.name)}</span>
          ${b.spec ? img(specIcon(c.className, b.spec), "size-5") : ""}
        </span>
        ${z.mythicPlus ? `<span data-rio-time="${dungeonKey(b.name)}" class="block h-4 truncate text-xs tabular-nums text-zinc-500"></span>` : ""}
      </span>
      ${
        z.mythicPlus
          ? `<span class="flex flex-col items-end leading-tight">
              <span class="font-semibold tabular-nums text-zinc-100">${b.keyLevel ? `+${b.keyLevel}` : "–"}</span>
              <span data-rio-stars="${dungeonKey(b.name)}" data-key-level="${b.keyLevel ?? ""}" class="h-3.5 text-[11px] leading-none"></span>
            </span>`
          : ""
      }
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
          `<div class="grid ${RAID_COLUMNS} items-center gap-3 px-3 py-1.5">${skeleton("size-8")}${skeleton("h-4 w-40")}${skeleton("h-5 w-8 justify-self-end")}${skeleton("h-4 w-8 justify-self-end")}${skeleton("h-4 w-6 justify-self-end")}<span></span></div>`,
      ).join("")}
    </div>
  </section>`;

/** A character's logs on one boss; each row opens the log's analysis. */
export function renderCharacterLogs(logs: CharacterLog[], className: string, mythicPlus: boolean): string {
  if (!logs.length) return `<div class="px-3 py-2 text-sm text-zinc-500">No ranked logs.</div>`;
  const rows = logs.map(
    (l) => `
      <button type="button" data-log="${esc(l.code)}:${l.fight}"
        class="grid w-full ${columns(mythicPlus)} items-center gap-3 px-3 py-1 text-left text-sm hover:bg-panel-2">
        <span></span>
        <span class="flex min-w-0 items-center gap-2 text-zinc-400">
          ${img(specIcon(className, l.spec), "size-4")}
          ${date(l.date)}
          ${mythicPlus ? "" : `<span class="text-zinc-500">${l.bracket} ilvl</span>`}
        </span>
        ${mythicPlus ? `<span class="text-right tabular-nums text-zinc-500">+${l.bracket}</span>` : ""}
        <span class="text-right font-semibold tabular-nums" style="color:${tierColor(l.parse)}">${Math.floor(l.parse)}</span>
        <span></span>${mythicPlus ? "" : "<span></span>"}
        <span class="text-right tabular-nums text-zinc-300">${compact(l.amount)}</span>
      </button>`,
  );
  return `<div class="divide-y divide-line/50">${rows.join("")}</div>`;
}
