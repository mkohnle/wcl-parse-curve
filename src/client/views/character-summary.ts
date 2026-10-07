import type { CharacterZone } from "../../shared/api.ts";
import { esc } from "../format.ts";
import { TIERS, tierColor } from "../wow.ts";

type Boss = CharacterZone["bosses"][number];
type Done = Boss & { best: number; median: number };

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Tier colors as hard stops along 0-100. */
const TRACK = [...TIERS]
  .reverse()
  .map((t, i, all) => {
    const end = all[i + 1]?.min ?? 100;
    return `${t.color} ${t.min}% ${end}%`;
  })
  .join(", ");

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
        <div class="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full opacity-40" style="background:linear-gradient(90deg, ${TRACK})"></div>
        <div class="absolute top-0 h-4 w-px bg-white/60" style="left:${best}%" title="Performance ${Math.floor(best)}"></div>
        ${done
          .map(
            (b) =>
              `<span class="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-panel"
                 style="left:${b.best}%;background:${tierColor(b.best)}" title="${label(b)}: ${Math.floor(b.best)}"></span>`,
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
