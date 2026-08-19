# bewerby

A privacy-first job application tracker. Kanban board, PDF autofill,
analytics, backups, and follow-up reminders — all running entirely in your
browser, with nothing sent to a server.

## Why

- **Local-only by construction.** Every application, PDF, and setting lives
  in this browser's IndexedDB and OPFS. There is no account, no backend
  database, and no analytics/telemetry - see [ARCHITECTURE.md](ARCHITECTURE.md)
  for exactly where data lives and why.
- **Offline-first PWA.** Installable, and every route keeps working without a
  network connection once it's been loaded once.
- **German/English UI**, switchable at any time.

## Features

- Kanban board (draft → sent → interview → accepted/rejected) with both
  drag-and-drop and a keyboard/touch-friendly per-card status control.
- PDF autofill: upload a job posting or cover letter and key fields
  (company, title, contact details) are extracted automatically via
  best-effort text heuristics.
- Analytics: funnel/conversion rates and response-time stats.
- Backup & restore: JSON export/import (attached PDFs included), plus an
  optional local-directory dump via the File System Access API.
- Configurable follow-up reminders via the Notifications API.
- One-button right to erasure: wipes IndexedDB, OPFS, localStorage, caches,
  and any pending notifications.

## Tech stack

- SvelteKit 2 / Svelte 5 (runes), fully client-rendered
  (`ssr = false`, `prerender = true` - see [ARCHITECTURE.md](ARCHITECTURE.md))
- [Dexie](https://dexie.org/) 4 over IndexedDB for application data; OPFS for
  attached PDFs
- [pdf.js](https://mozilla.github.io/pdf.js/) for client-side PDF text
  extraction
- Hand-written CSS with design tokens (`src/app.css`) - no CSS framework
- `@sveltejs/adapter-node`, deployed via a small Phusion Passenger-compatible
  entry point (`app.cjs`) - see [DEPLOYMENT.md](DEPLOYMENT.md)
- [Vitest](https://vitest.dev/) for unit tests, [Playwright](https://playwright.dev/)
  for an end-to-end smoke suite

## Getting started

```sh
npm install
npm run dev
```

Requires Node ≥26 to install/build (see `package.json`'s `engines` field).
The production server itself only needs Node ≥20 - see
[DEPLOYMENT.md](DEPLOYMENT.md) for why those two numbers differ.

## Testing

```sh
npm run test       # Vitest unit tests
npm run test:e2e   # Playwright smoke suite (builds and runs the real production server)
npm run check      # svelte-check
npm run lint       # prettier + eslint
```

All four run on every push and pull request via GitHub Actions
(`.github/workflows/ci.yml`).

## Project structure

```text
src/
  routes/            the app's pages: kanban board (/), analytics, backup,
                      settings, plus impressum/datenschutz
  lib/
    components/       Kanban board + application dialog, layout (sidebar/
                       nav), shared UI (date picker, ...)
    db/                Dexie schema and migrations
    utils/             PDF parsing, backup serialization, reminders,
                       analytics, OPFS helpers
    i18n/              de/en translations + typed accessor
  service-worker.ts   offline precache and fetch strategy
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
