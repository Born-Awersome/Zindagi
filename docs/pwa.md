# Install Zindagi as an app

Zindagi is a Progressive Web App (PWA): the same website installs on a home screen and launches in a standalone app window. No Android Studio, APK, app-store account, or extra backend is required. Accounts, guilds, task scoring, location discovery, Cultural recording, and replayable Cultural videos use your existing server and SQLite database.

## Run the installable build

On the host PC, stop the old server with Ctrl+C, then run:

```powershell
git pull origin main
npm.cmd install
npm.cmd run build
npm.cmd start
```

Open your **HTTPS URL** on the phone. See [HTTPS setup](device-recording.md) if you currently use an HTTP Wi-Fi address. A browser on the host can use localhost for development, but a phone cannot use the host's localhost address. `npm run dev` is for editing; the offline service worker is enabled only in the built app.

For a quick demo, keep the server and your HTTPS tunnel running. For an installed app you intend to keep, use a stable HTTPS domain. A temporary Cloudflare tunnel address changes when restarted: an app installed from the previous address will still try to open that old address. Install again from the new URL or move to a stable domain.

## Install

- **Android / Chrome:** tap Zindagi's **Install app** button. If Chrome does not offer its native prompt, use the browser menu → **Install app** or **Add to Home screen**.
- **iPhone / iPad:** open the link directly in Safari → **Share → Add to Home Screen**. Enable **Open as Web App** if shown, then tap Add.
- **Windows / Chrome or Edge:** use **Install app**, the browser's address-bar install icon, or the browser's Apps menu.

Launch Zindagi using its new icon. Use a normal browser session, not private/incognito mode. Browser version, enterprise policies, and prior installation can affect which install button appears. Give camera, microphone, and location access only when the relevant feature requests it. An installed PWA still needs a trusted HTTPS connection for these features.

Your signed-in account data stays on the backend. You may need to sign in again in the installed app, especially on iOS. Signed-out demo data is local to that browser/app storage and is not imported into server accounts.

## Connection and updates

This is a connected app. Keep the backend reachable while using accounts, guilds, scores, and recordings. If the network/server is unreachable when opening the app, a cached reconnect screen appears. Tap **Try again** after reconnecting. Offline use does not award points or queue uploads. A recording that has not been submitted can be lost if the app is closed or reloaded.

Only the public offline screen and launcher icons are cached. API responses, authentication data, shared videos, recording submissions, and HTML account views are **not** placed in the service-worker cache. Shared videos still support unlimited playback while online. Reopening the app online loads the current website. Service-worker updates do not force a reload or interrupt an active recording; close all Zindagi windows and reopen to activate a waiting worker.

## Files

- `public/manifest.webmanifest`: install identity, standalone display, icon metadata.
- `public/icons/`: regular, maskable, and Apple launcher artwork.
- `public/sw.js`: offline navigation fallback, with no API/media caching or background submission.
- `public/offline.html`: reconnect screen.
- `src/pwa.js`: native install prompt and Android/iOS/desktop installation guidance.
- `src/mobile.css`: phone safe areas, touch controls, and keyboard-friendly form sizing.

When changing the offline page or icons, also increment the cache version in `public/sw.js` so installed clients receive those resources on the next worker activation. The server serves the worker with `Cache-Control: no-cache` to allow update checks. This PWA does not produce an APK or add push notifications/background recording.
