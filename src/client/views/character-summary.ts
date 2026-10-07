import type { CharacterZone } from "../../shared/api.ts";
import { esc } from "../format.ts";
import { bossIcon, TIER_STOPS, tierColor } from "../wow.ts";
import { img } from "./common.ts";

type Boss = CharacterZone["bosses"][number];
type Done = Boss & { best: number; median: number };

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** How well (best parses), how steady (medians) and, for M+, how high (key levels). */
export function renderZoneSummary(z: CharacterZone): string {
  const done = z.bosses.filter((b): b is Done => b.kills > 0 && b.best !== null && b.median !== null);
  if (!done.length) return "";

  const best = avg(done.map((b) => b.best));
  const median = avg(done.map((b) => b.median));
  const keys = done.map((b) => b.keyLevel ?? 0);
  const label = (b: Boss) => `${esc(b.name)}${z.mythicPlus && b.keyLevel ? ` +${b.keyLevel}` : ""}`;

  const stat = (title: string, value: string, hint: string, color = "#f4f4f5", sub = "") => `
    <div title="${hint}">
      <div class="label">${title}</div>
      <div class="text-3xl font-bold tabular-nums leading-tight" style="color:${color}">${value}</div>
      ${sub ? `<div class="text-xs text-zinc-500">${sub}</div>` : ""}
    </div>`;

  const sorted = [...done].sort((a, b) => b.best - a.best);
  const top = sorted[0];
  const low = sorted[sorted.length - 1];

  return `
    <div class="panel mb-4 p-4">
      <div class="grid grid-cols-3 gap-4">
        ${stat(
          "Performance",
          String(Math.floor(best)),
          z.mythicPlus
            ? "Average of the best parse per dungeon at its highest key, compared only with the same spec at the same key level"
            : "Average of the best parse per boss",
          tierColor(best),
        )}
        ${stat(
          "Consistency",
          String(Math.floor(median)),
          "Average of the median parse. Close to Performance means steady, far below means big swings between runs.",
          tierColor(median),
        )}
        ${
          z.mythicPlus
            ? stat(
                "Key level",
                `+${avg(keys).toFixed(1)}`,
                "Average highest key per dungeon",
                undefined,
                Math.min(...keys) === Math.max(...keys)
                  ? `+${keys[0]} everywhere`
                  : `+${Math.min(...keys)} to +${Math.max(...keys)}`,
              )
            : stat(
                "Progress",
                `${done.length}/${z.bosses.length}`,
                "Bosses with a ranked kill",
                undefined,
                "bosses killed",
              )
        }
      </div>

      <div class="relative mt-5 h-4">
        <div class="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full opacity-40" style="background:linear-gradient(90deg, ${TIER_STOPS})"></div>
        <div class="absolute top-0 h-4 w-px bg-white/60" style="left:${best}%" title="Performance ${Math.floor(best)}"></div>
        ${done
          .map(
            (b) =>
              `<span class="group absolute top-1/2 -translate-x-1/2 -translate-y-1/2 p-1 hover:z-10" style="left:${b.best}%">
                 <span class="block size-3 rounded-full ring-2 ring-panel transition group-hover:scale-125" style="background:${tierColor(b.best)}"></span>
                 <span class="pointer-events-none absolute bottom-full left-1/2 mb-1 hidden w-max -translate-x-1/2 items-center gap-2 rounded-sm border border-line bg-panel-2 py-1 pr-2 pl-1 text-xs shadow-lg group-hover:flex">
                   ${img(bossIcon(b.encounterId), "size-6")}
                   <span class="text-zinc-200">${label(b)}</span>
                   <span class="border-l border-line pl-2 font-bold tabular-nums" style="color:${tierColor(b.best)}">${Math.floor(b.best)}</span>
                 </span>
               </span>`,
          )
          .join("")}
      </div>
      <div class="mt-1 flex justify-between text-[10px] tabular-nums text-zinc-600"><span>0</span><span>50</span><span>100</span></div>

      ${
        done.length > 1
          ? `<div class="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-400">
              <span>Strongest: <span class="text-zinc-200">${label(top)}</span> · <span style="color:${tierColor(top.best)}">${Math.floor(top.best)}</span></span>
              <span>Room to grow: <span class="text-zinc-200">${label(low)}</span> · <span style="color:${tierColor(low.best)}">${Math.floor(low.best)}</span></span>
            </div>`
          : ""
      }
    </div>`;
}
