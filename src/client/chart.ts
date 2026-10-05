import type { Player } from "../shared/api.ts";
import { type Curve, meanAndStdDev, normalPdf } from "./curve.ts";
import { compact, esc, fmt } from "./format.ts";
import { TIERS, tierColor } from "./wow.ts";

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
}

/** Render an interactive histogram of the modeled population into `el`. */
export function mountChart(
  el: HTMLElement,
  tooltip: HTMLElement,
  curve: Curve,
  player: Player,
  playerParse: number,
): void {
  const lo = Math.min(curve.amountAt(1), player.amount) * 0.97;
  const hi = Math.max(curve.amountAt(99.9), player.amount) * 1.03;
  const bw = (hi - lo) / BINS;
  const exactFrom = curve.amountAtRank(curve.exactRanks);

  const bins: Bin[] = Array.from({ length: BINS }, (_, i) => {
    const a = lo + i * bw;
    const b = a + bw;
    const pLo = curve.percentileOf(a);
    const pHi = curve.percentileOf(b);
    return { lo: a, hi: b, pLo, pHi, count: ((pHi - pLo) / 100) * curve.total, estimated: b < exactFrom };
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
      return `<rect data-bar="${i}" x="${x(b.lo) + 1}" y="${y(b.count)}" width="${colW - 2}" height="${Math.max(0, baseY - y(b.count))}" rx="2" fill="${color}" opacity="${b.estimated ? 0.35 : 0.9}"/>`;
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
      return `<text x="${x(v)}" y="${H - 10}" fill="#71717a" font-size="12" text-anchor="${align}">${compact(v)}</text>`;
    })
    .join("");

  // small colored markers on the axis where each parse tier starts
  const tierMarks = TIERS.filter((t) => t.min > 0 && t.min < 100)
    .map((t) => ({ t, v: curve.amountAt(t.min) }))
    .filter(({ v }) => v > lo && v < hi)
    .map(({ t, v }) => `<rect x="${x(v) - 1}" y="${baseY + 1}" width="2" height="7" fill="${t.color}"/>`)
    .join("");

  const parse = Math.floor(playerParse);
  const px = x(player.amount);
  const pc = tierColor(parse);
  const anchor = px > W - 160 ? "end" : px < 160 ? "start" : "middle";

  el.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="block h-auto w-full select-none">
      <line x1="${PAD.left}" x2="${W - PAD.right}" y1="${baseY}" y2="${baseY}" stroke="#2a2d3a"/>
      <g>${bars}</g>
      <path d="${path}" fill="none" stroke="#fff" stroke-width="1.5" stroke-dasharray="6 5" opacity=".55"/>
      ${tierMarks}
      ${ticks}
      <line data-hover x1="0" x2="0" y1="${PAD.top - 8}" y2="${baseY}" stroke="#fff" stroke-opacity=".25" visibility="hidden"/>
      <line x1="${px}" x2="${px}" y1="${PAD.top - 14}" y2="${baseY}" stroke="${pc}" stroke-width="3"/>
      <circle cx="${px}" cy="${baseY}" r="5" fill="${pc}" stroke="#0a0b10" stroke-width="2"/>
      <text x="${px}" y="${PAD.top - 22}" fill="${pc}" font-size="14" font-weight="700" text-anchor="${anchor}">${esc(player.name)} · ${parse}</text>
      <rect x="${PAD.left}" y="0" width="${iw}" height="${H}" fill="transparent"/>
    </svg>`;

  const svg = el.querySelector("svg") as SVGSVGElement;
  const hoverLine = svg.querySelector("[data-hover]") as SVGLineElement;
  const bar = (i: number) => svg.querySelector(`[data-bar="${i}"]`);
  let active = -1;

  const hide = () => {
    tooltip.classList.add("hidden");
    hoverLine.setAttribute("visibility", "hidden");
    bar(active)?.removeAttribute("stroke");
    active = -1;
  };

  svg.addEventListener("pointerleave", hide);
  svg.addEventListener("pointermove", (e) => {
    const box = svg.getBoundingClientRect();
    const vx = ((e.clientX - box.left) / box.width) * W;
    const i = Math.floor((vx - PAD.left) / colW);
    if (i < 0 || i >= BINS) {
      hide();
      return;
    }

    if (i !== active) {
      bar(active)?.removeAttribute("stroke");
      bar(i)?.setAttribute("stroke", "#fff");
      active = i;
      const b = bins[i];
      tooltip.innerHTML = `
        <div class="font-semibold text-zinc-100">${compact(b.lo)} – ${compact(b.hi)} ${player.metric.toUpperCase()}</div>
        <div style="color:${tierColor(b.pHi)}">Parse ${Math.floor(b.pLo)} – ${Math.floor(b.pHi)}</div>
        <div class="text-zinc-400">≈ ${fmt(b.count)} parses (${(b.pHi - b.pLo).toFixed(1)}%)</div>
        ${b.estimated ? `<div class="text-xs italic text-zinc-500">estimated</div>` : ""}`;
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
