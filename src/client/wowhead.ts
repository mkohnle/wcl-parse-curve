// Wowhead's tooltip script: links to wowhead.com items and spells show the in-game tooltip on hover.
// Third-party code, so it's only loaded on pages that show items or talents.

let loaded = false;

export function loadWowheadTooltips() {
  if (loaded) return;
  loaded = true;
  // keep our own link styles and icons
  (window as unknown as { whTooltips: object }).whTooltips = {
    colorLinks: false,
    iconizeLinks: false,
    renameLinks: false,
  };
  const script = document.createElement("script");
  script.src = "https://wow.zamimg.com/js/tooltips.js";
  script.async = true;
  document.head.append(script);
}

/** data-wowhead value for an exact item: item level, bonus IDs, enchant and gems. */
export function itemTooltip(it: {
  id: number;
  level: number;
  bonus: number[];
  enchant: number | null;
  gems: number[];
}) {
  const parts = [`item=${it.id}`, `ilvl=${it.level}`];
  if (it.bonus.length) parts.push(`bonus=${it.bonus.join(":")}`);
  if (it.enchant) parts.push(`ench=${it.enchant}`);
  if (it.gems.length) parts.push(`gems=${it.gems.join(":")}`);
  return parts.join("&");
}
