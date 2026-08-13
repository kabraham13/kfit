# kfit

A minimal, fast, offline-first workout logger for the gym. Runs as an
installable PWA and keeps all your data on your device.

**Live:** https://kabraham13.github.io/kfit/

## Why

Most workout trackers are either Android-only or want an account and a
subscription. kfit keeps the parts that matter — fast set entry, an exercise
library, PR tracking, honest CSV import/export — with no server, no login, and
no data leaving your phone unless you explicitly link Google Drive.

## Features

- **Offline-first.** Everything is stored locally in IndexedDB via Dexie. The app
  works with no connection at all; installing it as a PWA makes it behave like a
  native app.
- **Fast set logging.** Pick an exercise, punch in weight and reps, repeat.
  Previous sets for the exercise are visible while you log.
- **Rest timer.** Configurable default duration with ±15/30s adjustment. Uses a
  wall-clock deadline so it keeps correct time when you switch apps, and fires a
  chime, vibration, and a system notification when it completes — even if you're
  in another app with the screen off.
- **PR detection.** Flags max-weight, estimated-1RM, and rep PRs as you log, with
  a bit of confetti. 1RM uses the Epley formula (`weight × (1 + reps / 30)`).
- **Exercise library.** Seeded with a standard exercise and category set; add
  your own custom exercises.
- **History and calendar.** Per-exercise history charts and a month calendar view
  of training days.
- **CSV import/export.** Reads and writes a plain columnar format
  (`Date, Exercise, Category, Weight, Reps, Distance, Time, Comment`), so you can
  migrate your history in and get your data back out at any time.
- **Google Drive backup.** Optional. Syncs a CSV backup to a `kfit_backups`
  folder in your own Drive once every 24 hours, keeping a rolling 7 most recent
  backups. Uses the `drive.file` scope, so kfit can only ever see files it
  created — not the rest of your Drive.
- **OLED Minimalist UI.** Pure pitch-dark (`#09090b`) theme with solid zinc cards, high-contrast tabular typography, electric blue CTAs, and emerald set completion indicators.
- **lbs / kg** throughout, with cardio (distance and time) supported alongside
  weight training.

## Tech

React 18 · TypeScript · Vite · Tailwind CSS · Dexie (IndexedDB) · vite-plugin-pwa
(Workbox) · PapaParse · lucide-react

No backend. The only network calls are to Google's APIs, and only if you link
Drive.

## Development

```bash
npm install
npm run dev      # http://localhost:3000, bound to 0.0.0.0 for phone testing
npm run build    # type-check + production build to dist/
npm run preview  # serve the production build locally
npm run lint
```

Testing on a real phone is worth the trouble for this app — the rest timer's
background behaviour, notifications, vibration, and PWA install flow can't be
meaningfully exercised in a desktop browser.

## Deployment

Pushes to `main` deploy to GitHub Pages via `.github/workflows/deploy.yml`. The
build sets `base: '/kfit/'`, so the app expects to be served from that subpath.
The workflow also accepts a manual `workflow_dispatch` run.

Service worker changes only take effect after the old worker is replaced — fully
close and reopen the installed PWA (or hard-refresh) when testing anything that
touches `sw.js`, notifications included.

## Google Drive setup

The OAuth client ID is baked into the build, so linking Drive is one tap and
needs no configuration. If you fork this and want your own client:

1. Create an OAuth 2.0 **Web application** client in the Google Cloud console.
2. Add your origin (e.g. `https://<user>.github.io`, no trailing slash and no
   path) under **Authorized JavaScript origins**. Authorization uses Google
   Identity Services, which communicates via postMessage — no redirect URI is
   needed.
3. Enable the Google Drive API for the project.
4. Set `VITE_GOOGLE_CLIENT_ID` at build time, or edit the default in
   `src/utils/googleDriveBackup.ts`.

5. Set the OAuth consent screen's **Publishing status** to *In production*. While
   it is in *Testing*, Google expires the grant after 7 days and you will be
   asked to sign in again roughly daily. `drive.file` is a non-sensitive scope,
   so publishing does not require going through verification review.

Access tokens last an hour and are renewed silently in the background — there is
no refresh token, because there is no server. Renewal failures are classified:
transient ones (blocked popup, timeout, offline) retry with backoff, while a
genuinely revoked grant shows a "Reconnect" prompt. Settings has an expandable
"Session renewed / renew failed" line showing the last renewal's error code.

## Data and privacy

Your training data lives in your browser's IndexedDB and nowhere else. There is
no analytics, no telemetry, and no account. Clearing site data or uninstalling
the PWA deletes your logs — export a CSV or enable Drive backup if that matters
to you.

## License

Distributed under the MIT License. See [`LICENSE`](file:///home/kevin/Documents/kfit/LICENSE) for details.
