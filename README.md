# Logscope

Logscope shows where a Warcraft Logs parse sits on the full distribution of its spec, and what it takes to reach the next parse color. It works for raid bosses and Mythic+ dungeons.

Live: https://logscope.onrender.com/

## Features

- **Parse curve:** the full distribution of a spec on a boss or dungeon, with the player's log placed on it, the rank, and the damage or healing needed for each parse color.
- **Hero trees and metrics:** narrow the curve to one hero talent tree, or switch between DPS, HPS and boss DPS.
- **Fights and players:** every player of a fight with their parse. Mythic+ fights add damage share, interrupts, deaths and tags such as MVP.
- **Log comparison:** a fight side by side with a better log of the same spec and hero tree: where the difference comes from, damage per ability, activity, cooldowns and combat potions.
- **Talent comparison:** a fight's talents against the talents of the top players of the same hero tree.
- **Characters:** best and median parse per boss or dungeon, for the current and past raids and seasons, plus Mythic+ score, gear and talents from Raider.IO.

## Getting started

Requirements: Node.js 22.18 or newer and pnpm.

```sh
pnpm install
cp .env.example .env
pnpm dev
```

Add your Warcraft Logs API credentials to `.env` (create a client at https://www.warcraftlogs.com/api/clients/), then open http://localhost:3000. Search for a report link, or for a character as `Name-Realm`. Without credentials, only the demo report works: search for `demo`.

| Command | Description |
| --- | --- |
| `pnpm dev` | Development: Vite on port 3000 and the API server on port 3001, both reloading on changes |
| `pnpm start` | Production build, served on port 3000 |
| `pnpm check` | Type check and lint |
| `pnpm format` | Format the code |
| `pnpm update:hero-trees` | Update the hero tree data from Raidbots (after major patches) |
| `pnpm update:talent-trees` | Update the talent tree data from Raidbots (after major patches) |

## Configuration

| Variable | Required | Description |
| --- | --- | --- |
| `WCL_CLIENT_ID` | Yes | Warcraft Logs API client ID |
| `WCL_CLIENT_SECRET` | Yes | Warcraft Logs API client secret |
| `UPSTASH_REDIS_REST_URL` | No | Upstash Redis REST URL, for a cache that survives restarts |
| `UPSTASH_REDIS_REST_TOKEN` | No | Upstash Redis REST token |
| `PORT` | No | Server port (default 3000) |
| `WCL_BASE_URL` | No | Warcraft Logs site, e.g. `https://classic.warcraftlogs.com` for Classic (needs its own client) |

## How the curve works

A parse is the player's position on the spec's leaderboard: `100 * (1 - rank / total)`. The Warcraft Logs API only returns the top 2,000 entries, in 20 pages. Logscope samples four of these pages and uses the player's own parse as a fixed point, so the curve always agrees with the log. Below the top 2,000, the curve is estimated with a log-normal model and drawn faded.

Mythic+ curves use the leaderboard of the player's key level. The total number of parses for that key level comes from the character's Warcraft Logs rankings.

## API usage and caching

The Warcraft Logs API allows 720 points per hour. Logscope keeps a reserve of 40 points and stops sending requests after a rate limit response until it may retry, since Warcraft Logs blocks the server's IP for an hour otherwise.

| Action | Points |
| --- | --- |
| Report | 1 |
| Fight | 4 (Mythic+ 6) |
| Curve for a spec | 4, up to 8 for short leaderboards |
| Mythic+ analysis | 1 more |
| Another metric on the curve | about 3 |
| Log comparison | about 6 |
| Talent comparison | 1 for raid, free for Mythic+ |
| Character page | 1 to 2 for raid, about 13 for Mythic+ |

Results are cached and shared between all visitors: finished reports and fights for a day, leaderboards for a day (finished seasons for a week), character pages for 30 minutes (past raids and seasons for a day). Mythic+ character pages only reload from Warcraft Logs once Raider.IO shows a new run, or after six hours. With Redis configured, long-lived entries survive restarts and deploys.

## Data sources

- [Warcraft Logs](https://www.warcraftlogs.com/): reports, rankings and leaderboards
- [Raider.IO](https://raider.io/): Mythic+ score, best runs, gear and talents
- [Raidbots](https://www.raidbots.com/): talent and hero tree data
- [Wowhead](https://www.wowhead.com/): icons, tooltips and spell details

## Deployment

`render.yaml` describes a free Render web service. In Render, create a new Blueprint from the repository and enter the Warcraft Logs credentials, plus the Upstash variables if you use Redis. Free instances sleep after 15 minutes without requests.

## Disclaimer

Logscope is not affiliated with Blizzard Entertainment, Warcraft Logs, Raider.IO, Raidbots or Wowhead. World of Warcraft and Warcraft are trademarks or registered trademarks of Blizzard Entertainment, Inc.
