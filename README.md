# Zindagi

A life-gamification website with a Node.js/Express backend, SQLite persistence, real accounts, opt-in approximate location discovery, shared guilds, category leaderboards, and explainable recommendations. The original browser-only demo remains available when signed out.

## Run on your computer

Install **Node.js 24 LTS or newer** (npm is included), then:

```sh
git pull origin main
npm install
npm run dev
```

Open the URL printed by Vite (usually `http://localhost:5173`). Keep the terminal running. One command starts both the frontend and the API on port 3001. Node 24 is required for the built-in SQLite module. No database service, API keys, or paid model is required.

For a production-style local run:

```sh
npm run build
npm start
```

Open `http://localhost:3001`. The backend serves both `dist/` and `/api`. `npm run preview` previews only the frontend build and does **not** run the API; use `npm start` to test accounts with a built build.

## Try shared features

1. Select **Sign in / Create account**, choose **Create account**, and provide a username, display name, and a password of at least 10 characters.
2. Open **My profile** and choose your main focus, describe your goals, and explicitly enable discovery if you want to appear in recommendations and the community leaderboard.
3. Create a second account in an incognito window or a different browser. Both browsers must use the **same running backend**. Profiles, scores, and guilds now persist across devices that connect to that server.
4. Open **Guilds** to create or join an open group. Only members can view its member leaderboard. Scores include all-time earned points and can be filtered by aspect; ties share a rank.
5. For nearby matching, both accounts must enable profile discovery and choose **Share approximate location** on Guilds. Location requires HTTPS or localhost. Browser/device permissions may still deny access.
6. **Community** recommends actual opt-in accounts. New databases have no fake accounts or scores; empty results are expected until others sign up. Recommendations refresh on page navigation and via Refresh.

Your local demo progress is preserved separately and is never imported into competitive scores. Sign out to try accelerated 20-second demo sessions. Signed-in tasks use their full duration, including **50 minutes study + 10 minutes rest = 1 Academic Point**.

## Backend behavior

- SQLite is created automatically at `data/zindagi.sqlite` and excluded from Git. It stores profiles, salted scrypt password hashes, hashed expiring session tokens, task sessions/awards, connections, blocks, guilds, and memberships.
- Authentication uses a random token in an HttpOnly, SameSite=Strict cookie. Production cookies require HTTPS. State-changing requests require the same-origin custom request header; cross-origin browser requests are rejected. API bodies and auth request rates are bounded.
- The server owns task durations, pause/resume timestamps, categories, and rewards. One active session per account; completion is transactional and idempotent. Browser-submitted points/durations cannot award extra points. Timing verifies elapsed time, **not actual study or exercise**.
- Adding a person to your circle is a one-way bookmark; it does not send them a message. Hiding a person excludes discovery in both directions. Shared guild membership still exposes member names and scores to fellow members.
- Location is rounded to two decimal places (roughly a kilometre, varying by latitude), held only in server memory, and excluded after 15 minutes. A cleanup job removes expired presence. No coordinates/history go into SQLite. Responses show distance bands, not raw coordinates. Sharing stops when leaving Guilds, hiding the tab, signing out, disabling profile discovery, or using Stop sharing. A failed disconnect may leave presence until expiry.
- Guilds with active nearby members appear ahead of other groups, followed by matching focus. A guild does not expose a home address or permanent coordinate.

## Recommendation model

See [docs/recommendations.md](docs/recommendations.md). `hybrid-v1` is a deterministic, explainable starting model: shared focus, goal keyword overlap, cosine similarity of category activity, optional proximity, recent activity, and a diversity reranking step. It also recommends tasks using chosen focus and less-developed categories.

It is not a trained model, and no accuracy claims are made without real interaction data. A learning-to-rank model is a later upgrade after collecting consented recommendation feedback and evaluating it against this baseline.

## Configuration and hosting

Optional: copy `.env.example` to `.env`. Node reads it automatically; no changes are needed for local development. Never commit `.env` or the database.

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3001` | API and built-site port; Vite's development proxy expects 3001 |
| `DATABASE_PATH` | `data/zindagi.sqlite` | Persistent writable SQLite file |
| `NODE_ENV` | development behavior | Set `production` behind HTTPS to enable Secure cookies |
| `APP_ORIGIN` | request host validation | Exact public origin, e.g. `https://zindagi.example.com`; no trailing slash |

To share with other people, deploy the Node app on a host with a persistent disk and HTTPS, set `NODE_ENV=production` and `APP_ORIGIN` to its public origin, and run the build followed by `npm start`. GitHub Pages alone cannot run this backend. Different local servers have separate databases. This repository is pushed code, not a publicly deployed service.

Use a **single Node process** for this hackathon backend: approximate presence and rate limits are process-local, and ranking currently scans opt-in accounts. For larger deployments, move to PostgreSQL/PostGIS for spatial queries, a shared session/rate-limit store, paginated candidate retrieval, and proper observability. Account recovery, email verification, moderation/admin tools, and operational backup automation are not implemented yet. Keep a backup of the SQLite database; use SQLite's backup mechanism or stop the server before copying its database files.

## Develop and validate

```sh
npm test
npm run build
```

Tests cover auth, cross-user access, scoring/timing and duplicate completion, guild membership/leaderboards, discovery opt-in/expiry, database restart persistence, recommendation behavior, and original local-demo logic.

- `src/data.js`: task/category definitions, shared with the server. Task rewards outside academics are provisional product choices.
- `src/main.js`, `src/style.css`: screens, timer, radar chart, styling.
- `src/live.js`: API client, account UI, live discovery and guild interface.
- `src/guilds.js`, `src/guild-model.js`, `src/state.js`: signed-out local demo.
- `server/app.js`: database schema, authentication, profiles, task sessions, discovery, guild APIs.
- `server/recommendations.js`: ranking functions and weights.
- `vite.config.js`, `scripts/dev.js`: development proxy and combined startup.

Vite updates the frontend as you edit; Node restarts the API when backend files change. API restarts clear temporary location presence, but keep account data. Fonts use an optional Google Fonts stylesheet with local fallbacks.
