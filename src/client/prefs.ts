// Small per-browser preferences. Storage can be unavailable (private mode), so all access is guarded.

import type { CharacterSection, Region } from "../shared/api.ts";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

export const prefs = {
  region: (): Region => (read("region") === "US" ? "US" : "EU"),
  setRegion: (r: Region) => write("region", r),
  /** last viewed part of a character page */
  section: (): CharacterSection => (read("section") === "mythicPlus" ? "mythicPlus" : "raid"),
  setSection: (s: CharacterSection) => write("section", s),
  read,
  write,
};
