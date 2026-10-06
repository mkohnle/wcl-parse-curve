# Logscope

Shows where a Warcraft Logs parse sits on the full curve for its spec, and how much DPS/HPS the next colors need.

## Run

Node 22.18+ and pnpm.

```sh
pnpm install
cp .env.example .env   # WCL API credentials: https://www.warcraftlogs.com/api/clients/
pnpm dev               # http://localhost:3000
```

Search for a report link, or a character as `Name-Realm` (EU/US toggle in the field). Without credentials only the demo report works (type `demo`).

| Command | |
| --- | --- |
| `pnpm dev` | Vite (:3000) + API server (:3001), hot reload |
| `pnpm start` | Build and serve on :3000 |
| `pnpm check` | Typecheck + lint |
| `pnpm format` | Auto-format |

## How it works

- Parse = `100 × (1 − rank / total)` on the spec's leaderboard.
- The API only serves the top 2,000. We sample 4 of those 20 pages.
- The player's own parse is a fixed point, so the curve always matches the log.
- Below the top 2,000 the curve is estimated (log-normal) and drawn faded.
- Mythic+ uses the key level leaderboard and key level parse. The overall M+ parse also weighs key level and can't be reproduced.

## API limits

720 points per hour. A leaderboard page costs 1, a fight 4, a report 1, a character page 1–2 for raid (+1 per boss opened) or about 10 for M+ (1 per dungeon played, opening one is free), the realm list 3 (cached 7 days).

- Lookups stop when fewer than 40 points are left.
- After a 429 nothing is sent until `retry-after` has passed (otherwise WCL blocks the IP for an hour).
- Leaderboards are cached 6 h, in memory.

## Deploy

`render.yaml` sets up a free Render web service: New → Blueprint, pick the repo, enter `WCL_CLIENT_ID` and `WCL_CLIENT_SECRET`. The free instance sleeps after 15 min idle.
