import {
  type Breakdown,
  type CharacterLog,
  CURVE_METRICS,
  type CurveMetric,
  type Fight,
  type FightResponse,
  type LogRef,
  type Metric,
  type Player,
  type Region,
  type ReportResponse,
  type TalentTree,
  type TopTalents,
} from "../../shared/api.ts";
import {
  getBreakdown,
  getCharacterLogs,
  getDistribution,
  getFight,
  getFightTalents,
  getRealms,
  getReport,
  getTalentTree,
} from "../api.ts";
import { showBudget } from "../budget.ts";
import { mountChart } from "../chart.ts";
import { buildCurve, type Curve } from "../curve.ts";
import { dom, errorMessage, pageDom, setBusy, setStatus } from "../dom.ts";
import { metricLabel } from "../format.ts";
import { sampledShare, treeCurve, treeShare } from "../hero-tree.ts";
import { closePopup, isPopupOpen, showPopup } from "../popup.ts";
import { prefs } from "../prefs.ts";
import { estimatedRank, loggedRank, rankFromParse, rankOnLeaderboard } from "../rank.ts";
import { addRecent } from "../recent.ts";
import { navigate, type ReportRoute, registerPage, replaceRoute } from "../router.ts";
import { DEMO_CODE, matchRealms } from "../search-input.ts";
import { type LabeledParse, renderAnalysis, renderAnalysisLoading } from "../views/analysis.ts";
import {
  type CompareTarget,
  type HeroBadge,
  renderCompareLoading,
  renderLogCompare,
} from "../views/compare.ts";
import {
  renderFights,
  renderFightsSkeleton,
  renderPlayers,
  renderPlayersSkeleton,
  renderReportHeader,
  renderReportHeaderSkeleton,
  selectCard,
} from "../views/report.ts";
import { atlas, renderTalentCompare } from "../views/talents.ts";
import { loadWowheadTooltips } from "../wowhead.ts";

const { reportHead, fights: fightsEl, players: playersEl, analysis: analysisEl } = pageDom;

let report: ReportResponse | null = null;
let fight: FightResponse | null = null;
/** The shown analysis, for the log comparison popup. */
let compare: {
  player: Player;
  parse: number;
  metric: Metric;
  curve: Curve;
  /** leaderboard logs behind the curve, with their hero tree */
  logs: CompareLog[];
  /** set on the first open: they depend on the player's hero tree */
  targets?: CompareTarget[];
  heroes?: { you: number | null; tree: TalentTree | null };
} | null = null;
/** Drops a comparison that finished after another target was picked. */
let compareRun = 0;
/** Top-100 talents of the shown curve, for the comparison popup. */
let topTalents: TopTalents | null = null;
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
    // same report: only the highlight moves
    if (sameReport && fightsEl.querySelector("[data-fight]"))
      selectCard(fightsEl, "data-fight", String(route.fight));
    else fightsEl.innerHTML = renderFights(r.fights, r.zone?.id, route.fight);
    if (!route.fight) {
      playersEl.innerHTML = analysisEl.innerHTML = "";
      return;
    }

    const f = sameFight && fight ? fight : await loadFight(route.code, route.fight, fightRequest, isCurrent);
    if (!f) return;
    const meta = r.fights.find((x) => x.id === route.fight);
    const isMythicPlus = (meta?.keystoneLevel ?? 0) > 0;
    // same fight: only the highlight moves (another player, hero tree or metric)
    if (sameFight && playersEl.querySelector("[data-player]"))
      selectCard(playersEl, "data-player", route.player);
    else playersEl.innerHTML = renderPlayers(f.players, f.unranked, route.player, isMythicPlus);

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
  const difficulty = isMythicPlus ? 0 : meta?.difficulty || f.difficulty;
  const encounterId = meta?.encounterId || f.encounterId;
  const known = Boolean(player.realm) && (player.region === "EU" || player.region === "US");
  // the other of DPS/HPS comes with the fight; boss damage needs the character ranking (and says little in a dungeon)
  const otherResult =
    player.other && (!byKeyLevel || player.other.bracketParse !== null) ? player.other : null;
  const metrics = CURVE_METRICS.filter((m) =>
    m === player.metric ? true : m === "bossdps" ? known && !isMythicPlus : otherResult !== null || known,
  );
  const metric = route.metric && metrics.includes(route.metric) ? route.metric : player.metric;
  const other = metric !== player.metric;
  // the shown metric from the fight's rankings, if there
  const fromFight = other ? (metric === "bossdps" ? null : otherResult) : player;

  const label = (m: CurveMetric) => {
    const s = [byKeyLevel && `+${meta?.keystoneLevel}`, m !== player.metric && metricLabel(m), "parse"]
      .filter(Boolean)
      .join(" ");
    return s[0].toUpperCase() + s.slice(1);
  };
  const own: LabeledParse = {
    label: label(player.metric),
    parse: byKeyLevel ? (player.bracketParse as number) : player.parse,
    amount: player.amount,
    metric: player.metric,
  };
  const main: LabeledParse = fromFight
    ? {
        label: label(metric),
        parse: byKeyLevel ? (fromFight.bracketParse as number) : fromFight.parse,
        amount: fromFight.amount,
        metric,
      }
    : { ...own, label: label(metric), metric };
  // WCL ranks the overall parse only, not the key level one
  const logged = byKeyLevel || other ? null : loggedRank(player);

  // same player: re-render in place, no placeholder, no scroll
  const sameView = prev?.code === route.code && prev.fight === route.fight && prev.player === route.player;
  if (!sameView) {
    analysisEl.innerHTML = renderAnalysisLoading(player, own, logged ?? undefined);
    analysisEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } else if (prev?.metric !== route.metric) {
    showMetricLoading(metric, player.metric);
  }

  const loaded = Promise.all([
    getDistribution({
      encounterId,
      difficulty,
      partition: f.partition || 0,
      bracket: byKeyLevel ? (player.bracket as number) : 0,
      metric,
      lite: other,
      className: player.className,
      spec: player.spec,
    }),
    // the character ranking adds WCL's total and the unrounded parse, when it lists this run
    (byKeyLevel || other) && known
      ? characterRun(player, encounterId, route, metric, byKeyLevel, difficulty)
      : null,
  ]);
  const [dist, run] = await loaded.catch(async (e) => {
    // a failed metric switch: back to the curve that was shown, then report the error
    if (sameView && prev && prev.metric !== route.metric && isCurrent()) {
      shown = prev;
      replaceRoute(prev);
      await showAnalysis(prev, route, player, f, meta, isCurrent);
    }
    throw e;
  });
  if (!isCurrent()) return;
  if (!fromFight && !run) {
    // fall back to the player's own metric
    shown = { ...route, metric: null };
    replaceRoute(shown);
    await showAnalysis(shown, route, player, f, meta, isCurrent);
    setStatus(`Warcraft Logs has no ${metricLabel(metric)} ranking for this log.`, true);
    return;
  }

  // WCL's population and unrounded parse for this run, if found
  const parsed: LabeledParse = run ? { ...main, parse: run.todayParse, amount: run.amount } : main;
  const specCurve = buildCurve(dist.points, {
    total: run?.todayTotal ?? (byKeyLevel ? null : (fromFight?.totalParses ?? null)),
    complete: dist.complete,
    anchor: { amount: parsed.amount, parse: parsed.parse, floored: !run },
  });

  // optional hero tree view: rank only among that tree
  const tree = dist.heroTrees.find((t) => t.id === route.tree);
  const share = tree ? treeShare(dist.points, dist.trees, tree.id) : null;
  const curve = share ? treeCurve(specCurve, share) : specCurve;
  const shownParse: LabeledParse =
    tree && share
      ? { ...parsed, label: `Among ${tree.name}`, parse: curve.percentileOf(parsed.amount) }
      : parsed;
  const trees = dist.heroTrees.map((t) => ({ ...t, share: sampledShare(dist.trees, t.id) }));

  const ownLog = { name: player.name, code: route.code, fight: route.fight as number };
  const rank = share
    ? estimatedRank(curve, parsed.amount)
    : rankOnLeaderboard(
        dist,
        curve,
        ownLog,
        parsed.amount,
        run ? rankFromParse(run.todayParse, run.todayTotal) : logged,
      );

  const logs = dist.points.flatMap(([rank, amount], i) => {
    const log = dist.logs[i];
    return log && (!share || dist.trees[i] === tree?.id) ? [{ rank, amount, log }] : [];
  });
  const compareLogs: CompareLog[] = dist.points.flatMap(([rank, amount], i) => {
    const log = dist.logs[i];
    return log && (!share || dist.trees[i] === tree?.id) ? [{ rank, amount, log, tree: dist.trees[i] }] : [];
  });
  // the spec's #1 if its log is public; in a hero tree view the tree's best known log
  const topLog = share ? (logs[0]?.log ?? null) : dist.points[0]?.[0] === 1 ? dist.logs[0] : null;

  analysisEl.innerHTML = renderAnalysis(
    player,
    curve,
    shownParse,
    rank,
    trees,
    share ? (tree?.id ?? null) : null,
    metrics,
    f.players,
    topLog,
    // M+ fights bring the talents; raid ones load them on click
    dist.topTalents.players >= 10 && (!isMythicPlus || Boolean(player.talents?.length)),
    compareTargets(compareLogs, curve, shownParse.parse).length > 0,
  );
  topTalents = dist.topTalents;
  compare = {
    player,
    parse: shownParse.parse,
    metric: shownParse.metric === "hps" ? "hps" : "dps",
    curve,
    logs: compareLogs,
  };
  mountChart(analysisEl.querySelector("#chart") as HTMLElement, dom.tooltip, curve, player, shownParse, logs);
}

/** While another metric loads: mark its button busy and cover the chart. The next render replaces both. */
function showMetricLoading(metric: CurveMetric, own: CurveMetric) {
  for (const b of analysisEl.querySelectorAll<HTMLButtonElement>("[data-metric]")) {
    const on = (b.dataset.metric || own) === metric;
    b.classList.toggle("btn-on", on);
    b.disabled = true;
    if (on) b.insertAdjacentHTML("beforeend", SPINNER);
  }
  analysisEl.querySelector("#chart")?.insertAdjacentHTML(
    "beforeend",
    `<div class="absolute inset-0 grid place-items-center rounded-sm bg-panel/75 text-sm text-zinc-300">
      <span class="flex items-center gap-2">${SPINNER}Loading the ${metricLabel(metric)} leaderboard…</span>
    </div>`,
  );
}

const SPINNER = `<span class="size-3.5 animate-spin rounded-full border-2 border-gold/30 border-t-gold"></span>`;

/** This run in the character's rankings for `metric` (1 point, cached); null if not found. */
async function characterRun(
  player: Player,
  encounterId: number,
  route: ReportRoute,
  metric: CurveMetric,
  byKeyLevel: boolean,
  difficulty: number,
): Promise<CharacterLog | null> {
  const region = player.region;
  if (!player.realm || (region !== "EU" && region !== "US")) return null;
  try {
    const realm = matchRealms(await getRealms(region), player.realm)[0];
    if (!realm) return null;
    const run = { code: route.code, fight: route.fight as number };
    const logs = await getCharacterLogs(
      player.name,
      realm.slug,
      region,
      encounterId,
      metric,
      byKeyLevel ? 0 : difficulty,
      byKeyLevel,
      run,
    );
    return logs.find((l) => l.code === run.code && l.fight === run.fight) ?? null;
  } catch {
    return null; // e.g. hidden character: fall back to solving the total from the parse
  }
}

// ---------- clicks ----------

fightsEl.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-fight]");
  if (btn && shown)
    navigate({ ...shown, fight: Number(btn.dataset.fight), player: null, tree: null, metric: null });
});

playersEl.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-player]");
  if (btn && shown) navigate({ ...shown, player: btn.dataset.player ?? null, tree: null, metric: null });
});

analysisEl.addEventListener("click", async (e) => {
  const target = e.target as HTMLElement;
  const treeButton = target.closest<HTMLElement>("[data-tree]");
  if (treeButton && shown) {
    navigate({ ...shown, tree: Number(treeButton.dataset.tree) || null });
    return;
  }
  if (target.closest("[data-log-compare]")) {
    await openLogCompare();
    return;
  }
  if (target.closest("[data-talent-compare]")) {
    await openTalentCompare();
    return;
  }
  const metricButton = target.closest<HTMLElement>("[data-metric]");
  if (metricButton && shown) {
    const m = metricButton.dataset.metric as CurveMetric | "";
    navigate({ ...shown, metric: m || null });
    return;
  }
  if (target.closest("[data-character]")) await openCharacter();
});

/** The shown player's build in this fight against the top 100 (raid: 1 point per fight for the talents). */
async function openTalentCompare() {
  const player = fight?.players.find((p) => p.name === shown?.player);
  const route = shown;
  const top = topTalents;
  if (!player || !route?.fight || !top) return;
  showPopup(renderTalentCompare(player.className, player.spec, [], top, undefined));
  loadWowheadTooltips();
  try {
    const [picks, tree] = await Promise.all([
      player.talents ?? getFightTalents(route.code, route.fight).then((all) => all[player.name] ?? []),
      getTalentTree(player.className, player.spec).catch(() => null),
    ]);
    if (isPopupOpen()) showPopup(renderTalentCompare(player.className, player.spec, picks, top, tree));
  } catch (e) {
    closePopup();
    setStatus(errorMessage(e), true);
  }
}

/** Parse tiers a comparison can aim for, besides the best log. */
const COMPARE_TIERS = [99, 95, 90, 75];

/**
 * Better logs to compare with, from the leaderboard logs behind the curve: the best one, and the closest
 * at each tier above the player's parse. Lowest first.
 */
function compareTargets(logs: CompareLog[], curve: Curve, yourParse: number): CompareTarget[] {
  const out: CompareTarget[] = [];
  const add = (label: string, e: CompareLog | undefined) => {
    if (!e || out.some((t) => t.log.code === e.log.code && t.log.fight === e.log.fight)) return;
    const parse = curve.percentileOf(e.amount);
    if (parse > yourParse) out.push({ log: e.log, label, parse, amount: e.amount, tree: e.tree });
  };
  add(`#${logs[0]?.rank}`, logs[0]);
  for (const tier of COMPARE_TIERS) {
    const rank = curve.total * (1 - tier / 100);
    add(
      `~${tier}`,
      logs.reduce<CompareLog | undefined>(
        (a, b) => (!a || Math.abs(b.rank - rank) < Math.abs(a.rank - rank) ? b : a),
        undefined,
      ),
    );
  }
  return out.sort((a, b) => a.parse - b.parse);
}

/** A leaderboard log the comparison can pick. */
type CompareLog = { rank: number; amount: number; log: LogRef; tree: number | null };

/** The player's hero tree in this fight (raid: 1 point per fight for the talents), and the spec's trees. */
async function heroTreeOf(player: Player, code: string, fightId: number) {
  const [picks, tree] = await Promise.all([
    player.talents ?? getFightTalents(code, fightId).then((all) => all[player.name] ?? []),
    getTalentTree(player.className, player.spec).catch(() => null),
  ]);
  const taken = new Set(picks.map((t) => t.id));
  const node = tree?.hero.find((n) => n.entries.some((e) => taken.has(e.id)));
  return { you: node?.heroTree ?? null, tree };
}

const heroBadge = (tree: TalentTree | null, id: number | null): HeroBadge | null => {
  const hero = tree?.heroTrees.find((h) => h.id === id);
  return hero ? { name: hero.name, emblem: hero.atlas ? atlas(hero.atlas) : null } : null;
};

/**
 * The shown player's fight against a better log, ability by ability (about 3 points per log, cached).
 * Logs of the player's own hero tree first; others only if none of them is better.
 */
async function openLogCompare(index = 0) {
  const c = compare;
  const route = shown;
  if (!c || !route?.fight) return;
  const run = ++compareRun;
  showPopup(renderCompareLoading());
  loadWowheadTooltips();
  try {
    if (!c.targets) {
      c.heroes = await heroTreeOf(c.player, route.code, route.fight);
      const you = c.heroes.you;
      const same =
        you === null
          ? []
          : compareTargets(
              c.logs.filter((l) => l.tree === you),
              c.curve,
              c.parse,
            );
      c.targets = same.length ? same : compareTargets(c.logs, c.curve, c.parse);
    }
    const targets = c.targets;
    const selected = targets[index] ?? targets[0];
    if (!selected || run !== compareRun || !isPopupOpen()) return;
    const tree = c.heroes?.tree ?? null;
    const heroes = { you: heroBadge(tree, c.heroes?.you ?? null), them: heroBadge(tree, selected.tree) };
    const render = (me?: Breakdown, them?: Breakdown) =>
      showPopup(renderLogCompare(c.player, c.parse, c.metric, targets, selected, me, them, heroes));
    render();
    const [me, them] = await Promise.all([
      getBreakdown(route.code, route.fight, c.player.name, c.metric),
      getBreakdown(selected.log.code, selected.log.fight, selected.log.name, c.metric),
    ]);
    if (run === compareRun && isPopupOpen()) render(me, them);
  } catch (e) {
    if (run !== compareRun) return;
    closePopup();
    setStatus(errorMessage(e), true);
  }
}

// the comparison's target picker
document.addEventListener("change", async (e) => {
  const select = (e.target as HTMLElement).closest<HTMLSelectElement>("[data-compare-target]");
  if (select) await openLogCompare(Number(select.value));
});

/** The player's name: open their character page. */
async function openCharacter() {
  const player = fight?.players.find((p) => p.name === shown?.player);
  if (!player?.realm) return;
  const region = player.region as Region;
  try {
    const realm = matchRealms(await getRealms(region), player.realm)[0];
    if (!realm) throw new Error(`Unknown realm "${player.realm}"`);
    navigate({
      page: "character",
      name: player.name,
      realm: realm.slug,
      region,
      section: prefs.section(),
      zone: null,
      difficulty: null,
    });
  } catch (err) {
    setStatus(errorMessage(err), true);
  }
}
