import "./style.css";
import type {
  CharacterResponse,
  FightResponse,
  Metric,
  Realm,
  Region,
  ReportResponse,
} from "../shared/api.ts";
import {
  captureAdminToken,
  getBudget,
  getCharacter,
  getCharacterLogs,
  getDistribution,
  getFight,
  getRealms,
  getReport,
} from "./api.ts";
import { mountChart } from "./chart.ts";
import { buildCurve } from "./curve.ts";
import { esc } from "./format.ts";
import { sampledShare, treeCurve, treeShare } from "./hero-tree.ts";
import { DEMO_CODE, matchRealms, parseCharacterInput, parseReportInput } from "./report-input.ts";
import {
  type LabeledParse,
  type RecentItem,
  renderAnalysis,
  renderAnalysisLoading,
  renderCharacter,
  renderCharacterLogs,
  renderFights,
  renderHeroCurve,
  renderPlayers,
  renderRecent,
  renderReportHeader,
} from "./views.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = $<HTMLFormElement>("load-form");
const urlInput = $<HTMLInputElement>("url");
const goButton = $<HTMLButtonElement>("go");
const regionButton = $<HTMLButtonElement>("region");
const suggestEl = $("suggest");
const statusEl = $("status");
const reportEl = $("report");
const tooltip = $("tooltip");
const budgetEl = $("budget");
const heroEl = $("hero");
const recentEl = $("recent");

reportEl.innerHTML = `<div id="character"></div><div id="report-head"></div><div id="fights"></div><div id="players"></div><div id="analysis"></div>`;
const charEl = $("character");
const headEl = $("report-head");
const fightsEl = $("fights");
const playersEl = $("players");
const analysisEl = $("analysis");

/** Current selection, mirrored in the URL. */
interface Selection {
  code: string;
  fight: number | null;
  player: string | null;
  /** hero tree id, null = whole spec */
  tree: number | null;
}

/** A character, mirrored in the URL as ?char=Name-realm-slug-EU */
interface CharacterRef {
  name: string;
  /** realm slug */
  realm: string;
  region: Region;
}

let report: ReportResponse | null = null;
let fight: FightResponse | null = null;
let selection: Selection | null = null;
let character: CharacterResponse | null = null;
/** Drops late responses from an old selection. */
let generation = 0;

function setStatus(text: string, isError = false) {
  statusEl.innerHTML = isError ? `<span class="text-red-400">${esc(text)}</span>` : esc(text);
}

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

function setUrl(params: URLSearchParams, push: boolean) {
  const url = `?${params}`;
  if (url === location.search) return;
  if (push) history.pushState(null, "", url);
  else history.replaceState(null, "", url);
}

function writeUrl(s: Selection, push: boolean) {
  const params = new URLSearchParams({ report: s.code });
  if (s.fight) params.set("fight", String(s.fight));
  if (s.player) params.set("player", s.player);
  if (s.tree) params.set("tree", String(s.tree));
  setUrl(params, push);
}

function readUrl(): Selection | CharacterRef | null {
  const params = new URLSearchParams(location.search);
  const char = params.get("char")?.match(/^([^-]+)-(.+)-(EU|US)$/);
  if (char) return { name: char[1], realm: char[2], region: char[3] as Region };
  const code = params.get("report");
  if (!code) return null;
  return {
    code,
    fight: Number(params.get("fight")) || null,
    player: params.get("player"),
    tree: Number(params.get("tree")) || null,
  };
}

const isCharacterRef = (s: Selection | CharacterRef): s is CharacterRef => "realm" in s;

// ---------- landing ----------

const RECENT_KEY = "recent";
const MAX_RECENT = 6;

function loadRecent(): RecentItem[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function addRecent(item: RecentItem) {
  const id = (it: RecentItem) =>
    it.kind === "report" ? it.code : `${it.name}-${it.realm}-${it.region}`.toLowerCase();
  const items = [item, ...loadRecent().filter((it) => id(it) !== id(item))].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(items));
  } catch {}
}

/** The front page: key visual and recently viewed; hidden once something is open. */
function showLanding(on: boolean) {
  heroEl.innerHTML = on ? renderHeroCurve() : "";
  recentEl.innerHTML = on ? renderRecent(loadRecent()) : "";
}

recentEl.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-recent]");
  const it = btn && loadRecent()[Number(btn.dataset.recent)];
  if (!it) return;
  if (it.kind === "report") {
    urlInput.value = `https://www.warcraftlogs.com/reports/${it.code}`;
    show({ code: it.code, fight: null, player: null, tree: null });
  } else {
    urlInput.value = `${it.name}-${it.realmName}`;
    showCharacter({ name: it.name, realm: it.realm, region: it.region as Region });
  }
});

/** Load and render `next`, reusing what's on screen. */
async function show(next: Selection, push = true) {
  const gen = ++generation;
  const prev = selection;
  selection = next;
  character = null;
  showLanding(false);
  charEl.innerHTML = "";
  writeUrl(next, push);
  setStatus("");

  try {
    // report + fight list
    if (prev?.code !== next.code || !report) {
      report = null;
      fight = null;
      headEl.innerHTML = fightsEl.innerHTML = playersEl.innerHTML = analysisEl.innerHTML = "";
      setStatus("Loading report…");
      goButton.disabled = true;
      const r = await getReport(next.code).finally(() => {
        goButton.disabled = false;
      });
      if (gen !== generation) return;
      if (!r.fights.length) throw new Error("No boss fights found in this report");
      report = r;
      setStatus("");
      if (next.code !== DEMO_CODE)
        addRecent({ kind: "report", code: next.code, title: r.title, zoneId: r.zone?.id ?? null });
      headEl.innerHTML = renderReportHeader(next.code, r);
      // a single fight needs no choice
      if (!next.fight && r.fights.length === 1) {
        next.fight = r.fights[0].id;
        writeUrl(next, false);
      }
    }
    fightsEl.innerHTML = renderFights(report.fights, report.zone?.id, next.fight);

    // players of the selected fight
    if (!next.fight) {
      playersEl.innerHTML = analysisEl.innerHTML = "";
      return;
    }
    if (prev?.fight !== next.fight || prev.code !== next.code || !fight) {
      fight = null;
      analysisEl.innerHTML = "";
      playersEl.innerHTML = `<div class="panel animate-pulse p-6 text-zinc-500">Loading players…</div>`;
      const f = await getFight(next.code, next.fight);
      if (gen !== generation) return;
      fight = f;
    }
    const meta = report.fights.find((f) => f.id === next.fight);
    const isMythicPlus = (meta?.keystoneLevel ?? 0) > 0;
    playersEl.innerHTML = renderPlayers(fight.players, next.player, isMythicPlus);

    // analysis of the selected player
    const player = fight.players.find((p) => p.name === next.player);
    if (!player) {
      analysisEl.innerHTML = "";
      return;
    }
    // only the hero tree changed: re-render in place, no placeholder, no scroll
    const sameView = prev?.code === next.code && prev.fight === next.fight && prev.player === next.player;
    if (!sameView) {
      analysisEl.innerHTML = renderAnalysisLoading(player);
      analysisEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    // overall M+ parse weighs key level; use the key level leaderboard instead
    const byKeyLevel = isMythicPlus && player.bracket != null && player.bracketParse != null;
    const main: LabeledParse = byKeyLevel
      ? { label: `+${meta?.keystoneLevel} parse`, parse: player.bracketParse as number }
      : { label: "Parse", parse: player.parse };

    const dist = await getDistribution({
      enc: meta?.encounterID || fight.enc,
      diff: isMythicPlus ? 0 : meta?.difficulty || fight.diff,
      part: fight.part || 0,
      bracket: byKeyLevel ? (player.bracket as number) : 0,
      metric: player.metric,
      cls: player.cls,
      spec: player.spec,
    });
    if (gen !== generation) return;

    const specCurve = buildCurve(dist.points, {
      total: byKeyLevel ? null : player.totalParses,
      complete: dist.complete,
      anchor: { amount: player.amount, parse: main.parse },
    });

    // optional hero tree view: rank only among that tree
    const tree = dist.heroTrees.find((t) => t.id === next.tree);
    const share = tree ? treeShare(dist.points, dist.trees, tree.id) : null;
    const curve = share ? treeCurve(specCurve, share) : specCurve;
    const shown: LabeledParse =
      tree && share ? { label: `Among ${tree.name}`, parse: curve.percentileOf(player.amount) } : main;
    const trees = dist.heroTrees.map((t) => ({ ...t, share: sampledShare(dist.trees, t.id) }));

    analysisEl.innerHTML = renderAnalysis(player, curve, shown, trees, share ? (tree?.id ?? null) : null);
    const logs = dist.points.flatMap(([rank, amount], i) => {
      const log = dist.logs[i];
      return log && (!share || dist.trees[i] === tree?.id) ? [{ rank, amount, log }] : [];
    });
    mountChart($("chart"), tooltip, curve, player, shown.parse, logs);
  } catch (e) {
    if (gen === generation) {
      setStatus(errorMessage(e), true);
      if (!report) headEl.innerHTML = "";
    }
  } finally {
    if (next.code !== DEMO_CODE) showBudget();
  }
}

/** Character page: best and median parse per boss. */
async function showCharacter(ref: CharacterRef, push = true) {
  const gen = ++generation;
  selection = null;
  report = null;
  fight = null;
  showLanding(false);
  headEl.innerHTML = fightsEl.innerHTML = playersEl.innerHTML = analysisEl.innerHTML = charEl.innerHTML = "";
  setUrl(new URLSearchParams({ char: `${ref.name}-${ref.realm}-${ref.region}` }), push);
  setStatus("Loading character…");
  goButton.disabled = true;
  try {
    const c = await getCharacter(ref.name, ref.realm, ref.region);
    if (gen !== generation) return;
    character = c;
    setStatus("");
    addRecent({
      kind: "char",
      name: c.name,
      realm: c.realm.slug,
      realmName: c.realm.name,
      region: c.region,
      cls: c.cls,
    });
    charEl.innerHTML = renderCharacter(c);
  } catch (e) {
    if (gen === generation) setStatus(errorMessage(e), true);
  } finally {
    goButton.disabled = false;
    showBudget();
  }
}

/** API points left, shown in the footer. */
async function showBudget() {
  const b = await getBudget().catch(() => null);
  if (!b) {
    budgetEl.textContent = "";
    return;
  }
  const minutes = Math.max(1, Math.ceil(b.resetIn / 60));
  budgetEl.textContent = `Warcraft Logs API: ${Math.max(0, Math.floor(b.remaining))} of ${b.limit} points left this hour · resets in ${minutes} min`;
}

// ---------- search ----------

const REGION_KEY = "region";
let region: Region = "EU";
try {
  if (localStorage.getItem(REGION_KEY) === "US") region = "US";
} catch {}
regionButton.textContent = region;

regionButton.addEventListener("click", () => {
  region = region === "EU" ? "US" : "EU";
  regionButton.textContent = region;
  try {
    localStorage.setItem(REGION_KEY, region);
  } catch {}
  updateSuggestions();
  urlInput.focus();
});

/** "Name-Realm" typed and not a report link. */
const characterInput = (value: string) => (/reports\//.test(value) ? null : parseCharacterInput(value));

async function submit() {
  hideSuggestions();
  const value = urlInput.value;
  const char = characterInput(value);
  if (char) {
    try {
      const realm = matchRealms(await getRealms(region), char.realm)[0];
      if (!realm) {
        setStatus(`Unknown ${region} realm "${char.realm}".`, true);
        return;
      }
      showCharacter({ name: char.name, realm: realm.slug, region });
    } catch (e) {
      setStatus(errorMessage(e), true);
    }
    return;
  }
  const input = parseReportInput(value);
  if (!input) {
    setStatus("Paste a Warcraft Logs report link, or type a character as Name-Realm.", true);
    return;
  }
  show({ code: input.code, fight: input.fight, player: null, tree: null });
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  submit();
});

// load right away when a link is pasted
urlInput.addEventListener("paste", () => setTimeout(submit));

// realm suggestions while typing "Name-Re…"
let suggestions: Realm[] = [];
let active = -1;

function hideSuggestions() {
  suggestions = [];
  active = -1;
  suggestEl.classList.add("hidden");
}

function renderSuggestions(name: string) {
  suggestEl.innerHTML = suggestions
    .map(
      (r, i) =>
        `<li data-realm="${i}" class="cursor-pointer px-3 py-1.5 ${i === active ? "bg-panel-2 text-gold" : "text-zinc-300 hover:bg-panel-2"}">
          <span class="text-zinc-500">${esc(name)}-</span>${esc(r.name)}
        </li>`,
    )
    .join("");
  suggestEl.classList.toggle("hidden", !suggestions.length);
}

async function updateSuggestions() {
  const char = characterInput(urlInput.value);
  if (!char) {
    hideSuggestions();
    return;
  }
  const realms = await getRealms(region).catch(() => []);
  const current = characterInput(urlInput.value);
  if (!current) return;
  const matches = matchRealms(realms, current.realm);
  // nothing to suggest once the realm is typed out exactly
  suggestions = matches[0]?.name.toLowerCase() === current.realm.toLowerCase() ? [] : matches.slice(0, 8);
  active = -1;
  renderSuggestions(current.name);
}

function pickSuggestion(i: number) {
  const char = characterInput(urlInput.value);
  const realm = suggestions[i];
  if (!char || !realm) return;
  urlInput.value = `${char.name}-${realm.name}`;
  submit();
}

urlInput.addEventListener("input", updateSuggestions);
urlInput.addEventListener("blur", () => setTimeout(hideSuggestions, 150));
urlInput.addEventListener("keydown", (e) => {
  if (!suggestions.length) return;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    const step = e.key === "ArrowDown" ? 1 : -1;
    active = (active + step + suggestions.length) % suggestions.length;
    renderSuggestions(characterInput(urlInput.value)?.name ?? "");
  } else if (e.key === "Enter" && active >= 0) {
    e.preventDefault();
    pickSuggestion(active);
  } else if (e.key === "Escape") {
    hideSuggestions();
  }
});
// mousedown, so it fires before the input's blur hides the list
suggestEl.addEventListener("mousedown", (e) => {
  const li = (e.target as HTMLElement).closest<HTMLElement>("[data-realm]");
  if (!li) return;
  e.preventDefault();
  pickSuggestion(Number(li.dataset.realm));
});

// ---------- clicks ----------

fightsEl.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-fight]");
  if (btn && selection) show({ ...selection, fight: Number(btn.dataset.fight), player: null, tree: null });
});

playersEl.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-player]");
  if (btn && selection) show({ ...selection, player: btn.dataset.player ?? null, tree: null });
});

analysisEl.addEventListener("click", async (e) => {
  const target = e.target as HTMLElement;
  const btn = target.closest<HTMLElement>("[data-tree]");
  if (btn && selection) show({ ...selection, tree: Number(btn.dataset.tree) || null });

  // player name: open their character page
  const player = fight?.players.find((p) => p.name === selection?.player);
  if (!target.closest("[data-character]") || !player?.realm) return;
  const playerRegion = player.region as Region;
  try {
    const realm = matchRealms(await getRealms(playerRegion), player.realm)[0];
    if (!realm) throw new Error(`Unknown realm "${player.realm}"`);
    urlInput.value = `${player.name}-${realm.name}`;
    showCharacter({ name: player.name, realm: realm.slug, region: playerRegion });
  } catch (err) {
    setStatus(errorMessage(err), true);
  }
});

charEl.addEventListener("click", async (e) => {
  const target = e.target as HTMLElement;
  const c = character;
  if (!c) return;

  // a log: open it on the curve
  const log = target.closest<HTMLElement>("[data-log]");
  if (log) {
    const [code, fightId] = (log.dataset.log ?? "").split(":");
    show({ code, fight: Number(fightId), player: c.name, tree: null });
    return;
  }

  // a boss: toggle its logs
  const boss = target.closest<HTMLButtonElement>("[data-boss]");
  if (!boss) return;
  const enc = Number(boss.dataset.boss);
  const list = charEl.querySelector<HTMLElement>(`[data-logs="${enc}"]`);
  if (!list) return;
  if (!list.classList.contains("hidden")) {
    list.classList.add("hidden");
    return;
  }
  list.classList.remove("hidden");
  list.innerHTML = `<div class="px-3 py-2 text-sm text-zinc-500">Loading logs…</div>`;
  const zone = c.zones.find((z) => z.bosses.some((b) => b.encounterID === enc));
  try {
    const logs = await getCharacterLogs(
      c.name,
      c.realm.slug,
      c.region,
      enc,
      boss.dataset.metric as Metric,
      Number(boss.dataset.diff),
      zone?.mythicPlus ?? false,
    );
    list.innerHTML = renderCharacterLogs(logs, c.cls, zone?.mythicPlus ?? false);
  } catch (err) {
    list.innerHTML = `<div class="px-3 py-2 text-sm text-red-400">${esc(errorMessage(err))}</div>`;
  } finally {
    showBudget();
  }
});

function showFromUrl(push: boolean) {
  const s = readUrl();
  if (!s) return false;
  if (isCharacterRef(s)) {
    region = s.region;
    regionButton.textContent = region;
    urlInput.value = `${s.name}-${s.realm}`;
    showCharacter(s, push);
  } else {
    urlInput.value = s.code === DEMO_CODE ? DEMO_CODE : `https://www.warcraftlogs.com/reports/${s.code}`;
    show(s, push);
  }
  return true;
}

window.addEventListener("popstate", () => {
  if (showFromUrl(false)) return;
  generation++;
  selection = null;
  report = null;
  fight = null;
  character = null;
  headEl.innerHTML = fightsEl.innerHTML = playersEl.innerHTML = analysisEl.innerHTML = charEl.innerHTML = "";
  urlInput.value = "";
  setStatus("");
  showLanding(true);
});

// missing boss icon: use the fallback, else hide
document.addEventListener(
  "error",
  (e) => {
    const target = e.target;
    if (!(target instanceof HTMLImageElement)) return;
    const fallback = target.dataset.fallback;
    if (fallback) {
      delete target.dataset.fallback;
      target.src = fallback;
    } else {
      target.style.visibility = "hidden";
    }
  },
  true,
);

// ---------- start ----------

captureAdminToken();
if (!showFromUrl(false)) {
  showLanding(true);
  showBudget();
}
