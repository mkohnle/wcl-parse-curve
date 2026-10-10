import { cached, DAY } from "./cache.ts";

// A spell's class and cooldown, from Wowhead's tooltips ("Requires Warrior", "1.5 min cooldown").
// Dungeon mechanics, potions, racials and trinkets have no class. Asked once per spell, a few at a time.

export interface SpellInfo {
  /** e.g. "Warrior" or "Death Knight"; null if none */
  className: string | null;
  /** seconds; null if none */
  cooldown: number | null;
}

const MAX_PARALLEL = 4;
let active = 0;
const waiting: (() => void)[] = [];

async function lookup(spellId: number): Promise<SpellInfo> {
  if (active >= MAX_PARALLEL) await new Promise<void>((resolve) => waiting.push(resolve));
  active++;
  try {
    const res = await fetch(`https://nether.wowhead.com/tooltip/spell/${spellId}`);
    // failures throw, so they aren't cached
    if (!res.ok) throw new Error(`Wowhead ${res.status}`);
    const { tooltip = "" } = (await res.json()) as { tooltip?: string };
    const cooldown = tooltip.match(/([\d.]+) (sec|min) (?:cooldown|recharge)/);
    return {
      className: tooltip.match(/Requires ([A-Z][a-z]+(?: [A-Z][a-z]+)?)/)?.[1] ?? null,
      cooldown: cooldown ? Number(cooldown[1]) * (cooldown[2] === "min" ? 60 : 1) : null,
    };
  } finally {
    active--;
    waiting.shift()?.();
  }
}

export const spellInfo = (spellId: number) =>
  cached(`spell-info|${spellId}`, 30 * DAY, () => lookup(spellId));
