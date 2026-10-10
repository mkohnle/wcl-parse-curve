import type { RioItem, RioProfile, RioRun, RioTalent } from "../../shared/api.ts";
import { duration, esc, fmt, spaced } from "../format.ts";
import { talentIcon } from "../wow.ts";
import { itemTooltip } from "../wowhead.ts";
import { img } from "./common.ts";

/** Small tinted pill after the class and realm; the realm rank on hover. */
export function renderRioBadge(p: RioProfile, className: string, realmName: string): string {
  const rank = p.ranks?.class.realm;
  const title = `Raider.IO M+ score${rank ? ` · #${fmt(rank)} ${spaced(className)} on ${realmName}` : ""}`;
  return `
    <a href="${esc(p.url)}" target="_blank" rel="noreferrer" title="${esc(title)}"
       class="inline-flex items-baseline gap-1.5 rounded-sm border px-1.5 py-px leading-snug hover:brightness-125"
       style="border-color:${p.color}66;background:${p.color}14">
      <span class="text-[10px] font-bold uppercase tracking-wider text-zinc-400">M+</span>
      <span class="text-sm font-bold tabular-nums" style="color:${p.color}">${Math.round(p.score)}</span>
    </a>`;
}

/** Gold stars for the upgrades of a timed run, under the key level. */
export const renderRioStars = (r: RioRun) =>
  r.upgrades
    ? `<span class="text-gold" title="Timed, +${r.upgrades}">${"★".repeat(r.upgrades)}</span>`
    : `<span class="text-zinc-600" title="Depleted">–</span>`;

/** Second line under the dungeon name: the run's time against the timer; names the key if it's a different one. */
export function renderRioTime(r: RioRun, sameKey: boolean): string {
  const time = `<span class="${r.upgrades ? "text-emerald-400" : "text-red-400/80"}">${duration(r.time)}</span> / ${duration(r.par)}`;
  return sameKey
    ? time
    : `Raider.IO best: <span class="text-zinc-300">+${r.level}</span> ${renderRioStars(r)} ${time}`;
}

/** WoW item quality colors. */
const QUALITY = ["#9d9d9d", "#ffffff", "#1eff00", "#0070dd", "#a335ee", "#ff8000", "#e6cc80", "#00ccff"];

export const renderRioAvatar = (p: RioProfile, classColor: string) =>
  p.avatar ? img(p.avatar, "size-14 border-2", undefined, `border-color:${classColor}`) : null;

function item(it: RioItem): string {
  const color = QUALITY[it.quality] ?? QUALITY[1];
  return `
    <a href="https://www.wowhead.com/item=${it.id}" data-wowhead="${itemTooltip(it)}" target="_blank" rel="noreferrer"
       class="relative block shrink-0 hover:brightness-125">
      ${img(talentIcon(it.icon), "size-9 border-2", undefined, `border-color:${color}`)}
      <span class="absolute inset-x-0 bottom-0 text-center text-[10px] font-bold leading-tight text-white" style="text-shadow:0 1px 2px #000,0 0 2px #000">${it.level}</span>
    </a>`;
}

/** The hero tree's top talent is its emblem, like in-game. */
function talentsButton(p: RioProfile): string {
  if (!p.talentTree.length) return "";
  const hero = p.talentTree.filter((t) => t.tree === "hero");
  const emblem = hero.length ? hero.reduce((a, b) => (b.y < a.y ? b : a)) : null;
  return `
    <button type="button" data-show-talents class="btn ml-auto border-gold/50 py-1.5 pr-4 pl-1.5 text-gold">
      ${emblem ? img(talentIcon(emblem.icon), "size-7 rounded-full border border-gold/60") : ""}
      Talents
    </button>`;
}

/** Gear row under the header: item level, the items, and the talent string to copy. */
export function renderRioGear(p: RioProfile): string {
  if (!p.gear.length) return "";
  return `
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-4 py-3">
      ${p.itemLevel ? `<div class="shrink-0"><div class="label">Item level</div><div class="text-xl font-bold tabular-nums text-zinc-100">${p.itemLevel.toFixed(2)}</div></div>` : ""}
      <div class="flex flex-wrap gap-1.5">${p.gear.map(item).join("")}</div>
      ${talentsButton(p)}
    </div>`;
}

/** Grid step of the in-game tree coordinates, and how many pixels one step gets here. */
const STEP = 600;
const CELL = 42;
const ICON = 34;

function tree(title: string, talents: RioTalent[]): string {
  if (!talents.length) return "";
  const minX = Math.min(...talents.map((t) => t.x));
  const minY = Math.min(...talents.map((t) => t.y));
  const pos = (v: number, min: number) => ((v - min) / STEP) * CELL;
  const width = Math.max(...talents.map((t) => pos(t.x, minX))) + ICON;
  const height = Math.max(...talents.map((t) => pos(t.y, minY))) + ICON;
  const nodes = talents
    .map(
      (t) => `
        <a href="https://www.wowhead.com/spell=${t.spell}" data-wowhead="spell=${t.spell}" target="_blank" rel="noreferrer"
           class="absolute hover:z-10 hover:brightness-125" style="left:${pos(t.x, minX)}px;top:${pos(t.y, minY)}px">
          ${img(talentIcon(t.icon), "size-[34px] border-2 border-gold/70")}
          ${t.maxRank > 1 ? `<span class="absolute -right-1 -bottom-1 rounded-sm bg-black/90 px-0.5 text-[9px] font-bold leading-tight text-gold">${t.rank}/${t.maxRank}</span>` : ""}
        </a>`,
    )
    .join("");
  return `
    <div>
      <div class="label mb-2 text-center">${title}</div>
      <div class="relative mx-auto" style="width:${width}px;height:${height}px">${nodes}</div>
    </div>`;
}

/** Popup with the talent trees laid out like in-game (class, hero, spec), and the import string to copy. */
export function renderTalents(p: RioProfile, className: string): string {
  const of = (t: RioTalent["tree"]) => p.talentTree.filter((x) => x.tree === t);
  return `
    <div data-talents-popup class="fixed inset-0 z-40 grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <div class="panel max-h-full w-full max-w-6xl overflow-auto">
        <div class="site-header flex items-center gap-3 px-4 py-2">
          <span class="font-bold uppercase tracking-[0.14em] text-gold">Talents</span>
          <span class="text-sm text-zinc-400">${esc(spaced(className))}</span>
          ${p.talents ? `<button type="button" data-copy-talents="${esc(p.talents)}" class="btn ml-auto" title="Paste in-game under Import in the talent window">Copy import string</button>` : ""}
          <button type="button" data-close-talents class="btn ${p.talents ? "" : "ml-auto"}" aria-label="Close">✕</button>
        </div>
        <div class="flex flex-wrap items-start justify-center gap-10 p-6">
          ${tree("Class", of("class"))}
          ${tree("Hero", of("hero"))}
          ${tree("Spec", of("spec"))}
        </div>
      </div>
    </div>`;
}
