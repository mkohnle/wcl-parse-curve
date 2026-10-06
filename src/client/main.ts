import "./style.css";
import type { FightResponse, ReportResponse } from "../shared/api.ts";
import { getBudget, getDistribution, getFight, getReport } from "./api.ts";
import { mountChart } from "./chart.ts";
import { buildCurve } from "./curve.ts";
import { esc } from "./format.ts";
import { DEMO_CODE, parseReportInput } from "./report-input.ts";
import {
  type LabeledParse,
  renderAnalysis,
  renderAnalysisLoading,
  renderFights,
  renderPlayers,
  renderReportHeader,
} from "./views.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = $<HTMLFormElement>("load-form");
const urlInput = $<HTMLInputElement>("url");
const goButton = $<HTMLButtonElement>("go");
const statusEl = $("status");
const reportEl = $("report");
const tooltip = $("tooltip");
const demoButton = $<HTMLButtonElement>("demo");
const budgetEl = $("budget");

reportEl.innerHTML = `<div id="report-head"></div><div id="fights"></div><div id="players"></div><div id="analysis"></div>`;
const headEl = $("report-head");
const fightsEl = $("fights");
const playersEl = $("players");
const analysisEl = $("analysis");

/** Current selection, mirrored in the URL. */
interface Selection {
  code: string;
  fight: number | null;
  player: string | null;
}

let report: ReportResponse | null = null;
let fight: FightResponse | null = null;
let selection: Selection | null = null;
/** Drops late responses from an old selection. */
let generation = 0;

function setStatus(text: string, isError = false) {
  statusEl.innerHTML = isError ? `<span class="text-red-400">${esc(text)}</span>` : esc(text);
}

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

function writeUrl(s: Selection, push: boolean) {
  const params = new URLSearchParams({ report: s.code });
  if (s.fight) params.set("fight", String(s.fight));
  if (s.player) params.set("player", s.player);
  const url = `?${params}`;
  if (url === location.search) return;
  if (push) history.pushState(null, "", url);
  else history.replaceState(null, "", url);
}

function readUrl(): Selection | null {
  const params = new URLSearchParams(location.search);
  const code = params.get("report");
  if (!code) return null;
  return { code, fight: Number(params.get("fight")) || null, player: params.get("player") };
}

/** Load and render `next`, reusing what's on screen. */
async function show(next: Selection, push = true) {
  const gen = ++generation;
  const prev = selection;
  selection = next;
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
    analysisEl.innerHTML = renderAnalysisLoading(player);
    analysisEl.scrollIntoView({ behavior: "smooth", block: "nearest" });

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

    const curve = buildCurve(dist.points, {
      total: byKeyLevel ? null : player.totalParses,
      complete: dist.complete,
      anchor: { amount: player.amount, parse: main.parse },
    });
    analysisEl.innerHTML = renderAnalysis(player, curve, main);
    mountChart($("chart"), tooltip, curve, player, main.parse);
  } catch (e) {
    if (gen === generation) {
      setStatus(errorMessage(e), true);
      if (!report) headEl.innerHTML = "";
    }
  } finally {
    if (next.code !== DEMO_CODE) showBudget();
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

// ---------- events ----------

function submit() {
  const input = parseReportInput(urlInput.value);
  if (!input) {
    setStatus("That doesn't look like a Warcraft Logs report link or code.", true);
    return;
  }
  show({ code: input.code, fight: input.fight, player: null });
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  submit();
});

// load right away when a link is pasted
urlInput.addEventListener("paste", () => setTimeout(submit));

demoButton.addEventListener("click", () => {
  urlInput.value = DEMO_CODE;
  submit();
});

fightsEl.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-fight]");
  if (btn && selection) show({ ...selection, fight: Number(btn.dataset.fight), player: null });
});

playersEl.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-player]");
  if (btn && selection) show({ ...selection, player: btn.dataset.player ?? null });
});

window.addEventListener("popstate", () => {
  const s = readUrl();
  if (s) show(s, false);
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

const initial = readUrl();
if (initial) {
  urlInput.value =
    initial.code === DEMO_CODE ? DEMO_CODE : `https://www.warcraftlogs.com/reports/${initial.code}`;
  show(initial, false);
} else {
  showBudget();
}
