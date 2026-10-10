import type { RioItem, RioProfile, RioRun } from "../../shared/api.ts";
import { duration, esc, fmt, spaced } from "../format.ts";
import { talentIcon } from "../wow.ts";
import { itemTooltip } from "../wowhead.ts";
import { img } from "./common.ts";

/** Small tinted pill after the class and realm; the realm rank on hover. */
export function renderRioBadge(p: RioProfile, className: string, realmName: string): string {
  const rank = p.ranks?.class.realm;
  const title = `Raider.IO M+ score${rank ? `, #${fmt(rank)} ${spaced(className)} on ${realmName}` : ""}`;
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
    <button type="button" data-show-talents class="btn btn-accent ml-auto py-1.5 pr-4 pl-1.5">
      ${emblem ? img(talentIcon(emblem.icon), "size-7 rounded-full border border-gold/60") : ""}
      Talents
    </button>`;
}

/** Gear row under the header: item level, the items, and the talent string to copy. */
export function renderRioGear(p: RioProfile): string {
  if (!p.gear.length) return "";
  return `
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-4 py-3">
      ${p.itemLevel ? `<div class="shrink-0"><div class="label">Item level</div><div class="text-xl font-bold tabular-nums text-zinc-100">${Math.floor(p.itemLevel)}</div></div>` : ""}
      <div class="flex flex-wrap gap-1.5">${p.gear.map(item).join("")}</div>
      ${talentsButton(p)}
    </div>`;
}
