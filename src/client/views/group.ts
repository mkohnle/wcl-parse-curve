import type { Player, RunStats } from "../../shared/api.ts";
import { compact, esc } from "../format.ts";
import { classColor } from "../wow.ts";

type Ran = Player & { run: RunStats };

/** M+: the five players side by side on stats without leaderboards. Empty outside M+. */
export function renderGroup(players: Player[], selected: string): string {
  const ps = players.filter((p): p is Ran => p.run !== null);
  if (ps.length < 2) return "";

  const column = (
    title: string,
    value: (p: Ran) => number,
    show: (v: number) => string,
    hint: (p: Ran) => string = () => "",
  ) => {
    const max = Math.max(...ps.map(value), 1);
    const rows = [...ps]
      .sort((a, b) => value(b) - value(a))
      .map((p) => {
        const v = value(p);
        const on = p.name === selected;
        return `
          <div class="grid grid-cols-[5.5rem_1fr_2.5rem] items-center gap-2 text-xs" ${hint(p) ? `title="${esc(hint(p))}"` : ""}>
            <span class="truncate ${on ? "font-bold" : ""}" style="color:${classColor(p.className)}">${esc(p.name)}</span>
            <span class="h-2 rounded-sm bg-black/40">
              <span class="block h-full rounded-sm" style="width:${(v / max) * 100}%;background:${classColor(p.className)};opacity:${on ? 1 : 0.55}"></span>
            </span>
            <span class="text-right tabular-nums ${on ? "text-zinc-100" : "text-zinc-400"}">${show(v)}</span>
          </div>`;
      })
      .join("");
    return `<div><div class="label mb-2">${title}</div><div class="space-y-1.5">${rows}</div></div>`;
  };

  return `
    <div class="grid gap-5 border-t border-line p-5 sm:grid-cols-3">
      ${column(
        "Damage share",
        (p) => p.run.damageShare,
        (v) => `${Math.round(v * 100)}%`,
        (p) => `${p.name}: ${compact(p.run.damage)} damage (${Math.round(p.run.damageShare * 100)}%)`,
      )}
      ${column("Kicks", (p) => p.run.interrupts, String)}
      ${column("Deaths", (p) => p.run.deaths, String)}
    </div>`;
}
