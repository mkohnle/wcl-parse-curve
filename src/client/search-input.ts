export const DEMO_CODE = "demo";

/** Extract report code and optional fight id from a WCL URL, a bare report code, or "demo". */
export function parseReportInput(raw: string): { code: string; fight: number | null } | null {
  const input = raw.trim();
  if (input.toLowerCase() === DEMO_CODE) return { code: DEMO_CODE, fight: null };
  const code = (input.match(/reports\/([A-Za-z0-9]+)/) ?? input.match(/^([A-Za-z0-9]{10,})/))?.[1];
  if (!code) return null;
  const fight = input.match(/[?&#]fight=(\d+)/)?.[1];
  return { code, fight: fight ? Number(fight) : null };
}

/** "Name-Realm" (realm may contain spaces or apostrophes), or null. */
export function parseCharacterInput(raw: string): { name: string; realm: string } | null {
  const m = raw.trim().match(/^(\p{L}{2,12})\s*-\s*(.+)$/u);
  return m ? { name: m[1], realm: m[2].trim() } : null;
}

const normalize = (s: string) => s.toLowerCase().replace(/[\s'-]/g, "");

/** Realms matching typed text: exact matches first, then prefix, then substring. */
export function matchRealms<T extends { name: string; slug: string }>(realms: T[], text: string): T[] {
  const t = normalize(text);
  if (!t) return realms;
  const rank = (r: T) => {
    const n = normalize(r.name);
    return n === t || normalize(r.slug) === t ? 0 : n.startsWith(t) ? 1 : n.includes(t) ? 2 : 3;
  };
  return realms
    .map((r) => ({ r, k: rank(r) }))
    .filter((x) => x.k < 3)
    .sort((a, b) => a.k - b.k)
    .map((x) => x.r);
}
