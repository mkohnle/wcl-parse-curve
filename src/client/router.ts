// The URL is the state: each page is a route, and the back button just works.

import { type CharacterSection, CURVE_METRICS, type CurveMetric, type Region } from "../shared/api.ts";

export interface ReportRoute {
  page: "report";
  code: string;
  fight: number | null;
  player: string | null;
  /** hero tree id, null = whole spec */
  tree: number | null;
  /** curve metric, null = the player's own */
  metric: CurveMetric | null;
}

export interface CharacterRoute {
  page: "character";
  name: string;
  /** realm slug */
  realm: string;
  region: Region;
  section: CharacterSection;
}

interface LandingRoute {
  page: "landing";
}

export type Route = ReportRoute | CharacterRoute | LandingRoute;
type RouteOf<P extends Route["page"]> = Extract<Route, { page: P }>;

/** prev: the previous route if it was the same page, to reuse what's on screen. */
interface Page<R> {
  show(route: R, prev: R | null): void;
  hide(): void;
}

const pages: { [P in Route["page"]]?: Page<RouteOf<P>> } = {};
const listeners: ((route: Route) => void)[] = [];
let current: Route | null = null;

export function registerPage<P extends Route["page"]>(page: P, handler: Page<RouteOf<P>>) {
  (pages as Record<string, Page<Route>>)[page] = handler as Page<Route>;
}

/** Called on every navigation, e.g. to update the search field. */
export function onNavigate(listener: (route: Route) => void) {
  listeners.push(listener);
}

export function navigate(route: Route, push = true) {
  writeUrl(route, push);
  render(route);
}

/** Correct the URL without rendering again (e.g. the only fight got selected). */
export function replaceRoute(route: Route) {
  writeUrl(route, false);
  current = route;
}

export function startRouter() {
  window.addEventListener("popstate", () => render(readUrl()));
  render(readUrl());
}

function render(route: Route) {
  const prev = current;
  current = route;
  if (prev && prev.page !== route.page) pages[prev.page]?.hide();
  for (const l of listeners) l(route);
  const page = (pages as Record<string, Page<Route>>)[route.page];
  page?.show(route, prev?.page === route.page ? prev : null);
}

function toParams(route: Route): URLSearchParams {
  const params = new URLSearchParams();
  if (route.page === "report") {
    params.set("report", route.code);
    if (route.fight) params.set("fight", String(route.fight));
    if (route.player) params.set("player", route.player);
    if (route.tree) params.set("tree", String(route.tree));
    if (route.metric) params.set("metric", route.metric);
  } else if (route.page === "character") {
    params.set("char", `${route.name}-${route.realm}-${route.region}`);
    if (route.section !== "raid") params.set("section", route.section);
  }
  return params;
}

function writeUrl(route: Route, push: boolean) {
  const search = toParams(route).toString();
  const url = search ? `?${search}` : location.pathname;
  if (url === location.search || (!search && !location.search)) return;
  if (push) history.pushState(null, "", url);
  else history.replaceState(null, "", url);
}

function readUrl(): Route {
  const params = new URLSearchParams(location.search);
  const char = params.get("char")?.match(/^([^-]+)-(.+)-(EU|US)$/);
  if (char) {
    return {
      page: "character",
      name: char[1],
      realm: char[2],
      region: char[3] as Region,
      section: params.get("section") === "mythicPlus" ? "mythicPlus" : "raid",
    };
  }
  const code = params.get("report");
  if (!code) return { page: "landing" };
  return {
    page: "report",
    code,
    fight: Number(params.get("fight")) || null,
    player: params.get("player"),
    tree: Number(params.get("tree")) || null,
    metric: CURVE_METRICS.find((m) => m === params.get("metric")) ?? null,
  };
}
