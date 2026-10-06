import { esc } from "../format.ts";
import type { RecentItem } from "../recent.ts";
import { classColor, classIcon, tierColor, zoneIcon } from "../wow.ts";
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
    return `<rect x="${(i * bw + 1).toFixed(1)}" y="${(H - h).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="${tier(z)}" opacity=".85"/>`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H + 1}" class="block h-auto w-full" aria-hidden="true">
    ${bars}<line x1="0" x2="${W}" y1="${H + 0.5}" y2="${H + 0.5}" stroke="#2a2d3a"/>
  </svg>`;
}

export function renderRecent(items: RecentItem[]): string {
  if (!items.length) return "";
  const chips = items.map((it, i) =>
    it.kind === "report"
      ? `<button type="button" data-recent="${i}" class="flex max-w-56 items-center gap-2 rounded-sm border border-line bg-panel px-2 py-1 text-sm text-zinc-300 hover:border-zinc-500">
          ${it.zoneId ? img(zoneIcon(it.zoneId), "size-5") : ""}<span class="truncate">${esc(it.title)}</span>
        </button>`
      : `<button type="button" data-recent="${i}" class="flex max-w-56 items-center gap-2 rounded-sm border border-line bg-panel px-2 py-1 text-sm hover:border-zinc-500">
          ${img(classIcon(it.className), "size-5")}<span class="truncate" style="color:${classColor(it.className)}">${esc(it.name)}</span>
          <span class="shrink-0 text-xs text-zinc-500">${esc(it.realmName)} ${esc(it.region)}</span>
        </button>`,
  );
  return `
    <div class="label mb-2">Recently viewed</div>
    <div class="flex flex-wrap justify-center gap-2">${chips.join("")}</div>`;
}
