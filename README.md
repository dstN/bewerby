# bewerby

A privacy-first job application tracker. Kanban board, job-ad autofill,
analytics, backups, proof-of-applications export and follow-up reminders —
all running in your browser, with your application data never leaving it.

## Why

- **Local-only by construction.** Every application, PDF, setting and the
  sender profile lives in this browser's IndexedDB, OPFS and localStorage.
  There is no account, no backend database, and no analytics/telemetry.
  The single server endpoint that exists, the optional job-ad link import,
  receives one public URL and stores nothing beyond an in-memory, one-hour
  rate-limit counter per IP - see [ARCHITECTURE.md](ARCHITECTURE.md) for
  exactly where data lives, what that endpoint does, and why.
- **Offline-first PWA.** Installable, and every route keeps working without a
  network connection once it's been loaded once.
- **German/English UI**, switchable at any time.

## Features

- Kanban board (draft → sent → interview → accepted/rejected) with both
  drag-and-drop and a keyboard/touch-friendly per-card status control.
  Cards collapse to company, priority, date and their mail/delete buttons -
  one at a time via the dot in front of the company, or all at once from the
  filter bar - and stay that way across reloads.
- Three ways to fill in a posting, all feeding the same review panel so
  nothing is written without being shown first: upload the **PDF**, **paste
  the ad's text**, or **give it a link** - the last one fetched server-side
  through `/api/fetch-ad`, which reads schema.org `JobPosting` data when the
  page has it. That endpoint receives one public URL and nothing else; see
  [ARCHITECTURE.md](ARCHITECTURE.md) for what it does and does not give away.
- Analytics: funnel/conversion rates and response-time stats.
- Proof of applications for the Agentur für Arbeit: date, company and status
  of every application on the board that was actually sent - no drafts - as
  a print-ready **PDF** or a **CSV** a German Excel opens correctly. A
  rejection is listed with its date.
- Application and rejection dates follow the card's moves into "Versendet"
  and "Absage" unless you enter the real date in the edit dialog - then the
  entered date counts everywhere: card, export, statistics, reminders.
- Encrypted backup: one `.bwv` file, encrypted in the browser (AES-256-GCM,
  passphrase via Argon2id, plus a recovery key shown once), safe to keep in
  iCloud Drive or any other cloud folder and restorable on another device.
  Devices merge through it: notes and cover letters character by character,
  deletions included, no duplicates.
- Sync between your devices, end-to-end encrypted: through a folder your
  sync client keeps in step (Nextcloud, iCloud for Windows, Proton Drive,
  Syncthing) or through Dropbox, OneDrive or Google Drive, which only ever
  see ciphertext in an app folder of their own.
- Add a device by QR code without typing the passphrase on it, and keep
  devices that are open at the same time in step live, over a direct
  WebRTC connection.
- Pairing passes the paired device's cloud account along, so a device
  that was closed catches up through it when opened again. bewerby.de
  itself stores none of it.
- Change the passphrase and lock a lost device out with one new key; erase
  the encrypted copy at the sync target along with everything else.
- Backup & restore: JSON export/import (attached PDFs included), plus an
  optional local-directory dump via the File System Access API.
- Follow-up reminders via the Notifications API - a fixed interval, or a
  date you pick yourself. Changing the interval restarts the countdown from
  that moment, not from the day you applied.
- One-button right to erasure: wipes IndexedDB, OPFS, localStorage, caches,
  and any pending notifications.

## Tech stack

- SvelteKit 3 / Svelte 5 (runes). Every _page_ is client-rendered and
  prerendered (`ssr = false`, `prerender = true`); the sole exception is the
  `/api/fetch-ad` endpoint - see [ARCHITECTURE.md](ARCHITECTURE.md)
- [Dexie](https://dexie.org/) 4 over IndexedDB for application data; OPFS for
  attached PDFs
- [pdf.js](https://mozilla.github.io/pdf.js/) for client-side PDF text
  extraction, [pdf-lib](https://pdf-lib.js.org/) (dynamically imported) for
  generating cover letters and the proof-of-applications list
- Hand-written CSS with design tokens (`src/app.css`) - no CSS framework
- `@sveltejs/adapter-node`, deployed via a small Phusion Passenger-compatible
  entry point (`app.cjs`) - see [DEPLOYMENT.md](DEPLOYMENT.md)
- [Vitest](https://vitest.dev/) for unit tests, [Playwright](https://playwright.dev/)
  for end-to-end, mobile-layout, and accessibility tests (the latter via
  [axe-core](https://github.com/dequelabs/axe-core), held to WCAG 2.2 AAA)

## Getting started

```sh
npm install
npm run dev
```

Requires Node ≥26 (see `package.json`'s `engines` field) - the same version
the production server runs. See [DEPLOYMENT.md](DEPLOYMENT.md) for the
server setup.

## Testing

```sh
npm run test       # Vitest unit tests
npm run test:e2e   # Playwright suite (builds and runs the real production server)
npm run check      # svelte-check
npm run lint       # prettier + eslint
```

All four run on every push and pull request via GitHub Actions
(`.github/workflows/ci.yml`).

`test:e2e` covers more than CRUD/offline/backup smoke tests: `tests/e2e/a11y.spec.ts`
scans every route, both themes, and mobile with axe-core against WCAG 2.2
**Level AAA** plus axe's best-practice ruleset (not just the usual AA
baseline), and `tests/e2e/mobile-layout.spec.ts` asserts nothing overflows the
viewport at 320px/390px - see [ARCHITECTURE.md](ARCHITECTURE.md) if you're
adding to either.

## Project structure

```text
src/
  routes/            the app's pages: landing (/), board, analytics, backup,
                      settings, plus impressum/datenschutz
    api/fetch-ad/     the one non-prerendered route: server-side job-ad fetch
  lib/
    components/       Kanban board + application dialog, layout (sidebar/
                       nav), shared UI (date picker, ...)
    db/                Dexie schema and migrations
    server/            server-only code (SSRF guard) - never bundled to a client
    utils/             PDF/HTML parsing, backup serialization, reminders,
                       analytics, application export, OPFS helpers
    i18n/              de/en translations + typed accessor
  service-worker/     offline precache and fetch strategy (own tsconfig)
tests/e2e/            Playwright specs
```

## Documentation

- [DEPLOYMENT.md](DEPLOYMENT.md) - how to deploy to Netcup/Plesk (Phusion
  Passenger)
- [ARCHITECTURE.md](ARCHITECTURE.md) - where data lives, why it never leaves
  the device, how offline support and reminders actually work, and their
  known limits
- [ROADMAP.md](ROADMAP.md) - the v1 production-readiness roadmap, kept
  up to date issue by issue
