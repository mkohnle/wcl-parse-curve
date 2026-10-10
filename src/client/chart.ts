import type { CurveMetric, LogRef, Player } from "../shared/api.ts";
import { type Curve, meanAndStdDev, normalPdf } from "./curve.ts";
import { compact, date, esc, fmt, metricLabel } from "./format.ts";
import { TIERS, tierColor } from "./wow.ts";

/** A real leaderboard entry with a link to its log. */
interface RealLog {
  rank: number;
  amount: number;
  log: LogRef;
}

const logUrl = (l: LogRef, metric: CurveMetric) =>
  `https://www.warcraftlogs.com/reports/${l.code}#fight=${l.fight}&type=${metric === "hps" ? "healing" : "damage-done"}`;

const W = 900;
const H = 340;
const PAD = { left: 12, right: 12, top: 44, bottom: 34 };
const BINS = 50;

interface Bin {
  lo: number;
  hi: number;
  pLo: number;
  pHi: number;
  count: number;
  estimated: boolean;
  /** real log closest to the bar's middle; only on bars with real data */
  example: RealLog | null;
}

/** Render an interactive histogram of the modeled population into `el`. Bars with real data link to a log. */
export function mountChart(
  el: HTMLElement,
  tooltip: HTMLElement,
  curve: Curve,
  player: Player,
  /** what the curve shows: the player's amount and parse in that metric */
  shown: { amount: number; parse: number; metric: CurveMetric },
  logs: RealLog[],
): void {
  const { amount, metric } = shown;
  const lo = Math.min(curve.amountAt(1), amount) * 0.97;
  const hi = Math.max(curve.amountAt(99.9), amount) * 1.03;
  const bw = (hi - lo) / BINS;
  const exactFrom = curve.amountAtRank(curve.exactRanks);

  const bins: Bin[] = Array.from({ length: BINS }, (_, i) => {
    const a = lo + i * bw;
    const b = a + bw;
    const pLo = curve.percentileOf(a);
    const pHi = curve.percentileOf(b);
    const estimated = b < exactFrom;
    return {
      lo: a,
      hi: b,
      pLo,
      pHi,
      count: ((pHi - pLo) / 100) * curve.total,
      estimated,
      example: estimated ? null : closest(logs, (a + b) / 2),
    };
  });

  const { mean, sd } = meanAndStdDev(curve);
  const fit = (v: number) => normalPdf(v, mean, sd) * curve.total * bw;

  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const baseY = PAD.top + ih;
  const ymax = Math.max(...bins.map((b) => b.count), fit(mean)) * 1.08;
  const x = (v: number) => PAD.left + ((v - lo) / (hi - lo)) * iw;
  const y = (c: number) => baseY - (c / ymax) * ih;
  const colW = iw / BINS;

  const bars = bins
    .map((b, i) => {
      const color = tierColor((b.pLo + b.pHi) / 2);
      const box = `x="${x(b.lo) + 1}" y="${y(b.count)}" width="${colW - 2}" height="${Math.max(0, baseY - y(b.count))}" rx="2"`;
      // status-bar look like the front page: tier color, shine on top, dark outline
      return `<g data-bar="${i}" class="chart-bar" opacity="${b.estimated ? 0.4 : 1}">
        <rect ${box} fill="${color}" opacity=".9"/>
        <rect ${box} fill="url(#chart-gloss)" stroke="#000" stroke-opacity=".55" stroke-width=".75"/>
      </g>`;
    })
    .join("");

  const steps = 160;
  const path = Array.from({ length: steps + 1 }, (_, i) => {
    const v = lo + ((hi - lo) * i) / steps;
    return `${i ? "L" : "M"}${x(v).toFixed(1)} ${y(fit(v)).toFixed(1)}`;
  }).join("");

  const ticks = Array.from({ length: 7 }, (_, i) => lo + ((hi - lo) * i) / 6)
    .map((v, i) => {
      const align = i === 0 ? "start" : i === 6 ? "end" : "middle";
      return `<text x="${x(v)}" y="${H - 10}" fill="#7b7266" font-size="12" text-anchor="${align}">${compact(v)}</text>`;
    })
    .join("");

  // small colored markers on the axis where each parse tier starts
  const tierMarks = TIERS.filter((t) => t.min > 0 && t.min < 100)
    .map((t) => ({ t, v: curve.amountAt(t.min) }))
    .filter(({ v }) => v > lo && v < hi)
    .map(({ t, v }) => `<rect x="${x(v) - 1}" y="${baseY + 1}" width="2" height="7" fill="${t.color}"/>`)
    .join("");

  const parse = Math.floor(shown.parse);
  const px = x(amount);
  const pc = tierColor(parse);
  const anchor = px > W - 160 ? "end" : px < 160 ? "start" : "middle";

  el.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="block h-auto w-full select-none">
      <defs>
        <linearGradient id="chart-gloss" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fff" stop-opacity=".35"/>
          <stop offset=".45" stop-color="#fff" stop-opacity="0"/>
          <stop offset="1" stop-color="#000" stop-opacity=".3"/>
        </linearGradient>
      </defs>
      <g>${bars}</g>
      <line x1="${PAD.left}" x2="${W - PAD.right}" y1="${baseY}" y2="${baseY}" stroke="#6b5232" stroke-width="2"/>
      <line x1="${PAD.left}" x2="${W - PAD.right}" y1="${baseY - 1}" y2="${baseY - 1}" stroke="#e5cc80" stroke-opacity=".25"/>
      ${[PAD.left, W - PAD.right].map((dx) => `<path d="M${dx} ${baseY - 3.5}l3.5 3.5-3.5 3.5-3.5-3.5z" fill="#e5cc80" stroke="#050302" stroke-width=".75"/>`).join("")}
      <path d="${path}" fill="none" stroke="#fff" stroke-width="1.5" stroke-dasharray="6 5" opacity=".55"/>
      ${tierMarks}
      ${ticks}
      <line data-hover x1="0" x2="0" y1="${PAD.top - 8}" y2="${baseY}" stroke="#fff" stroke-opacity=".25" visibility="hidden"/>
      <line x1="${px}" x2="${px}" y1="${PAD.top - 14}" y2="${baseY}" stroke="${pc}" stroke-width="3"/>
      <circle cx="${px}" cy="${baseY}" r="5" fill="${pc}" stroke="#0c0907" stroke-width="2"/>
      <text x="${px}" y="${PAD.top - 22}" fill="${pc}" font-size="14" font-weight="700" text-anchor="${anchor}">${esc(player.name)} (${parse})</text>
      <rect x="${PAD.left}" y="0" width="${iw}" height="${H}" fill="transparent"/>
    </svg>`;

  const svg = el.querySelector("svg") as SVGSVGElement;
  const hoverLine = svg.querySelector("[data-hover]") as SVGLineElement;
  const bar = (i: number) => svg.querySelector(`[data-bar="${i}"]`);
  let active = -1;
  /** The hovered bar springs up, its neighbors follow a little (see style.css). */
  const highlight = (i: number, on: boolean) => {
    bar(i)?.toggleAttribute("data-hot", on);
    bar(i - 1)?.toggleAttribute("data-near", on);
    bar(i + 1)?.toggleAttribute("data-near", on);
  };

  const hide = () => {
    tooltip.classList.add("hidden");
    hoverLine.setAttribute("visibility", "hidden");
    highlight(active, false);
    active = -1;
  };

  const binAt = (e: MouseEvent) => {
    const box = svg.getBoundingClientRect();
    const i = Math.floor((((e.clientX - box.left) / box.width) * W - PAD.left) / colW);
    return i >= 0 && i < BINS ? i : -1;
  };

  svg.addEventListener("click", (e) => {
    const example = bins[binAt(e)]?.example;
    if (example) window.open(logUrl(example.log, metric), "_blank", "noopener");
  });

  svg.addEventListener("pointerleave", hide);
  svg.addEventListener("pointermove", (e) => {
    const i = binAt(e);
    if (i < 0) {
      hide();
      return;
    }

    if (i !== active) {
      highlight(active, false);
      highlight(i, true);
      active = i;
      const b = bins[i];
      svg.style.cursor = b.example ? "pointer" : "default";
      tooltip.innerHTML = `
        <div class="font-semibold text-zinc-100">${compact(b.lo)} – ${compact(b.hi)} ${metricLabel(metric)}</div>
        <div style="color:${tierColor(b.pHi)}">Parse ${Math.floor(b.pLo)} – ${Math.floor(b.pHi)}</div>
        <div class="text-zinc-400">≈ ${fmt(b.count)} parses (${(b.pHi - b.pLo).toFixed(1)}%)</div>
        ${b.estimated ? `<div class="text-xs italic text-zinc-500">estimated</div>` : ""}
        ${b.example ? exampleHtml(b.example, b) : ""}`;
    }
    const cx = x(bins[i].lo + bw / 2);
    hoverLine.setAttribute("x1", `${cx}`);
    hoverLine.setAttribute("x2", `${cx}`);
    hoverLine.setAttribute("visibility", "visible");

    tooltip.classList.remove("hidden");
    const tw = tooltip.offsetWidth;
    const left = e.clientX + 16 + tw > window.innerWidth ? e.clientX - 16 - tw : e.clientX + 16;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${e.clientY + 16}px`;
  });
}

/** Real log with the amount closest to `amount`. */
function closest(logs: RealLog[], amount: number): RealLog | null {
  let best: RealLog | null = null;
  for (const l of logs) if (!best || Math.abs(l.amount - amount) < Math.abs(best.amount - amount)) best = l;
  return best;
}

function exampleHtml(ex: RealLog, bin: Bin): string {
  const inBin = ex.amount >= bin.lo && ex.amount < bin.hi;
  return `
    <div class="mt-1.5 border-t border-line pt-1.5 text-xs">
      <div class="text-zinc-500">${inBin ? "Example log" : "Closest real log"}</div>
      <div><span class="text-zinc-200">${esc(ex.log.name)}</span> <span class="text-zinc-500">${esc(ex.log.server)}</span></div>
      <div class="text-zinc-400">${compact(ex.amount)}, rank ${fmt(ex.rank)}, ${date(ex.log.date)}</div>
      <div class="mt-0.5 text-gold">Click to open on Warcraft Logs ↗</div>
    </div>`;
}
