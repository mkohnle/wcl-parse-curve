import type { Breakdown, LogRef, Metric, Player } from "../../shared/api.ts";
import { compact, esc } from "../format.ts";
import { classColor, specIcon, talentIcon, tierColor } from "../wow.ts";
import { img, SEP } from "./common.ts";

// The log comparison: the player's fight against a better log of the same spec, ability by ability.

/** A better log to compare with, from the leaderboard behind the curve. */
export interface CompareTarget {
  log: LogRef;
  /** "#1", "~95", ... */
  label: string;
  parse: number;
  amount: number;
  /** its hero tree, null if unknown */
  tree: number | null;
}

/** A hero tree for the cards: name and emblem image. */
export interface HeroBadge {
  name: string;
  emblem: string | null;
}

// chart colors, checked with the palette validator on the panel color: you (accent) vs them (context),
// and behind vs ahead (diverging, colorblind-safe)
const YOU = "#b38a2a";
const THEM = "#7b7266";
const BEHIND = "#e0614f";
const AHEAD = "#4f93e0";

/** Abilities in the charts. */
const ROWS = 8;
/** A gap below this share of their total isn't worth a tile or a bar. */
const MIN_GAP = 0.02;

const perSecond = (b: Breakdown, amount: number) => amount / (b.duration / 1000);
const perMinute = (b: Breakdown, count: number) => count / (b.duration / 60_000);
const active = (b: Breakdown) => (b.activeTime ? (b.activeTime / b.duration) * 100 : null);
const castsPerMinute = (b: Breakdown) =>
  perMinute(
    b,
    b.abilities.reduce((n, a) => n + a.casts, 0),
  );
const signed = (v: number) => `${v < 0 ? "−" : "+"}${compact(Math.abs(v))}`;

const icon = (a: { id: number; icon: string }, size = "size-6") =>
  `<a href="https://www.wowhead.com/spell=${a.id}" data-wowhead="spell=${a.id}" target="_blank" rel="noreferrer" class="shrink-0">${img(talentIcon(a.icon || "inv_misc_questionmark"), size)}</a>`;

const legend = (items: [string, string][]) =>
  `<div class="flex gap-4 text-xs text-zinc-400">${items.map(([color, label]) => `<span class="flex items-center gap-1.5"><span class="size-2.5 rounded-sm" style="background:${color}"></span>${esc(label)}</span>`).join("")}</div>`;

const heading = (title: string, extra = "") =>
  `<div class="mb-3 flex flex-wrap items-center justify-between gap-2"><div class="label">${title}</div>${extra}</div>`;

/** Each ability's per-second gap, yours minus theirs, by name. */
function abilityGaps(me: Breakdown, them: Breakdown) {
  const mine = new Map(me.abilities.map((a) => [a.name, a]));
  const theirs = new Map(them.abilities.map((a) => [a.name, a]));
  const names = new Set([...mine.keys(), ...theirs.keys()]);
  return [...names].map((name) => {
    const m = mine.get(name);
    const t = theirs.get(name);
    const ability = (t ?? m) as Breakdown["abilities"][number];
    return {
      ability,
      m,
      t,
      gap: (m ? perSecond(me, m.amount) : 0) - (t ? perSecond(them, t.amount) : 0),
    };
  });
}

function card(
  title: string,
  b: Breakdown,
  parse: number,
  player: Player,
  metric: Metric,
  hero: HeroBadge | null,
  note = "",
) {
  return `
    <div class="flex items-center gap-3 rounded-sm border border-line bg-black/20 p-3">
      ${img(specIcon(player.className, player.spec), "size-10")}
      <div class="min-w-0 flex-1">
        <div class="label">${esc(title)}</div>
        <div class="truncate font-semibold" style="color:${classColor(player.className)}">${esc(b.name)}</div>
        <div class="flex flex-wrap items-center text-xs text-zinc-400">
          ${hero ? `${hero.emblem ? `<img src="${hero.emblem}" alt="" class="mr-1 size-4" />` : ""}${esc(hero.name)}${SEP}` : ""}${compact(perSecond(b, b.amount))} ${metric.toUpperCase()}
        </div>
        ${note ? `<div class="mt-0.5 text-xs text-amber-400">${note}</div>` : ""}
      </div>
      <div class="text-3xl font-bold tabular-nums" style="color:${tierColor(parse)}">${Math.floor(parse)}</div>
    </div>`;
}

/** Active time and casts per minute, you against them. */
function activity(me: Breakdown, them: Breakdown, theirName: string): string {
  const row = (label: string, mine: number, theirs: number, max: number, show: (v: number) => string) => `
    <div class="grid grid-cols-[6rem_1fr] items-center gap-3">
      <span class="text-xs text-zinc-400">${label}</span>
      <div class="space-y-1">
        ${(
          [
            [mine, YOU, "You"],
            [theirs, THEM, theirName],
          ] as const
        )
          .map(
            ([v, color, who]) => `
              <div class="flex items-center gap-2" title="${esc(who)}: ${show(v)}">
                <div class="h-2 rounded-r" style="width:${Math.max(1, (v / max) * 100)}%;background:${color}"></div>
                <span class="shrink-0 text-xs tabular-nums text-zinc-300">${show(v)}</span>
              </div>`,
          )
          .join("")}
      </div>
    </div>`;
  const mineActive = active(me);
  const theirActive = active(them);
  const cpmMine = castsPerMinute(me);
  const cpmTheirs = castsPerMinute(them);
  return `
    <div class="space-y-3">
      ${mineActive !== null && theirActive !== null ? row("Active", mineActive, theirActive, 100, (v) => `${v.toFixed(1)}%`) : ""}
      ${row("Casts / min", cpmMine, cpmTheirs, Math.max(cpmMine, cpmTheirs), (v) => v.toFixed(1))}
    </div>`;
}

/** The biggest gaps as tiles: icon, the per-second gap large, casts below. */
function tiles(me: Breakdown, them: Breakdown, metric: Metric): string {
  const total = perSecond(them, them.amount);
  const worst = abilityGaps(me, them)
    .filter((g) => -g.gap >= MIN_GAP * total)
    .sort((a, b) => a.gap - b.gap)
    .slice(0, 3);
  if (!worst.length) return "";
  return `
    <div class="grid gap-3 sm:grid-cols-3">
      ${worst
        .map(
          ({ ability, m, t, gap }) => `
            <div class="flex items-center gap-3 rounded-sm border border-line bg-black/20 p-3">
              ${icon(ability, "size-10")}
              <div class="min-w-0">
                <div class="truncate text-sm text-zinc-200">${esc(ability.name)}</div>
                <div class="text-xl font-bold tabular-nums" style="color:${BEHIND}">${signed(gap)} ${metric.toUpperCase()}</div>
                ${t?.casts || m?.casts ? `<div class="text-xs tabular-nums text-zinc-500">${m?.casts ?? 0} vs ${t?.casts ?? 0} casts</div>` : ""}
              </div>
            </div>`,
        )
        .join("")}
    </div>`;
}

/** Diverging bars: how much each ability adds to the difference, behind (left) or ahead (right). */
function gapChart(me: Breakdown, them: Breakdown, metric: Metric): string {
  const total = perSecond(them, them.amount);
  const rows = abilityGaps(me, them)
    .filter((g) => Math.abs(g.gap) >= MIN_GAP * total)
    .sort((a, b) => a.gap - b.gap)
    .slice(0, ROWS);
  if (!rows.length) return "";
  const max = Math.max(...rows.map((r) => Math.abs(r.gap)));
  const diff = perSecond(me, me.amount) - total;
  return `
    <div>
      ${heading(
        `Where the ${signed(diff)} ${metric.toUpperCase()} comes from`,
        legend([
          [BEHIND, "Behind"],
          [AHEAD, "Ahead"],
        ]),
      )}
      <div class="space-y-1">
        ${rows
          .map(({ ability, gap }) => {
            const width = (Math.abs(gap) / max) * 42;
            const color = gap < 0 ? BEHIND : AHEAD;
            const side = gap < 0 ? "right" : "left";
            return `
              <div class="grid grid-cols-[11rem_1fr] items-center gap-3" title="${esc(ability.name)}: ${signed(gap)} ${metric.toUpperCase()}">
                <div class="flex min-w-0 items-center gap-2">${icon(ability)}<span class="truncate text-sm text-zinc-300">${esc(ability.name)}</span></div>
                <div class="relative h-7">
                  <div class="absolute inset-y-0 left-1/2 w-px bg-zinc-600"></div>
                  <div class="absolute top-1/2 h-3 -translate-y-1/2 ${gap < 0 ? "rounded-l" : "rounded-r"}" style="${side}:50%;width:${width}%;background:${color}"></div>
                  <span class="absolute top-1/2 -translate-y-1/2 text-xs tabular-nums text-zinc-300" style="${side}:calc(50% + ${width}% + 6px)">${signed(gap)}</span>
                </div>
              </div>`;
          })
          .join("")}
      </div>
    </div>`;
}

/** Mirrored bars per ability: yours to the left, theirs to the right, same scale. */
function mirror(me: Breakdown, them: Breakdown, theirName: string, metric: Metric): string {
  const mine = new Map(me.abilities.map((a) => [a.name, a]));
  const rows = them.abilities.filter((a) => a.amount > 0).slice(0, ROWS);
  const values = rows.flatMap((t) => [
    perSecond(them, t.amount),
    perSecond(me, mine.get(t.name)?.amount ?? 0),
  ]);
  const max = Math.max(...values, 1);
  const unit = metric.toUpperCase();
  return `
    <div>
      ${heading(
        "Per ability",
        legend([
          [YOU, "You"],
          [THEM, theirName],
        ]),
      )}
      <div class="space-y-1">
        ${rows
          .map((t) => {
            const yours = perSecond(me, mine.get(t.name)?.amount ?? 0);
            const theirs = perSecond(them, t.amount);
            return `
              <div class="grid grid-cols-[1fr_2rem_1fr] items-center gap-2" title="${esc(t.name)}: ${compact(yours)} vs ${compact(theirs)} ${unit}">
                <div class="flex items-center justify-end gap-2">
                  <span class="text-xs tabular-nums text-zinc-400">${compact(yours)}</span>
                  <div class="h-3 rounded-l" style="width:${(yours / max) * 85}%;background:${YOU}"></div>
                </div>
                ${icon(t)}
                <div class="flex items-center gap-2">
                  <div class="h-3 rounded-r" style="width:${(theirs / max) * 85}%;background:${THEM}"></div>
                  <span class="text-xs tabular-nums text-zinc-400">${compact(theirs)}</span>
                </div>
              </div>`;
          })
          .join("")}
      </div>
    </div>`;
}

/** The exact numbers, folded away: casts per minute, per second and share, yours / theirs. */
function numbers(me: Breakdown, them: Breakdown): string {
  const mine = new Map(me.abilities.map((a) => [a.name, a]));
  const cell = (yours: number, theirs: number, show: (v: number) => string) =>
    `<td class="px-2 py-1 text-right tabular-nums"><span class="text-zinc-200">${show(yours)}</span> <span class="text-zinc-500">/ ${show(theirs)}</span></td>`;
  const rows = them.abilities
    .filter((a) => a.amount > 0)
    .map((t) => {
      const m = mine.get(t.name);
      return `
        <tr class="border-t border-line/60">
          <td class="px-2 py-1"><div class="flex items-center gap-2">${icon(t)}<span class="truncate">${esc(t.name)}</span></div></td>
          ${t.casts || m?.casts ? cell(perMinute(me, m?.casts ?? 0), perMinute(them, t.casts), (v) => v.toFixed(1)) : `<td class="px-2 py-1 text-right text-zinc-600">–</td>`}
          ${cell(perSecond(me, m?.amount ?? 0), perSecond(them, t.amount), compact)}
          ${cell(m ? (m.amount / me.amount) * 100 : 0, (t.amount / them.amount) * 100, (v) => `${v.toFixed(1)}%`)}
        </tr>`;
    })
    .join("");
  return `
    <details>
      <summary class="label cursor-pointer select-none hover:text-zinc-300">All numbers</summary>
      <table class="mt-2 w-full text-sm">
        <thead>
          <tr class="text-right">
            <th class="label px-2 py-1 text-left">Ability</th>
            <th class="label px-2 py-1">Casts / min</th>
            <th class="label px-2 py-1">Per second</th>
            <th class="label px-2 py-1">Share</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </details>`;
}

/**
 * Popup comparing the player's fight with a better log. me/them undefined: still loading.
 * yourParse: the parse shown in the analysis. heroes: each side's hero tree, if known.
 */
export function renderLogCompare(
  player: Player,
  yourParse: number,
  metric: Metric,
  targets: CompareTarget[],
  selected: CompareTarget,
  me: Breakdown | undefined,
  them: Breakdown | undefined,
  heroes: { you: HeroBadge | null; them: HeroBadge | null },
): string {
  const picker = `
    <select data-compare-target class="btn" style="color-scheme:dark">
      ${targets
        .map(
          (t, i) =>
            `<option value="${i}" ${t === selected ? "selected" : ""}>${esc(t.label)}: ${esc(t.log.name)}, ${compact(t.amount)}</option>`,
        )
        .join("")}
    </select>`;
  const otherTree =
    heroes.you && heroes.them && heroes.you.name !== heroes.them.name
      ? `Plays ${esc(heroes.them.name)}, you play ${esc(heroes.you.name)}`
      : "";
  const body =
    !me || !them
      ? `<div class="py-24 text-center text-sm text-zinc-400">Loading both logs…</div>`
      : `
        <div class="space-y-6 p-5">
          <div class="grid gap-3 sm:grid-cols-2">
            ${card("You", me, yourParse, player, metric, heroes.you)}
            ${card(`${selected.label} log`, them, selected.parse, player, metric, heroes.them, otherTree)}
          </div>
          ${tiles(me, them, metric)}
          ${activity(me, them, them.name)}
          ${gapChart(me, them, metric)}
          ${mirror(me, them, them.name, metric)}
          ${numbers(me, them)}
        </div>`;
  return `
    <div data-popup class="fixed inset-0 z-40 grid place-items-center bg-black/75 p-4 backdrop-blur-sm">
      <div class="panel max-h-full w-full max-w-4xl overflow-auto">
        <div class="site-header flex items-center gap-3 px-4 py-2">
          <span class="font-bold uppercase tracking-[0.14em] text-gold">Compare</span>
          <span class="ml-auto"></span>
          ${picker}
          <button type="button" data-close-popup class="btn" aria-label="Close">✕</button>
        </div>
        ${body}
      </div>
    </div>`;
}

/** While the hero tree and the targets load. */
export const renderCompareLoading = () => `
  <div data-popup class="fixed inset-0 z-40 grid place-items-center bg-black/75 p-4 backdrop-blur-sm">
    <div class="panel w-full max-w-4xl">
      <div class="site-header flex items-center gap-3 px-4 py-2">
        <span class="font-bold uppercase tracking-[0.14em] text-gold">Compare</span>
        <span class="ml-auto"></span>
        <button type="button" data-close-popup class="btn" aria-label="Close">✕</button>
      </div>
      <div class="py-24 text-center text-sm text-zinc-400">Loading both logs…</div>
    </div>
  </div>`;
