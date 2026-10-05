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
