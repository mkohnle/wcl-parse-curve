import type { Region, RioProfile, RioRanks, RioTalent } from "../shared/api.ts";
import { compactName } from "../shared/names.ts";
import { cached, DAY } from "./cache.ts";

// Raider.IO's public API: M+ score, ranks and best runs. No key; separate from the WCL budget.

const BASE = "https://raider.io/api/v1";
/** Be gentle: a few requests at a time. */
const MAX_PARALLEL = 3;

let active = 0;
const waiting: (() => void)[] = [];

async function get<T>(path: string): Promise<T | null> {
  if (active >= MAX_PARALLEL) await new Promise<void>((resolve) => waiting.push(resolve));
  active++;
  try {
    const res = await fetch(`${BASE}${path}`, { headers: { accept: "application/json" } });
    // unknown characters come back as 400
    if (res.status === 400 || res.status === 404) return null;
    if (!res.ok) throw new Error(`Raider.IO request failed (${res.status})`);
    return (await res.json()) as T;
  } finally {
    active--;
    waiting.shift()?.();
  }
}

/** Score colors, best first. */
const scoreTiers = () =>
  cached(
    "rio-tiers",
    DAY,
    async () => (await get<{ score: number; rgbHex: string }[]>("/mythic-plus/score-tiers")) ?? [],
  );

interface RawProfile {
  profile_url: string;
  active_spec_name?: string;
  thumbnail_url?: string;
  gear?: {
    item_level_equipped?: number;
    items?: Record<
      string,
      {
        item_id: number;
        name: string;
        item_level: number;
        item_quality: number;
        icon: string;
        bonuses?: number[];
        enchant?: number;
        gems?: number[];
      }
    >;
  };
  talentLoadout?: { loadout_text?: string; loadout?: RawTalent[] };
  mythic_plus_scores_by_season?: { scores: { all: number } }[];
  mythic_plus_ranks?: { overall?: RioRanks; class?: RioRanks };
  mythic_plus_best_runs?: {
    dungeon: string;
    mythic_level: number;
    num_keystone_upgrades: number;
    score: number;
    clear_time_ms: number;
    par_time_ms: number;
    icon_url: string;
  }[];
}

interface RawTalent {
  entryIndex: number;
  rank: number;
  node: {
    id: number;
    posX: number;
    posY: number;
    subTreeId: number;
    entries: { maxRanks: number; spell: { id: number; name: string; icon: string } | null }[];
  };
}

/** The class tree sits left of this x, the spec tree right of it (hero talents have their own sub tree). */
const SPEC_TREE_X = 8000;

function toTalents(loadout: RawTalent[]): RioTalent[] {
  return loadout.flatMap((t) => {
    const entry = t.node.entries[t.entryIndex] ?? t.node.entries[0];
    // the hero tree's selection point has no spell
    if (!entry?.spell) return [];
    const tree = t.node.subTreeId ? "hero" : t.node.posX < SPEC_TREE_X ? "class" : "spec";
    return [
      {
        node: t.node.id,
        spell: entry.spell.id,
        name: entry.spell.name,
        icon: entry.spell.icon,
        x: t.node.posX,
        y: t.node.posY,
        rank: t.rank,
        maxRank: entry.maxRanks,
        tree,
      },
    ];
  });
}

/** null if Raider.IO doesn't know the character. */
export async function fetchRio(name: string, realm: string, region: Region): Promise<RioProfile | null> {
  const fields = "mythic_plus_scores_by_season:current,mythic_plus_ranks,mythic_plus_best_runs,gear,talents";
  const qs = new URLSearchParams({ region: region.toLowerCase(), realm, name, fields });
  const [raw, tiers] = await Promise.all([get<RawProfile>(`/characters/profile?${qs}`), scoreTiers()]);
  if (!raw) return null;
  const score = raw.mythic_plus_scores_by_season?.[0]?.scores.all ?? 0;
  const ranks = raw.mythic_plus_ranks;
  return {
    score,
    color: tiers.find((t) => score >= t.score)?.rgbHex ?? "#9d9d9d",
    ranks: ranks?.overall && ranks.class ? { overall: ranks.overall, class: ranks.class } : null,
    runs: (raw.mythic_plus_best_runs ?? [])
      .map((r) => ({
        dungeon: r.dungeon,
        level: r.mythic_level,
        upgrades: r.num_keystone_upgrades,
        score: r.score,
        time: r.clear_time_ms,
        par: r.par_time_ms,
        icon: r.icon_url,
      }))
      .sort((a, b) => b.score - a.score),
    url: raw.profile_url,
    // Blizzard's render server: "-avatar.jpg" is the small one, "-inset.jpg" the portrait
    avatar: raw.thumbnail_url ?? null,
    portrait: raw.thumbnail_url?.replace("-avatar.jpg", "-inset.jpg") ?? null,
    itemLevel: raw.gear?.item_level_equipped ?? null,
    gear: Object.entries(raw.gear?.items ?? {})
      .filter(([slot]) => slot !== "shirt" && slot !== "tabard")
      .map(([slot, it]) => ({
        slot,
        id: it.item_id,
        name: it.name,
        level: it.item_level,
        quality: it.item_quality,
        icon: it.icon,
        bonus: it.bonuses ?? [],
        enchant: it.enchant || null,
        gems: it.gems ?? [],
      })),
    spec: raw.active_spec_name ? compactName(raw.active_spec_name) : null,
    talents: raw.talentLoadout?.loadout_text ?? null,
    talentTree: toTalents(raw.talentLoadout?.loadout ?? []),
  };
}
