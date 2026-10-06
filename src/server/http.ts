import type { Request } from "express";
import type { Region } from "../shared/api.ts";

/** An error whose message is safe to show to the client, with an HTTP status. */
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// ---------- query parameters ----------

export const str = (v: unknown): string => (typeof v === "string" ? v : "");
export const int = (v: unknown): number => Number.parseInt(str(v), 10) || 0;

export function region(v: unknown): Region {
  if (v === "EU" || v === "US") return v;
  throw new HttpError(400, "Region must be EU or US");
}

/** ?name=&realm=&region= of a character, validated. Realm is the slug. */
export function characterParams(req: Request): { name: string; realm: string; region: Region } {
  const name = str(req.query.name);
  const realm = str(req.query.realm);
  if (!/^\p{L}{2,12}$/u.test(name) || !/^[a-z0-9'-]{2,40}$/.test(realm)) {
    throw new HttpError(400, "Invalid character or realm");
  }
  return { name, realm, region: region(req.query.region) };
}
