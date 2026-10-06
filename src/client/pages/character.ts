import type { CharacterResponse, Metric } from "../../shared/api.ts";
import { getCharacter, getCharacterLogs } from "../api.ts";
import { showBudget } from "../budget.ts";
import { errorMessage, pageDom, setBusy, setStatus } from "../dom.ts";
import { esc } from "../format.ts";
import { prefs } from "../prefs.ts";
import { addRecent } from "../recent.ts";
import { type CharacterRoute, navigate, registerPage } from "../router.ts";
import {
  renderCharacterHeader,
  renderCharacterHeaderSkeleton,
  renderCharacterLogs,
  renderCharacterZone,
  renderCharacterZoneSkeleton,
  renderSectionToggle,
} from "../views/character.ts";

const root = pageDom.character;
root.innerHTML = `<div data-head></div><div data-body class="mt-6 space-y-4"></div>`;
const head = root.querySelector("[data-head]") as HTMLElement;
const body = root.querySelector("[data-body]") as HTMLElement;

let character: CharacterResponse | null = null;
let shown: CharacterRoute | null = null;
/** Drops late responses from an old route. */
let generation = 0;

registerPage("character", { show, hide });

function hide() {
  generation++;
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

root.addEventListener("click", async (e) => {
  const target = e.target as HTMLElement;
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
    navigate({ page: "report", code, fight: Number(fightId), player: c.name, tree: null });
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
