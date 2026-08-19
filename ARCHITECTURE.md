# Architecture

How bewerby actually stores data, why it never leaves the device, and how
offline support and reminders work in practice - including where they fall
short. Written for whoever next touches this code, including future me.

## Data lives in exactly two browser storages

| What                                                           | Where                                                              | Why there                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application rows (title, company, status, history, notes, ...) | IndexedDB, via [Dexie](https://dexie.org/) (`src/lib/db/index.ts`) | Structured, queryable, and reactive - the board, analytics, and reminder engine all subscribe to the same `liveQuery` and update automatically when a row changes.                                                                                                                                                                                               |
| Attached PDFs                                                  | OPFS (Origin Private File System), via `src/lib/utils/opfs.ts`     | An application row stores only a `pdfRef` (a random filename), not the PDF bytes. Keeping large blobs out of IndexedDB rows means every board/analytics/reminder read - which touches _every_ row - stays cheap regardless of how many or how large the attached PDFs are. Each application row's `pdfRef` points at exactly one file under `application-pdfs/`. |

Nothing else exists: no server database, no account, no first-party or
third-party analytics. Application data (rows, PDFs, settings) never leaves
the device: no `sendBeacon`, no remote `<script>`, no `@import url()`, and
`dependencies` in `package.json` covers exactly three packages (Dexie,
pdf.js, and one currently-unused icon library), none of which do network
I/O. This is a deliberate, verified property, not an accident - see the
codebase audit referenced in [ROADMAP.md](ROADMAP.md).

There are exactly two `fetch()` call sites, both unrelated to application
data: the service worker's own asset fetches, and the contact form at
`/kontakt` (`src/routes/kontakt/+page.svelte`), which posts only what the
visitor types into that form - name, email, message - to
`https://contact.yinside.de/phpmailer.php`. That's a mail relay on separate
infrastructure operated by the same person as bewerby.de, not a third-party
processor, but it is a genuine cross-origin request; the CSP's `connect-src`
(`vite.config.ts`) explicitly allowlists that one origin, and the
Datenschutzerklärung (`/datenschutz`) discloses it. No other route makes
this - or any - network call.

The `Tier 3` "Cloud Sync" card on the Backup page is an honest,
clearly-labeled placeholder for a _planned_, not yet implemented,
end-to-end-encrypted sync feature - see the Backlog section of
[ROADMAP.md](ROADMAP.md).

### PDF migration history

Application rows used to embed the PDF as a `Blob` directly (`pdfBlob`).
Dexie's schema v2 (`src/lib/db/index.ts`) migrates every existing row to the
OPFS-backed `pdfRef` scheme the first time the database opens after an
upgrade, moving the actual bytes out to OPFS and deleting `pdfBlob` from the
row once the move succeeds. A row whose migration fails partway (e.g. OPFS
write error) simply keeps its `pdfBlob` and is retried on the next open,
rather than losing the attachment.

## Offline support: a fully static SPA shell, precached explicitly

`src/routes/+layout.ts` sets `ssr = false` and `prerender = true`: every
route becomes a static HTML document built once, not rendered per request.
That matters for two reasons - it removes a pointless server round-trip for
a page that renders zero data server-side (everything comes from IndexedDB,
which only exists in the browser), and it gives the service worker an actual
document per route to precache.

`src/service-worker.ts`'s install step precaches three things:

1. The built client JS/CSS bundle (`build` from `$service-worker`).
2. Everything under `static/` (`files` from `$service-worker`), with dotfiles
   filtered out - `adapter-node` serves static assets via `sirv`, which
   refuses dotfiles by default and would otherwise fail the whole
   installation on a single `static/.gitignore`.
3. **Every prerendered route document, listed explicitly**
   (`PRERENDERED_ROUTES`). This one is easy to get wrong: `build`/`files`
   above only cover the JS/CSS bundle and `static/`, never the route HTML
   itself. Without this explicit list, a route's document would only enter
   the cache the first time a _hard_ (non-SPA) navigation to it happened
   while online - which normal in-app link-clicking never triggers, since
   SvelteKit's client router swaps content without a real navigation. A user
   who only ever clicked between routes, then went offline and hard-reloaded
   one, would see nothing but this worker's offline fallback text. This was
   an actual bug, caught by the Playwright offline test in
   `tests/e2e/offline.spec.ts` - see ROADMAP.md's entry for that issue.

At runtime, navigations are network-first (an online user always sees the
current app shell; the cache is the offline fallback), while everything else
is cache-first (fingerprinted, immutable build assets never need a network
round-trip once cached).

### Known limit

The service worker's own idle timeout (~30 seconds without activity) means
nothing scheduled purely inside it survives the app being fully closed for
long - see Reminders below.

## Reminders: precise, but only while a tab is open

`src/lib/utils/reminders.ts` is the single source of truth for "when is a
follow-up due" (`getReminderDueAt`), used identically by the in-app alert
banner and the notification-firing engine so the two can never disagree.

- **Anchor point:** the timestamp of the application's first `sent` history
  entry (falling back to `appliedAt`, then `createdAt`) - not `updatedAt`.
  Editing an unrelated field, changing the card color, or dragging the card
  without changing its status must never push the follow-up date back.
- **Scheduling:** one precise `setTimeout` for whichever reminder is due
  next, rescheduled automatically whenever the applications table changes
  (via `liveQuery`) - not a polling loop.
- **Delivery:** via the active service worker's `showNotification`, falling
  back to an in-page `Notification` if none is controlling the page. A
  reminder is only marked "shown" (in `localStorage`) after it actually
  displayed, so a denied/unavailable permission can't permanently suppress
  a reminder that a user never actually saw.

**The honest limit:** reminders require bewerby to remain open in a tab
(foreground or backgrounded) at the moment they're due. A best-effort
Background Sync registration exists (`registerBackgroundSyncBestEffort`) but
is a documented no-op - kept only because some browsers surface its absence
as a PWA capability warning. There is no listener for it in the service
worker, because Background Sync only runs once connectivity returns and
there is nothing meaningful to reconcile for a 100%-local app with no server
to sync against. This is stated plainly to the user in Settings rather than
implied by an ambient "notifications: on" toggle.

## Security headers

Every route is prerendered, and `adapter-node` serves prerendered pages
through a static-file fast path that never invokes `src/hooks.server.ts` -
verified empirically. The headers that actually reach a deployed instance
come from `static/.htaccess` (Apache/Passenger level) instead:
`Content-Security-Policy: frame-ancestors 'none'` (the one CSP directive a
`<meta>` tag can't express - the rest of the policy is generated into that
tag automatically from `vite.config.ts`'s `csp.directives`), plus
`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`,
`Permissions-Policy`, and `Strict-Transport-Security`. `hooks.server.ts`
still sets the same headers, so they'd be correct the moment any route stops
being prerendered (e.g. a future dynamic API endpoint) without anyone having
to remember to add them.

## Testing strategy

- **Vitest** (`src/**/*.test.ts`) for pure logic that doesn't need a real
  browser: PDF-parsing heuristics, reminder math, backup serialization,
  analytics calculations, and the Dexie v1→v2 migration (via
  `fake-indexeddb`).
- **Playwright** (`tests/e2e/`) for everything that only a real browser can
  verify: the offline/service-worker behavior above, focus management in the
  application dialog, mobile navigation, and a full backup export → erase →
  import roundtrip with an actual PDF attachment.

See [ROADMAP.md](ROADMAP.md) for the full history of what was found and
fixed while building out this test coverage.
