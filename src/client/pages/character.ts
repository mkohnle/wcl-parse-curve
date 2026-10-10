import type { CharacterResponse, Metric, RioProfile, ZoneList } from "../../shared/api.ts";
import { getCharacter, getCharacterLogs, getRio, getTalentTree, getZones } from "../api.ts";
import { showBudget } from "../budget.ts";
import { errorMessage, pageDom, setBusy, setStatus } from "../dom.ts";
import { esc } from "../format.ts";
import { closePopup, isPopupOpen, showPopup } from "../popup.ts";
import { prefs } from "../prefs.ts";
import { addRecent } from "../recent.ts";
import { type CharacterRoute, navigate, registerPage } from "../router.ts";
import {
  dungeonKey,
  renderCharacterHeader,
  renderCharacterHeaderSkeleton,
  renderCharacterLogs,
  renderCharacterZone,
  renderCharacterZoneSkeleton,
  renderSectionToggle,
} from "../views/character.ts";
import {
  renderRioAvatar,
  renderRioBadge,
  renderRioGear,
  renderRioStars,
  renderRioTime,
} from "../views/rio.ts";
import { renderTalents } from "../views/talents.ts";
import { classColor } from "../wow.ts";
import { loadWowheadTooltips } from "../wowhead.ts";

const root = pageDom.character;
root.innerHTML = `<div data-head></div><div data-body class="mt-6 space-y-4"></div>`;
const head = root.querySelector("[data-head]") as HTMLElement;
const body = root.querySelector("[data-body]") as HTMLElement;

let character: CharacterResponse | null = null;
/** Raids and seasons for the picker; kept across sections. */
let zoneList: ZoneList | null = null;
/** Raider.IO profile of the shown character, for the talents popup. */
let rio: RioProfile | null = null;
let shown: CharacterRoute | null = null;
/** Drops late responses from an old route. */
let generation = 0;

registerPage("character", { show, hide });

function hide() {
  generation++;
  closePopup();
  rio = null;
  character = null;
  shown = null;
  head.innerHTML = body.innerHTML = "";
}

const sameCharacter = (a: CharacterRoute | null, b: CharacterRoute) =>
  a !== null && a.name.toLowerCase() === b.name.toLowerCase() && a.realm === b.realm && a.region === b.region;

/** Loads only the selected section (raid or M+); switching keeps the header. */
async function show(route: CharacterRoute, prev: CharacterRoute | null) {
  const gen = ++generation;
  const keepHeader = sameCharacter(prev, route) && character !== null;
  const zones = getZones().catch(() => null);
  shown = route;
  prefs.setSection(route.section);
  setStatus("");
  if (!keepHeader) head.innerHTML = renderCharacterHeaderSkeleton();
  body.innerHTML = `${renderSectionToggle(route.section, zoneList, route.zone)}${renderCharacterZoneSkeleton()}`;
  setBusy(true);
  try {
    const [c, list] = await Promise.all([
      getCharacter(route.name, route.realm, route.region, route.section, route.zone, route.difficulty),
      zones,
    ]);
    if (gen !== generation) return;
    character = c;
    zoneList = list;
    // same character: keep the header (picture, gear) as it is
    if (!keepHeader) head.innerHTML = renderCharacterHeader(c);
    body.innerHTML = `${renderSectionToggle(route.section, list, route.zone, c.zone?.difficulty)}${renderCharacterZone(c)}`;
    // Raider.IO's runs are for the current season only
    showRio(c, route, gen, !keepHeader, !list || c.zone?.id === list.current[route.section]);
    addRecent({
      kind: "char",
      name: c.name,
      realm: c.realm.slug,
      realmName: c.realm.name,
      region: c.region,
      className: c.className,
    });
  } catch (e) {
    if (gen !== generation) return;
    setStatus(errorMessage(e), true);
    if (!keepHeader) head.innerHTML = "";
    body.innerHTML = keepHeader ? renderSectionToggle(route.section, zoneList, route.zone) : "";
  } finally {
    setBusy(false);
    showBudget();
  }
}

/** Raider.IO: score in the header, best run per dungeon in the M+ rows. Optional: failures stay silent. */
/** newHeader: fill in the header's Raider.IO parts (only when it was just rendered). */
async function showRio(
  c: CharacterResponse,
  route: CharacterRoute,
  gen: number,
  newHeader: boolean,
  currentSeason: boolean,
) {
  const p = await getRio(c.name, c.realm.slug, c.region).catch(() => null);
  if (!p || gen !== generation) return;
  rio = p;
  if (newHeader) showRioHeader(c, p);
  if (route.section !== "mythicPlus" || !currentSeason) return;
  for (const run of p.runs) {
    const key = dungeonKey(run.dungeon);
    const stars = body.querySelector<HTMLElement>(`[data-rio-stars="${key}"]`);
    const time = body.querySelector<HTMLElement>(`[data-rio-time="${key}"]`);
    if (!stars || !time) continue;
    const sameKey = Number(stars.dataset.keyLevel) === run.level;
    if (sameKey) stars.innerHTML = renderRioStars(run);
    time.innerHTML = renderRioTime(run, sameKey);
  }
}

/** Score, picture, portrait and gear in the header. */
function showRioHeader(c: CharacterResponse, p: RioProfile) {
  const slot = (name: string) => head.querySelector<HTMLElement>(`[data-rio-${name}]`);
  const badge = slot("badge");
  if (badge) badge.innerHTML = renderRioBadge(p, c.className, c.realm.name);
  const avatar = slot("avatar");
  const avatarHtml = renderRioAvatar(p, classColor(c.className));
  if (avatar && avatarHtml) avatar.innerHTML = avatarHtml;
  const portrait = slot("portrait");
  if (portrait && p.portrait) {
    // fades in once loaded; a gradient blends it into the panel
    const pic = new Image();
    pic.onload = () => {
      portrait.style.backgroundImage = `linear-gradient(90deg, var(--color-panel) 0%, transparent 60%), url(${p.portrait})`;
      portrait.classList.replace("opacity-0", "opacity-40");
    };
    pic.src = p.portrait;
  }
  const gear = slot("gear");
  if (gear) gear.innerHTML = renderRioGear(p);
  if (p.gear.length || p.talentTree.length) loadWowheadTooltips();
}

root.addEventListener("change", (e) => {
  const select = (e.target as HTMLElement).closest<HTMLSelectElement>("[data-zone]");
  if (!select || !shown) return;
  const id = Number(select.value);
  navigate({ ...shown, zone: id === zoneList?.current[shown.section] ? null : id, difficulty: null });
});

root.addEventListener("click", async (e) => {
  const target = e.target as HTMLElement;
  if (target.closest("[data-show-talents]") && rio && character) {
    await openTalents(rio, character.className);
    return;
  }
  const c = character;
  if (!shown) return;

  const level = target.closest<HTMLElement>("[data-difficulty-pick]");
  if (level) {
    navigate({ ...shown, difficulty: Number(level.dataset.difficultyPick) });
    return;
  }

  const section = target.closest<HTMLElement>("[data-section]");
  if (section) {
    navigate({
      ...shown,
      section: section.dataset.section === "mythicPlus" ? "mythicPlus" : "raid",
      zone: null,
      difficulty: null,
    });
    return;
  }
  if (!c) return;

  // a log: open it on the curve
  const log = target.closest<HTMLElement>("[data-log]");
  if (log) {
    const [code, fightId] = (log.dataset.log ?? "").split(":");
    navigate({ page: "report", code, fight: Number(fightId), player: c.name, tree: null, metric: null });
    return;
  }

  // a boss or dungeon: toggle its logs
  const boss = target.closest<HTMLButtonElement>("[data-boss]");
  if (boss) await toggleLogs(c, boss);
});

async function toggleLogs(c: CharacterResponse, boss: HTMLButtonElement) {
  const encounterId = Number(boss.dataset.boss);
  const list = root.querySelector<HTMLElement>(`[data-logs="${encounterId}"]`);
  if (!list) return;
  if (!list.classList.contains("hidden")) {
    list.classList.add("hidden");
    return;
  }
  list.classList.remove("hidden");
  list.innerHTML = `<div class="animate-pulse px-3 py-2 text-sm text-zinc-500">Loading logs…</div>`;
  const mythicPlus = c.zone?.mythicPlus ?? false;
  try {
    const logs = await getCharacterLogs(
      c.name,
      c.realm.slug,
      c.region,
      encounterId,
      boss.dataset.metric as Metric,
      Number(boss.dataset.difficulty),
      mythicPlus,
    );
    list.innerHTML = renderCharacterLogs(logs, c.className, mythicPlus);
  } catch (err) {
    list.innerHTML = `<div class="px-3 py-2 text-sm text-red-400">${esc(errorMessage(err))}</div>`;
  } finally {
    showBudget();
  }
}

/** Shows the popup at once, then the spec's full tree; just the chosen talents if that fails. */
async function openTalents(p: RioProfile, className: string) {
  showPopup(renderTalents(p, className, undefined));
  const tree = p.spec ? await getTalentTree(className, p.spec).catch(() => null) : null;
  if (isPopupOpen()) showPopup(renderTalents(p, className, tree));
}
