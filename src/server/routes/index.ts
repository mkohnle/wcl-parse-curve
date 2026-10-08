import { timingSafeEqual } from "node:crypto";
import { type ErrorRequestHandler, Router } from "express";
import { config } from "../config.ts";
import { HttpError } from "../http.ts";
import { getBudget } from "../wcl/client.ts";
import { characters } from "./characters.ts";
import { leaderboards } from "./leaderboards.ts";
import { reports } from "./reports.ts";

export const api = Router();

// one line per request in the server log (Render's Logs tab), e.g.
// GET /api/fight?code=abc&fight=5 200 140ms. No IPs. The keep-awake pings are left out.
api.use((req, res, next) => {
  if (req.path === "/health") return next();
  const start = performance.now();
  res.on("finish", () => {
    const error = res.locals.error ? ` - ${res.locals.error}` : "";
    console.log(
      `${req.method} ${req.originalUrl} ${res.statusCode} ${Math.round(performance.now() - start)}ms${error}`,
    );
  });
  next();
});

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
  const message = err instanceof Error ? err.message : String(err);
  res.locals.error = message; // for the request log
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: message });
    return;
  }
  // most likely a failed WCL request
  console.error(err);
  res.status(502).json({ error: message });
};
api.use(errorHandler);
