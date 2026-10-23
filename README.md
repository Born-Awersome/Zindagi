# Zindagi

An editable, responsive prototype for gamifying meaningful effort across Academics, Career, Connection, Fitness, and Creativity.

## Run

Requires Node.js 20.19+ or 22.12+ (developed with Node 24).

```sh
npm ci
npm run dev
```

The development server uses port 5173 by default. Run `npm run build` to produce `dist/`, `npm run preview` to serve that build, and `npm test` for scoring and timer tests.

## Try it

Choose a task on the dashboard or Challenges page. The academic session has 50 minutes of focus and 10 minutes of rest; the full hour earns one academic point. Pause/resume or end the session without points. Enable **Demo mode** before starting to accelerate a session to 20 seconds (including the study break). Demo points are labeled in the journal and included in local totals.

Edit your name, motto, and main interest in My profile. Finished tasks update the five-axis chart, progress journal, level, and leaderboard. Community recommendations prioritize the selected interest. Adding a person to your circle is a local simulation.

## Make changes

- `src/data.js`: categories, task wording, durations, rewards, sample people.
- `src/state.js`: completion and pause rules.
- `src/main.js`: screens, navigation, SVG radar chart, local persistence, interactions.
- `src/style.css`: colors, layout, typography, mobile styling.
- `test/state.test.js`: scoring, pause, and reload regression tests.

Vite reloads the page as source files change. No backend or API keys are needed. Google Fonts are optional; local sans-serif fallbacks work offline.

## Prototype boundaries

Data stays in this browser's localStorage. Rankings and other users are sample data, not real accounts. Session timing is self-reported, not proof of activity; background time counts unless paused. Only one session may run at once in one tab. Use one tab to avoid competing local writes. There is no authentication, shared database, secure verification, or cross-device sync yet. Task rewards outside academics are provisional examples to refine. Level advances every five total points. Reset local data from My profile.

## Nearby people and guilds

Open **Guilds** from the sidebar or **Nearby people & guilds** in Community.

- **Use my location** requests browser permission and updates location while the Guilds page is visible. Requires HTTPS or localhost. Location automatically stops when leaving Guilds, hiding the tab, or closing the page; it never restarts without a button click. **Turn location off** clears the in-memory position. Coordinates are not sent to a server, put in localStorage, or used in a location history.
- **Explore demo area** works without device permission. Both modes show clearly labeled illustrative people, guilds, and distances, not real location matches. Radius choices filter these sample distances. Device location currently exercises the permission/tracking flow; it does not discover real accounts.
- Join/leave a sample guild, or create a guild with a name, focus, description, and optional sample members. Creating a guild automatically joins it. Guilds and memberships survive refresh in the same browser.
- Each guild leaderboard contains only its members, supports all five category filters, and uses all-time points, including before joining. Completing a task updates your score. Ties share a rank. Demo-session points count.
- Shared cross-device guilds, actual nearby-user discovery, invitations, and verified competition require accounts and a backend; none are implied by this local demo.

Implementation: `src/guilds.js` owns the discovery UI and permission lifecycle; `src/guild-model.js` owns sample guilds, distance calculations, and ranking/membership logic. `test/guilds.test.js` covers that logic. Existing saved profiles are extended with empty guild fields on load.
