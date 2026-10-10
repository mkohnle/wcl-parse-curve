import type { CharacterResponse, Metric, RioProfile, TalentTree } from "../../shared/api.ts";
import { getCharacter, getCharacterLogs, getRio, getTalentTree } from "../api.ts";
import { showBudget } from "../budget.ts";
import { errorMessage, pageDom, setBusy, setStatus } from "../dom.ts";
import { esc } from "../format.ts";
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
/** Raider.IO profile of the shown character, for the talents popup. */
let rio: RioProfile | null = null;
let shown: CharacterRoute | null = null;
/** Drops late responses from an old route. */
let generation = 0;

registerPage("character", { show, hide });

function hide() {
  generation++;
  closeTalents();
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
  shown = route;
  prefs.setSection(route.section);
  setStatus("");
  if (!keepHeader) head.innerHTML = renderCharacterHeaderSkeleton();
  body.innerHTML = `${renderSectionToggle(route.section)}${renderCharacterZoneSkeleton()}`;
  setBusy(true);
  try {
    const c = await getCharacter(route.name, route.realm, route.region, route.section);
    if (gen !== generation) return;
    character = c;
    head.innerHTML = renderCharacterHeader(c);
    body.innerHTML = `${renderSectionToggle(route.section)}${renderCharacterZone(c)}`;
    showRio(c, route, gen);
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
    body.innerHTML = keepHeader ? renderSectionToggle(route.section) : "";
  } finally {
    setBusy(false);
    showBudget();
  }
}

/** Raider.IO: score in the header, best run per dungeon in the M+ rows. Optional: failures stay silent. */
async function showRio(c: CharacterResponse, route: CharacterRoute, gen: number) {
  const p = await getRio(c.name, c.realm.slug, c.region).catch(() => null);
  if (!p || gen !== generation) return;
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
  rio = p;
  const gear = slot("gear");
  if (gear) gear.innerHTML = renderRioGear(p);
  if (p.gear.length || p.talentTree.length) loadWowheadTooltips();
  if (route.section !== "mythicPlus") return;
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

root.addEventListener("click", async (e) => {
  const target = e.target as HTMLElement;
  if (target.closest("[data-show-talents]") && rio && character) {
    await openTalents(rio, character.className);
    return;
  }
  const c = character;
  if (!shown) return;

  const section = target.closest<HTMLElement>("[data-section]");
  if (section) {
    navigate({ ...shown, section: section.dataset.section === "mythicPlus" ? "mythicPlus" : "raid" });
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

// ---------- talents popup (on <body>, outside the page root) ----------

function closeTalents() {
  document.querySelector("[data-talents-popup]")?.remove();
}

/** Shows the popup at once, then the spec's full tree (free, from our server); just the chosen talents if that fails. */
async function openTalents(p: RioProfile, className: string) {
  closeTalents();
  const show = (tree: TalentTree | null | undefined) => {
    const html = renderTalents(p, className, tree);
    const open = document.querySelector("[data-talents-popup]");
    if (open) open.outerHTML = html;
    else document.body.insertAdjacentHTML("beforeend", html);
  };
  show(undefined);
  const tree = p.spec ? await getTalentTree(className, p.spec).catch(() => null) : null;
  // closed in the meantime
  if (!document.querySelector("[data-talents-popup]")) return;
  show(tree);
}

document.addEventListener("click", async (e) => {
  const target = e.target as HTMLElement;
  if (!target.closest("[data-talents-popup]")) return;
  // the backdrop or the close button
  if (target.matches("[data-talents-popup]") || target.closest("[data-close-talents]")) {
    closeTalents();
    return;
  }
  const copy = target.closest<HTMLElement>("[data-copy-talents]");
  if (copy) {
    await navigator.clipboard.writeText(copy.dataset.copyTalents ?? "").then(
      // done: plain text instead of the button
      () =>
        copy.replaceWith(
          Object.assign(document.createElement("span"), {
            className: "ml-auto text-sm text-zinc-400",
            textContent: "Copied ✓",
          }),
        ),
      () => setStatus("Couldn't copy to the clipboard.", true),
    );
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeTalents();
});
