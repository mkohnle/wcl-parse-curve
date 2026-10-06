// Reports and characters the visitor opened before, kept in the browser.

import { prefs } from "./prefs.ts";

export type RecentItem =
  | { kind: "report"; code: string; title: string; zoneId: number | null }
  | { kind: "char"; name: string; realm: string; realmName: string; region: string; className: string };

const KEY = "recent";
const MAX = 6;

export function loadRecent(): RecentItem[] {
  try {
    const items = JSON.parse(prefs.read(KEY) ?? "[]") as (RecentItem & { cls?: string })[];
    // entries saved before the cls → className rename
    return items.map((it) => (it.kind === "char" && !it.className ? { ...it, className: it.cls ?? "" } : it));
  } catch {
    return [];
  }
}

export function addRecent(item: RecentItem) {
  const id = (it: RecentItem) =>
    it.kind === "report" ? it.code : `${it.name}-${it.realm}-${it.region}`.toLowerCase();
  const items = [item, ...loadRecent().filter((it) => id(it) !== id(item))].slice(0, MAX);
  prefs.write(KEY, JSON.stringify(items));
}
