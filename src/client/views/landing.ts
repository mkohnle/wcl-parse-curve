import { esc } from "../format.ts";
import type { RecentItem } from "../recent.ts";
import { classColor, classIcon, TIER_STOPS, tierColor, zoneIcon } from "../wow.ts";
import { img } from "./common.ts";

/** Key visual: a bell curve of bars in the parse tier colors, like the analysis chart. */
export function renderHeroCurve(): string {
  const W = 640;
  const H = 150;
  const BARS = 46;
  const zMin = -3;
  const zMax = 3.4;
  const pdf = (z: number) => Math.exp(-0.5 * z * z);
  // tier borders as normal quantiles: 25, 50, 75, 95, 99, ~100
  const tier = (z: number) =>
    tierColor(
      z < -0.674 ? 0 : z < 0 ? 25 : z < 0.674 ? 50 : z < 1.645 ? 75 : z < 2.326 ? 95 : z < 3.09 ? 99 : 100,
    );
  const bw = W / BARS;
  const bars = Array.from({ length: BARS }, (_, i) => {
    const z = zMin + ((i + 0.5) / BARS) * (zMax - zMin);
    const h = Math.max(2, pdf(z) * (H - 8));
    return `<rect class="rise" style="animation-delay:${i * 12}ms" x="${(i * bw + 1).toFixed(1)}" y="${(H - h).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="${tier(z)}" opacity=".85"/>`;
  }).join("");
  // bell line over the bars, drawn left to right once
  const line = Array.from({ length: 121 }, (_, i) => {
    const z = zMin + (i / 120) * (zMax - zMin);
    return `${i ? "L" : "M"}${((i / 120) * W).toFixed(1)} ${(H - pdf(z) * (H - 8) - 4).toFixed(1)}`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H + 1}" class="block h-auto w-full" aria-hidden="true">
    ${bars}<line x1="0" x2="${W}" y1="${H + 0.5}" y2="${H + 0.5}" stroke="#2a2d3a"/>
    <path class="draw" pathLength="1" d="${line}" fill="none" stroke="#fff" stroke-width="1.5" opacity=".5"/>
  </svg>`;
}

/** Thin bar in the parse tier colors. */
export const renderTierStrip = () =>
  `<div class="mx-auto mb-6 h-1 max-w-xs rounded-full opacity-70" style="background:linear-gradient(90deg, ${TIER_STOPS})"></div>`;

export function renderRecent(items: RecentItem[]): string {
  if (!items.length) return "";
  const chips = items.map((it, i) =>
    it.kind === "report"
      ? `<button type="button" data-recent="${i}" class="flex max-w-60 items-center gap-2 overflow-hidden rounded-sm border border-line bg-panel py-1.5 pr-3 pl-2 text-sm text-zinc-300 hover:border-zinc-500"
           ${it.zoneId ? `style="background:linear-gradient(90deg, var(--color-panel) 45%, rgb(20 21 28 / .7)), url(${zoneIcon(it.zoneId)}) right center / 60% auto no-repeat"` : ""}>
          ${it.zoneId ? img(zoneIcon(it.zoneId), "size-6") : ""}<span class="truncate">${esc(it.title)}</span>
        </button>`
      : `<button type="button" data-recent="${i}" class="flex max-w-60 items-center gap-2 rounded-sm border border-l-2 border-line bg-panel py-1.5 pr-3 pl-2 text-sm hover:border-zinc-500"
           style="border-left-color:${classColor(it.className)}">
          ${img(classIcon(it.className), "size-6")}<span class="truncate" style="color:${classColor(it.className)}">${esc(it.name)}</span>
          <span class="shrink-0 text-xs text-zinc-500">${esc(it.realmName)} ${esc(it.region)}</span>
        </button>`,
  );
  return `
    <div class="label mb-2">Recently viewed</div>
    <div class="flex flex-wrap justify-center gap-2">${chips.join("")}</div>`;
}
