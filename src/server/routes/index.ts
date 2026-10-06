import { timingSafeEqual } from "node:crypto";
import { type ErrorRequestHandler, Router } from "express";
import { config } from "../config.ts";
import { HttpError } from "../http.ts";
import { getBudget } from "../wcl/client.ts";
import { characters } from "./characters.ts";
import { leaderboards } from "./leaderboards.ts";
import { reports } from "./reports.ts";

export const api = Router();

// health check, no WCL call
api.get("/health", (_req, res) => {
  res.json({ ok: true });
});

/** Admin only: in dev, or with the ADMIN_TOKEN header. Others get a plain 404. */
const isAdmin = (token: string | undefined) => {
  if (config.dev) return true;
  if (!config.adminToken || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(config.adminToken);
  return a.length === b.length && timingSafeEqual(a, b);
};

/** Points left, or null if WCL isn't reachable. */
api.get("/budget", async (req, res) => {
  if (!isAdmin(req.get("x-admin-token"))) throw new HttpError(404, "Not found");
  res.json(await getBudget().catch(() => null));
});

api.use(reports, leaderboards, characters);

api.use((_req, _res) => {
  throw new HttpError(404, "Not found");
});

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  // most likely a failed WCL request
  console.error(err);
  res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
};
api.use(errorHandler);
