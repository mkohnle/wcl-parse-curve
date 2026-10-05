# wcl-parse-curve

Paste a Warcraft Logs report, pick a player, and see where their DPS/HPS sits on the full parse curve for their spec. It also shows what it takes to reach the next parse point and each color tier.

## Setup

Requires Node 22.18+ (runs TypeScript natively) and pnpm.

```sh
pnpm install
cp .env.example .env   # then add your WCL API client credentials
```

Create API credentials at https://www.warcraftlogs.com/api/clients/.

## Scripts

| Command          | What it does                                                                       |
| ---------------- | ---------------------------------------------------------------------------------- |
| `pnpm dev`       | Dev mode: Vite on http://localhost:3000 (hot reload) + API on :3001 (auto-restart) |
| `pnpm start`     | Build the client and serve everything on http://localhost:3000                     |
| `pnpm build`     | Build the client into `dist/client`                                                |
| `pnpm typecheck` | Type-check everything with `tsc`                                                   |
| `pnpm lint`      | Lint + format check (Biome); `pnpm format` to auto-fix                             |
| `pnpm check`     | typecheck + lint                                                                   |

Links are shareable: `/?report=CODE&fight=6&player=Name` opens straight to a player's analysis.

## How the curve works

Warcraft Logs defines a parse as `100 × (1 − rank / population)` on the spec's leaderboard. The curve uses three sources:

- **The top 2,000 parses are real data.** The API serves at most 20 pages of 100 entries. To save rate limit, 8 of those pages are sampled and the rest interpolated.
- **The player's log parse is a fixed point**, so the curve always reproduces the parse shown on Warcraft Logs.
- **Everything below rank 2,000 is estimated** with a log-normal tail. These bars are drawn faded in the chart.

Raids use the overall parse; the log reports the population size (`totalParses`). The overall **Mythic+** parse also weighs the key level, so no DPS leaderboard can reproduce it. M+ fights therefore use the leaderboard of the same key level and its key-level parse. That population size isn't reported, so it's solved from the player's parse.

## Deploy (Render)

`render.yaml` is a Render Blueprint for the free web service. On render.com: **New → Blueprint**, pick this repo, and enter `WCL_CLIENT_ID` / `WCL_CLIENT_SECRET` when asked. Every push to `main` redeploys. The free instance sleeps after 15 minutes without traffic, so the first visit afterwards takes 30–60 s and starts with an empty cache.

## Rate limits

A WCL API client gets 720 points per hour, and one leaderboard page costs about 1 point. A new spec costs about 8 points; results are cached in memory for an hour. Separately, bursts of many parallel requests get the whole IP blocked for an hour, so the server never runs more than 4 WCL requests at a time.

## Layout

```
src/
  shared/api.ts         Request/response types shared by server and client
  server/
    main.ts             Express entry point (serves dist/client in production)
    api.ts              /api routes, validation, leaderboard sampling
    cache.ts            In-memory TTL cache
    config.ts           Env config
    wcl/client.ts       OAuth token + GraphQL client (concurrency-limited)
    wcl/queries.ts      WCL queries
  client/
    main.ts             UI flow, URL state
    views.ts            HTML for report, fights, players, analysis
    chart.ts            Interactive SVG histogram
    curve.ts            Parse curve model
    wow.ts              Class colors, parse tiers, icon URLs
    style.css           Tailwind v4 theme
```

## API

- `GET /api/report?code=` returns the report title, zone and boss fights
- `GET /api/fight?code=&fight=` returns players with amounts and parses (`&debug=1` returns the raw WCL rankings)
- `GET /api/distribution?enc=&diff=&part=&bracket=&cls=&spec=&metric=` returns sampled `[rank, amount]` leaderboard points
- `GET /api/zones` returns zones and encounters of the latest expansion (currently unused by the UI)
