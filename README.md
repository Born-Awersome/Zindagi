# Zindagi

A life-gamification website with a Node.js/Express backend, SQLite persistence, real accounts, opt-in precise location checks, shared guilds, category leaderboards, and explainable recommendations. The original browser-only demo remains available when signed out.

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
5. Use **Community → Find people** to find an exact username and send a request. Friends can be accepted anywhere; Connect requires both people to enable precise location in My profile and pass a fresh 5–40 metre proximity check. Profile discovery controls listing in nearby recommendations, not direct username requests. Location requires HTTPS or localhost.
6. **Community** recommends actual opt-in accounts. New databases have no fake accounts or scores; empty results are expected until others sign up. Recommendations refresh on page navigation and via Refresh.

Your local demo progress is preserved separately and is never imported into competitive scores. Sign out to try accelerated 20-second demo sessions for timed quests. Cultural always requires a fresh camera recording, even in demo mode. Signed-in timed tasks use their full duration, including **50 minutes study + 10 minutes rest = 1 Academic Point**.

## Backend behavior

- SQLite is created automatically at `data/zindagi.sqlite` and excluded from Git. It stores profiles, salted scrypt password hashes, hashed expiring session tokens, task sessions/awards, recording receipts (hash, size, MIME type), friend/Connect requests and accepted relationships (`social_links`), blocks, guilds, and memberships. Private quest media is discarded. Shared Cultural videos are stored as bounded SQLite BLOBs in the existing `moments` table and support unlimited replay.
- Authentication uses a random token in an HttpOnly, SameSite=Strict cookie. Production cookies require HTTPS. State-changing requests require the same-origin custom request header; cross-origin browser requests are rejected. API bodies and auth request rates are bounded.
- The server owns task durations, pause/resume timestamps, categories, and rewards. One active session per account; completion is transactional and idempotent. Browser-submitted points/durations cannot award extra points. Timing verifies elapsed time, **not actual study or exercise**.
- Friends and Connect are separate, mutual relationships. Requests need recipient acceptance. Blocking removes both kinds of pending/accepted links and hides discovery in both directions. Shared guild membership still exposes member names and scores to fellow members. Old circle bookmarks are retained only as legacy data and never automatically become mutual friends or connections.
- Precise coordinates and reported accuracy are held only in server memory for a 30-second validity window; fresh readings replace old ones. Expiry, Stop sharing, and sign-out clear presence. Profile discoverability and the saved location preference are independent. No coordinates or location history go into SQLite. Clients pause tracking and clear presence when hidden, then resume the existing opt-in on return. The Profile preference applies across app tabs and is saved per account on this device; returning to a signed-in app resumes it only if browser permission is already granted. Others see broad distance bands or a Connect readiness result, never raw coordinates. If disconnect cleanup fails, the location expires. Nearby guild discovery excludes members who have disabled profile discovery.
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

Use a **single Node process** for this hackathon backend: precise presence and rate limits are process-local, and ranking currently scans opt-in accounts. For larger deployments, move to PostgreSQL/PostGIS for spatial queries, a shared session/rate-limit store, paginated candidate retrieval, and proper observability. Account recovery, email verification, moderation/admin tools, and operational backup automation are not implemented yet. Keep a backup of the SQLite database; use SQLite's backup mechanism or stop the server before copying its database files.

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

## Adventure interface

The dashboard now has a player card, level progress, color-coded quest cards, and a skill constellation. Every five total points raises your player level. **View quest briefing** explains a task before you accept it; **Enter focus mode** opens a distraction-free timer with pause/resume. Completing a session shows its point reward and celebrates level-ups. **My profile → Achievements** shows unlock requirements and progress for four badges. Badges are derived from existing points and never grant extra competitive points.

The new visual layer lives in `src/game.css`; reusable illustrations, icons, level calculations, and badge definitions live in `src/game.js`. It supports mobile navigation, keyboard-operable dialogs, and reduced-motion preferences. Signed-out demo mode and account-backed scoring remain separate.


## Cultural: record your talent

The fifth aspect is now **Cultural**. Choose **Record talent** on its quest card, or open the quest briefing and accept it:

1. Enable camera and microphone access. Nothing records until you press **Start recording**.
2. Perform a short piece of music, guitar, singing, dance, or another cultural talent. Press **Stop recording** when finished. The 60-second maximum bounds clip size; it is not a task countdown or a reward for waiting.
3. Play back your take. **Retake** discards it and lets you capture a new one.
4. **Submit performance** awards **1 Cultural Point**. There is no file input, gallery picker, or drag-and-drop import. Ending/closing without submission gives no point.

Recording requires a supported `MediaRecorder` browser (current Chrome, Edge, Firefox, or Safari), a camera and microphone, and **localhost or HTTPS**. Access from a plain HTTP Wi-Fi address usually cannot record. Permission denial shows a retry message instead of offering file selection. Devices stop after recording, when the tab is hidden, or when the dialog closes. If a crash leaves a pending server session, use **Discard an unfinished recording** after the conflict message; otherwise it expires after 15 minutes.

In local demo mode, the clip exists only in memory and never leaves the browser. For a signed-in account, clicking Submit transfers the captured clip to the same backend. The server accepts supported WebM/MP4 containers up to 15 MiB with an owned, unexpired recording session; it rejects empty/malformed submissions and exact duplicate clips per account. Awards and receipts commit together, and retries of an accepted submission cannot add a second point. By default, the server discards the bytes after processing and saves only a hash, byte count, MIME type, and award. Selecting **Share this Cultural video publicly** also saves the clip in the Cultural gallery on Challenges. Existing/private submissions are never published retroactively.

The supported interface is direct capture only. Container checks and recording-session ownership are **not** forensic liveness checks, talent assessment, or proof against a modified client submitting synthetic/re-encoded media. A production verified competition would need a separate verification design; this release does not claim one.

Existing **Creativity** points, interests, local history, and guild focuses migrate to Cultural without changing totals. Unfinished legacy creative timers are cancelled so they cannot award a recording point. The migration is idempotent on both the server and in browser state.

- `src/cultural-recorder.js`: permission, live preview, recording, review, cleanup, and retry UI.
- `src/recording-policy.js`: supported types and capture limits.
- `server/recordings.js`: recording endpoints, validation, receipts, and database migration.
- `test/cultural.test.js`: migration, recording-only awards, API ownership, cancellation/expiry, and duplicate prevention.

## Themes and guild quests

The dashboard features **“Less scrolling. More becoming.”** and **“Your next level is real life.”** Use the Light mode / Dark mode button in the header; the choice is remembered in this browser.

Sign in, open **Guilds**, then choose **Tasks & leaderboard** on a joined guild. The account that created the guild is its leader and can:
- Open **Create a quest**, write the title and instructions, choose an aspect, and assign **1–100 guild points**.
- Close or reopen quests. Reward values are fixed at creation.
- Approve submissions or request another attempt.

Members describe their completed work and submit it for approval. Cultural guild quests instead require a fresh in-app camera and microphone recording, with review/retake before submission. The review panel shows a recording receipt. Private clips are discarded after processing; explicitly public clips are available for unlimited replay on Challenges. This is an honor-based review system, not automated talent verification.

Each member can earn each quest's reward once. Local rankings combine existing all-time category points with approved rewards from that specific guild; aspect filters include matching custom quests. Guild rewards do **not** change global points, profile stats, or another guild's leaderboard. Leaders must remain guild members to manage quests (rejoining restores the founder's role).

Task definitions, submissions, and approved rewards persist in SQLite. The schema is installed automatically when the server starts; no manual SQL commands are needed.

Implementation: `src/theme.js`, `src/light.css`, `src/guild-quests.js`, and `server/guild-tasks.js`. Tests include leader permissions, approval/rejection, repeat safety, isolated scoring, and Cultural guild submissions.

## Fix camera access on other devices

Phones and laptops opening an HTTP Wi-Fi address cannot use the camera because browsers require a secure context. Use a trusted HTTPS tunnel for a quick shared link, or configure the server's new HTTPS_CERT and HTTPS_KEY options for local HTTPS. See [phone/laptop recording setup](docs/device-recording.md) for Windows commands, certificate trust instructions, and troubleshooting. Merely changing http to https in the URL does not enable TLS.


## Shared Cultural challenge videos

On **Challenges**, complete the Cultural recording quest and select **Share this Cultural video publicly** before submitting. The video appears in **Watch Cultural performances** on the same page. Signed-in members can watch, pause, seek, and replay it as often as they like. Cultural guild challenge recordings can also be shared here. Publishing remains optional; previously private recordings are never exposed.

The Community stage, standalone photo/video posts, and view-once restrictions have been removed. Existing shared Cultural challenge videos remain available and any previous view records are ignored. Legacy standalone posts remain in the database but are excluded from this gallery. No data is automatically deleted by this update.

Use **My videos only → Remove video** to stop future access while keeping earned points. Blocked accounts are excluded in both directions. Existing captures still require the camera; there is no file upload. Limits remain 15 MiB per recording, 10 shared Cultural videos per author, and 1 GiB total stored media. Public here means other signed-in members. Media is stored until removed, and database backups can contain it.

Implementation: `server/cultural-videos.js`, `src/cultural-gallery.js`, and `src/cultural-recorder.js`. The media endpoint supports HTTP byte ranges for seeking and repeated GET requests without consumption counters or playback timers.

## “Database is locked” on startup

This means another connection holds a SQLite transaction; it is unrelated to the optional `.env not found` notice. Save or revert pending edits in DB Browser for SQLite, then close it. Stop any other Zindagi development/production server with Ctrl+C before running `npm.cmd start` again. Run only one backend for this prototype.

The app waits up to five seconds for each SQLite lock before reporting a recovery message. Brief competing writes can therefore finish without immediately failing startup. A failed startup closes its database connection and rolls back any unfinished migration. If a running API request encounters a persistent lock, it returns a retryable 503 response.

Do not delete `data/zindagi.sqlite`, `-wal`, or `-shm` files to clear a lock; they can contain saved progress. When browsing the database, use DB Browser's read-only opening mode when possible and avoid leaving an editing transaction open.

## Install as a mobile or desktop app (PWA)

Build and start the server, open its HTTPS address, and select **Install app**. Android users can also use Chrome's install menu; iPhone users use Safari → Share → Add to Home Screen. Zindagi launches from its icon in a standalone app window, using the same accounts, guilds, points, and Cultural videos.

The backend must remain online for shared features. An offline reconnect screen is provided; private API data and videos are not cached, and submissions are not queued offline. Use a stable HTTPS address for an app you intend to keep installed. See [PWA installation and operation](docs/pwa.md).

## Navigation and motion

On phones and tablets, use the header menu button to open the sliding navigation drawer. It includes Dashboard, Challenges, Leaderboard, Community, Guilds, and My profile; the mobile bottom tab bar has been removed. Tap outside or press Escape to close it. Keyboard focus stays inside while open, and the desktop sidebar remains available on larger screens.

The initial app screen, active API requests, recording preparation/submission, and video buffering have loading animations tied to their actual state. Pages and dialogs enter smoothly, and dropdown/disclosure arrows animate while opening. Native selects and video controls remain intact. Reduced-motion preferences disable these animations. Implementation: `src/interface.js` and `src/motion.css`.


## Friends and proximity-based Connect

In **Community → Find people**, use recommendations or search by exact username. Your own username is shown below the search field.

- **Add friend** sends a request. The recipient chooses Accept or Decline. It works at any distance and does not need location. Senders can cancel requests, and either person can remove an accepted friendship.
- **Connect** sends a separate request. The recipient can accept only when both people have opted into precise location and the server's current distance check passes. Existing friendship is not required. Accepted connections persist after you move away or stop sharing; either person can disconnect.
- Incoming requests, sent requests, friends, and connected people are listed separately. Request status refreshes every four seconds in the foreground. Pending Connect requests show Your GPS, Their GPS, and the 5–40 metre check to both people, with a link to **Location settings** in Profile and a **Check now** control. Sending Connect opens the request panel; only the recipient can accept. Temporary failures leave the request pending. Sign-out, blocking, and account changes do not transfer requests to another user.

For Connect, open **My profile** on both devices and choose a sharing duration and press **Start sharing**. Return to Community to send or accept requests. Allow the browser permission, and select Precise location in Android/iOS settings. The app requests high accuracy with no cached-position allowance; it cannot force the operating system to grant precision. A foreground watch plus non-overlapping fresh-position checks keeps the location current. Temporary GPS timeouts and network failures retry automatically without switching tracking off. Hiding the app pauses GPS and removes server presence; returning to the visible app resumes your existing opt-in. Switching app tabs does not stop location. Stop sharing clears the saved preference. Signing out or closing the page stops tracking; a future signed-in visit resumes the saved preference only with already-granted browser permission. Sharing does not run in the background. Use **Refresh GPS** without clearing a still-valid fix. Fresh watch updates suppress unnecessary extra GPS requests.

The server requires readings no more than **30 seconds old**, each reporting accuracy of **10 metres or better**. The measured separation must be **5–40 metres**, and that interval must also contain the separation plus/minus both reported accuracy radii. For example, 20 metres apart with ±2 m on each phone passes; 7 metres apart with ±2 m on each phone does not. Try the middle of the range outdoors for better results. A stale/uncertain fix leaves the request pending; it can be retried without resending.

This is a GPS-based estimate, not cryptographic proof of a meeting. Device accuracy estimates are imperfect, and a modified client can spoof location data. Exact coordinates are sent only to your backend for these checks, never to other users or the database. Private profiles can use direct username requests and Connect without appearing in nearby recommendations. Both users still need separate, explicit location consent.

SQLite automatically creates `social_links` for relationships. Legacy `connections` rows and browser circle bookmarks are not migrated into accepted links. Implementation: `server/social.js`, `src/social.js`, and `src/proximity-policy.js`.


## Community, notifications, and direct messages

Community has **Your people**, **Requests**, **Messages**, and **Find people**.
One person appears once in Your people even if you are both friends and connected.
The notification bell exists only in Community. Request and acceptance events are
stored in SQLite with account-scoped read state; opening the bell never requests
browser/OS notification permission. Accepting a request marks its incoming event
read. Cancelled or already handled requests are labelled resolved. Existing pending
requests are added to the inbox when the notification schema is first created.

Messages are plain text (up to 2,000 characters), available only when at least one
accepted friendship or connection exists. Pending requests and shared guilds do
not grant access. Blocking or removing the last relationship prevents either
person from fetching or sending further messages. History is retained in SQLite
and becomes accessible again if a relationship is later re-established. Messages
are server-stored, **not end-to-end encrypted**; the server/database operator can
access them. There are no file attachments, push notifications, or background
message deliveries. Unsent drafts stay only in this tab's memory and are cleared
on sign-out. Sends have idempotency keys so retrying a network failure does not
create duplicate messages. History loads 50 messages at a time and has an earlier
messages control. Conversation unread counts update while Community is open.

The new `notifications`, `direct_messages`, and `message_reads` tables are created
automatically. Unit/API coverage includes relationship access checks, blocks,
read cursor isolation, pagination, duplicate sends, and persistence across restart.
Design and interaction code lives in `src/community.js` and `src/community.css`;
backend authorization and storage live in `server/community.js`.


## Profile journal and location controls

The progress journal groups completions by local calendar day. Filter by life
aspect and the last 7/30 calendar days, or all available history. Eight entries
appear initially; Load more reveals eight at a time. Counts and points summarize
the filtered history, not lifetime totals. Account history currently contains the
latest 100 completions; browser-only history uses the entries saved on this device.
Practice and recorded-performance entries remain labelled. Local progress reset
is tucked under Manage local progress and retains its confirmation dialog.

Location is still configured only in My profile. New sharing defaults to a
**15-minute session**, never saved for another visit. It expires even if the app
is hidden; refreshing GPS or returning to the app does not extend its deadline.
Choose **While the app is open · remember my choice** for the existing saved
preference. Existing remembered choices continue to work. Both modes pause when
hidden and clear coordinates from the server; the 30-second freshness and 5–40
metre Connect acceptance rules are unchanged. The status card shows accuracy,
reading age, and own-device GPS readiness separately from the peer/distance
checks. Its updates and Stop action preserve unsaved profile form edits.
