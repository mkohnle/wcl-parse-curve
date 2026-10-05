export const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

/** 12345 -> "12.3k" */
export const compact = (n: number) =>
  Math.abs(n) >= 1e6
    ? `${(n / 1e6).toFixed(2)}M`
    : Math.abs(n) >= 1000
      ? `${(n / 1000).toFixed(1)}k`
      : `${Math.round(n)}`;

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
export const esc = (s: unknown) => String(s).replace(/[&<>"]/g, (c) => ESCAPES[c] ?? c);

/** "DeathKnight" -> "Death Knight" */
export const spaced = (s: string) => s.replace(/([a-z])([A-Z])/g, "$1 $2");

/** 1870070 -> "31:10" */
export const duration = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
