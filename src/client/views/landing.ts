import { esc } from "../format.ts";
import type { RecentItem } from "../recent.ts";
import { classColor, classIcon, tierColor, zoneIcon } from "../wow.ts";
import { img } from "./common.ts";

/** Normal quantiles where each parse tier starts: 25, 50, 75, 95, 99, ~100. */
const TIER_Z: [z: number, parse: number][] = [
  [-0.674, 25],
  [0, 50],
  [0.674, 75],
  [1.645, 95],
  [2.326, 99],
  [3.09, 100],
];

/** Key visual: a bell curve of glossy bars in the parse tier colors; hovering a bar sends a small wave. */
export function renderHeroCurve(): string {
  const W = 640;
  const H = 150;
  const BARS = 46;
  const zMin = -3;
  const zMax = 3.4;
  const pdf = (z: number) => Math.exp(-0.5 * z * z);
  const tier = (z: number) => tierColor(TIER_Z.findLast(([from]) => z >= from)?.[1] ?? 0);
  const bw = W / BARS;
  const heightOf = (z: number) => Math.max(2, pdf(z) * (H - 8));

  // status-bar look: tier color, a shine on top, a dark outline
  const bars = Array.from({ length: BARS }, (_, i) => {
    const z = zMin + ((i + 0.5) / BARS) * (zMax - zMin);
    const h = heightOf(z);
    const box = `x="${(i * bw + 1).toFixed(1)}" y="${(H - h).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="1.5"`;
    return `<g class="rise" style="animation-delay:${i * 12}ms"><g class="hero-bar">
      <rect ${box} fill="${tier(z)}" opacity=".9"/>
      <rect ${box} fill="url(#gloss)" stroke="#000" stroke-opacity=".55" stroke-width=".75"/>
    </g></g>`;
  }).join("");

  // bell line over the bars, drawn left to right once
  const line = Array.from({ length: 121 }, (_, i) => {
    const z = zMin + (i / 120) * (zMax - zMin);
    return `${i ? "L" : "M"}${((i / 120) * W).toFixed(1)} ${(H - heightOf(z) - 4).toFixed(1)}`;
  }).join("");

  const diamond = (x: number) =>
    `<path d="M${x} ${H - 3.5}l3.5 3.5-3.5 3.5-3.5-3.5z" fill="#e5cc80" stroke="#050302" stroke-width=".75"/>`;

  return `
        <svg viewBox="0 0 ${W} ${H + 4}" class="block h-auto w-full overflow-visible" aria-hidden="true">
          <defs>
            <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#fff" stop-opacity=".35"/>
              <stop offset=".45" stop-color="#fff" stop-opacity="0"/>
              <stop offset="1" stop-color="#000" stop-opacity=".3"/>
            </linearGradient>
          </defs>
          ${bars}
          <path class="draw" pathLength="1" d="${line}" fill="none" stroke="#fff" stroke-width="1.5" opacity=".45"/>
          <line x1="6" x2="${W - 6}" y1="${H}" y2="${H}" stroke="#6b5232" stroke-width="2"/>
          <line x1="6" x2="${W - 6}" y1="${H - 1}" y2="${H - 1}" stroke="#e5cc80" stroke-opacity=".25"/>
          ${diamond(6)}${diamond(W - 6)}
        </svg>`;
}

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
