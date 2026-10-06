// Game-specific presentation data: class colors, parse tiers, icons.

const ASSETS = "https://assets.rpglogs.com/img/warcraft";

export const specIcon = (className: string, spec: string) => `${ASSETS}/icons/large/${className}-${spec}.jpg`;
export const classIcon = (className: string) => `${ASSETS}/icons/large/${className}.jpg`;
// M+ dungeons in reports carry a 50,000 / 100,000 offset (e.g. 112521 → 12521)
export const bossIcon = (encounterId: number) => `${ASSETS}/bosses/${encounterId % 50_000}-icon.jpg`;
export const zoneIcon = (zoneId: number) => `${ASSETS}/zones/zone-${zoneId}.png`;
export const talentIcon = (icon: string) => `https://wow.zamimg.com/images/wow/icons/large/${icon}.jpg`;

const CLASS_COLORS: Record<string, string> = {
  DeathKnight: "#C41E3A",
  DemonHunter: "#A330C9",
  Druid: "#FF7C0A",
  Evoker: "#33937F",
  Hunter: "#AAD372",
  Mage: "#3FC7EB",
  Monk: "#00FF98",
  Paladin: "#F48CBA",
  Priest: "#FFFFFF",
  Rogue: "#FFF468",
  Shaman: "#0070DD",
  Warlock: "#8788EE",
  Warrior: "#C69B6D",
};
export const classColor = (className: string) => CLASS_COLORS[className] ?? "#d4d4d8";

/** Parse tiers, highest first. */
export const TIERS = [
  { min: 100, name: "Gold", color: "#e5cc80" },
  { min: 99, name: "Pink", color: "#e268a8" },
  { min: 95, name: "Orange", color: "#ff8000" },
  { min: 75, name: "Purple", color: "#a335ee" },
  { min: 50, name: "Blue", color: "#0070ff" },
  { min: 25, name: "Green", color: "#1eff00" },
  { min: 0, name: "Gray", color: "#9d9d9d" },
] as const;

export const tierColor = (parse: number) =>
  (TIERS.find((t) => Math.floor(parse) >= t.min) ?? TIERS[TIERS.length - 1]).color;

const DIFFICULTIES: Record<number, string> = {
  1: "LFR",
  3: "Normal",
  4: "Heroic",
  5: "Mythic",
  10: "Mythic+",
};
export const difficultyName = (d: number) => DIFFICULTIES[d] ?? `Difficulty ${d}`;
