import type { Fight, FightResponse, Player, Region, ReportResponse } from "../../shared/api.ts";
import { getDistribution, getFight, getRealms, getReport } from "../api.ts";
import { showBudget } from "../budget.ts";
import { mountChart } from "../chart.ts";
import { buildCurve } from "../curve.ts";
import { dom, errorMessage, pageDom, setBusy, setStatus } from "../dom.ts";
import { sampledShare, treeCurve, treeShare } from "../hero-tree.ts";
import { prefs } from "../prefs.ts";
import { addRecent } from "../recent.ts";
import { navigate, type ReportRoute, registerPage, replaceRoute } from "../router.ts";
import { DEMO_CODE, matchRealms } from "../search-input.ts";
import { type LabeledParse, renderAnalysis, renderAnalysisLoading } from "../views/analysis.ts";
import {
  renderFights,
  renderFightsSkeleton,
  renderPlayers,
  renderPlayersSkeleton,
  renderReportHeader,
  renderReportHeaderSkeleton,
} from "../views/report.ts";

const { reportHead, fights: fightsEl, players: playersEl, analysis: analysisEl } = pageDom;

let report: ReportResponse | null = null;
let fight: FightResponse | null = null;
let shown: ReportRoute | null = null;
/** Drops late responses from an old route. */
let generation = 0;

registerPage("report", { show, hide });

function hide() {
  generation++;
  report = null;
  fight = null;
  shown = null;
  reportHead.innerHTML = fightsEl.innerHTML = playersEl.innerHTML = analysisEl.innerHTML = "";
}

/** Report → fight → player analysis; each step renders as soon as its data is in. */
async function show(route: ReportRoute, prev: ReportRoute | null) {
  const gen = ++generation;
  const isCurrent = () => gen === generation;
  shown = route;
  setStatus("");

  const sameReport = prev?.code === route.code && report !== null;
  const sameFight = sameReport && prev?.fight === route.fight && fight !== null;
  // the fight doesn't need the report: load both at once
  const fightRequest = route.fight && !sameFight ? getFight(route.code, route.fight) : null;
  fightRequest?.catch(() => {}); // awaited below; avoids an unhandled rejection if the report fails first

  try {
    const r = sameReport && report ? report : await loadReport(route, isCurrent);
    if (!r) return;

    // a single fight needs no choice
    if (!route.fight && r.fights.length === 1) {
      route = { ...route, fight: r.fights[0].id };
      shown = route;
      replaceRoute(route);
    }
    fightsEl.innerHTML = renderFights(r.fights, r.zone?.id, route.fight);
    if (!route.fight) {
      playersEl.innerHTML = analysisEl.innerHTML = "";
      return;
    }

    const f = sameFight && fight ? fight : await loadFight(route.code, route.fight, fightRequest, isCurrent);
    if (!f) return;
    const meta = r.fights.find((x) => x.id === route.fight);
    const isMythicPlus = (meta?.keystoneLevel ?? 0) > 0;
    playersEl.innerHTML = renderPlayers(f.players, route.player, isMythicPlus);

    const player = f.players.find((p) => p.name === route.player);
    if (!player) {
      analysisEl.innerHTML = "";
      return;
    }
    await showAnalysis(route, prev, player, f, meta, isCurrent);
  } catch (e) {
    if (!isCurrent()) return;
    setStatus(errorMessage(e), true);
    if (!report) reportHead.innerHTML = fightsEl.innerHTML = "";
    if (!fight) playersEl.innerHTML = analysisEl.innerHTML = "";
  } finally {
    if (route.code !== DEMO_CODE) showBudget();
  }
}

async function loadReport(route: ReportRoute, isCurrent: () => boolean): Promise<ReportResponse | null> {
  report = null;
  fight = null;
  reportHead.innerHTML = renderReportHeaderSkeleton();
  fightsEl.innerHTML = renderFightsSkeleton();
  playersEl.innerHTML = route.fight ? renderPlayersSkeleton() : "";
  analysisEl.innerHTML = "";
  setBusy(true);
  const r = await getReport(route.code).finally(() => setBusy(false));
  if (!isCurrent()) return null;
  if (!r.fights.length) throw new Error("No boss fights found in this report");
  report = r;
  reportHead.innerHTML = renderReportHeader(route.code, r);
  if (route.code !== DEMO_CODE) {
    addRecent({ kind: "report", code: route.code, title: r.title, zoneId: r.zone?.id ?? null });
  }
  return r;
}

async function loadFight(
  code: string,
  fightId: number,
  request: Promise<FightResponse> | null,
  isCurrent: () => boolean,
): Promise<FightResponse | null> {
  fight = null;
  analysisEl.innerHTML = "";
  playersEl.innerHTML = renderPlayersSkeleton();
  const f = await (request ?? getFight(code, fightId));
  if (!isCurrent()) return null;
  fight = f;
  return f;
}

async function showAnalysis(
  route: ReportRoute,
  prev: ReportRoute | null,
  player: Player,
  f: FightResponse,
  meta: Fight | undefined,
  isCurrent: () => boolean,
) {
  // overall M+ parse weighs key level; use the key level leaderboard instead
  const isMythicPlus = (meta?.keystoneLevel ?? 0) > 0;
  const byKeyLevel = isMythicPlus && player.bracket != null && player.bracketParse != null;
  const main: LabeledParse = byKeyLevel
    ? { label: `+${meta?.keystoneLevel} parse`, parse: player.bracketParse as number }
    : { label: "Parse", parse: player.parse };

  // only the hero tree changed: re-render in place, no placeholder, no scroll
  const sameView = prev?.code === route.code && prev.fight === route.fight && prev.player === route.player;
  if (!sameView) {
    analysisEl.innerHTML = renderAnalysisLoading(player, main);
    analysisEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  const dist = await getDistribution({
    encounterId: meta?.encounterId || f.encounterId,
    difficulty: isMythicPlus ? 0 : meta?.difficulty || f.difficulty,
    partition: f.partition || 0,
    bracket: byKeyLevel ? (player.bracket as number) : 0,
    metric: player.metric,
    className: player.className,
    spec: player.spec,
  });
  if (!isCurrent()) return;

  const specCurve = buildCurve(dist.points, {
    total: byKeyLevel ? null : player.totalParses,
    complete: dist.complete,
    anchor: { amount: player.amount, parse: main.parse },
  });

  // optional hero tree view: rank only among that tree
  const tree = dist.heroTrees.find((t) => t.id === route.tree);
  const share = tree ? treeShare(dist.points, dist.trees, tree.id) : null;
  const curve = share ? treeCurve(specCurve, share) : specCurve;
  const shownParse: LabeledParse =
    tree && share ? { label: `Among ${tree.name}`, parse: curve.percentileOf(player.amount) } : main;
  const trees = dist.heroTrees.map((t) => ({ ...t, share: sampledShare(dist.trees, t.id) }));

  analysisEl.innerHTML = renderAnalysis(player, curve, shownParse, trees, share ? (tree?.id ?? null) : null);
  const logs = dist.points.flatMap(([rank, amount], i) => {
    const log = dist.logs[i];
    return log && (!share || dist.trees[i] === tree?.id) ? [{ rank, amount, log }] : [];
  });
  mountChart(
    analysisEl.querySelector("#chart") as HTMLElement,
    dom.tooltip,
    curve,
    player,
    shownParse.parse,
    logs,
  );
}

// ---------- clicks ----------

fightsEl.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-fight]");
  if (btn && shown) navigate({ ...shown, fight: Number(btn.dataset.fight), player: null, tree: null });
});

playersEl.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-player]");
  if (btn && shown) navigate({ ...shown, player: btn.dataset.player ?? null, tree: null });
});

analysisEl.addEventListener("click", async (e) => {
  const target = e.target as HTMLElement;
  const treeButton = target.closest<HTMLElement>("[data-tree]");
  if (treeButton && shown) {
    navigate({ ...shown, tree: Number(treeButton.dataset.tree) || null });
    return;
  }
  if (target.closest("[data-character]")) await openCharacter();
});

/** The player's name: open their character page. */
async function openCharacter() {
  const player = fight?.players.find((p) => p.name === shown?.player);
  if (!player?.realm) return;
  const region = player.region as Region;
  try {
    const realm = matchRealms(await getRealms(region), player.realm)[0];
    if (!realm) throw new Error(`Unknown realm "${player.realm}"`);
    navigate({ page: "character", name: player.name, realm: realm.slug, region, section: prefs.section() });
  } catch (err) {
    setStatus(errorMessage(err), true);
  }
}
