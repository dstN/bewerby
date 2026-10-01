# Architecture

How bewerby actually stores data, why it never leaves the device, and how
offline support and reminders work in practice - including where they fall
short. Written for whoever next touches this code, including future me.

## Where data lives in the browser

| What                                                                        | Where                                                              | Why there                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application rows (title, company, status, history, notes, ...)              | IndexedDB, via [Dexie](https://dexie.org/) (`src/lib/db/index.ts`) | Structured, queryable, and reactive - the board, analytics, and reminder engine all subscribe to the same `liveQuery` and update automatically when a row changes.                                                                                                                                                                                               |
| Attached PDFs                                                               | OPFS (Origin Private File System), via `src/lib/utils/opfs.ts`     | An application row stores only a `pdfRef` (a random filename), not the PDF bytes. Keeping large blobs out of IndexedDB rows means every board/analytics/reminder read - which touches _every_ row - stays cheap regardless of how many or how large the attached PDFs are. Each application row's `pdfRef` points at exactly one file under `application-pdfs/`. |
| Sync state on a device with a vault: the Yjs update log and the blob-id map | IndexedDB `bewerby-db`, tables `crdt` and `blobs` (schema v3)      | The document the rows are materialized from (see "Syncing devices" below), kept in the same database so erasure takes it along.                                                                                                                                                                                                                                  |
| Encrypted-backup keys (wrapped root key, optionally the remembered key)     | IndexedDB `bewerby-keys`, via `src/lib/vault/keystore.ts`          | Only exists once encryption is set up. A database of its own rather than a table in `bewerby-db`: key material stays out of every query the board, analytics and reminders run, and erasing it is one `deleteDatabase`. See "Encrypted backups" below.                                                                                                           |

Nothing else exists: no server database, no account, no first-party or
third-party analytics. Application data (rows, PDFs, settings) never leaves
the device: no `sendBeacon`, no remote `<script>`, no `@import url()`, and
`dependencies` in `package.json` covers exactly four packages (Dexie,
pdf.js, pdf-lib, and hash-wasm for Argon2id), none of which do network
I/O. This is a deliberate, verified property, not an accident - see the
codebase audit referenced in [ROADMAP.md](ROADMAP.md).

There are exactly three `fetch()` call sites in client code, none of which
carry application data:

1. The service worker's own asset fetches.
2. The contact form at `/kontakt` (`src/routes/kontakt/+page.svelte`), which
   posts only what the visitor types into that form - name, email, message -
   to `https://contact.yinside.de/phpmailer.php`. That's a mail relay on
   the same netcup server as bewerby.de (both hosts resolve to the same IP),
   not a third-party processor, but it is a genuine cross-origin request; the
   CSP's `connect-src` (`vite.config.ts`) explicitly allowlists that one
   origin.
3. The job-ad link import, which posts one public URL to this app's own
   `/api/fetch-ad` - same origin, nothing else in the body, nothing stored.
   See "Importing a job ad" below for what that does and does not give away.

All three are disclosed in the Datenschutzerklärung (`/datenschutz`). No
other route makes this - or any - network call, and no rows, PDFs or profile
data are part of any of them.

The `Tier 3` "Cloud Sync" card on the Backup page is an honest,
clearly-labeled placeholder for a _planned_, not yet implemented,
end-to-end-encrypted sync feature - see the Backlog section of
[ROADMAP.md](ROADMAP.md).

## One write path for application rows

Every write to `applications` goes through `src/lib/data/applications.ts`:
`createApplication`, `updateApplication`, `removeApplication` and
`importApplications`. That covers the edit dialog, the board's moves and
deletes, the dispatch dialog and the backup import. Reads stay free, and
`liveQuery` keeps working unchanged.

There are two reasons for it. First, the rules that used to live in each
caller now live in one place:

- a changed status is appended to `history`
- a move drops an entered rejection date unless the caller sets one
- `updatedAt` is set on every write
- an update that matches no row throws instead of resolving like a
  successful write (Dexie's own `update()` resolves with 0)

Second, it gives the sync layer (#52) exactly one place to see every change.
An ESLint `no-restricted-syntax` rule in `eslint.config.js` fails the build
on any `db.applications` write or `db.transaction` outside `src/lib/data`
and `src/lib/db`. The profile and colour stores need no such layer: their
store methods already are the only way to change them.

## Importing a job ad: three routes, one parser

A posting reaches the form three ways, and all of them converge on
`parseJobText`/`parseJobDocument` and the same review panel, so no route can
silently write a field another would have asked about:

1. **A PDF**, parsed in the browser with layout information (pdf.js).
2. **Pasted text** (`application.paste.*`), for a posting copied off a job
   board along with its Impressum block.
3. **A link** (`application.fetch.*`), fetched server-side - see below.

### Why the link import goes through the server, and what that costs

A browser cannot fetch a third-party page from page JavaScript at all
(same-origin policy), so a link import is either server-side or it does not
exist. The objection to building it was that a server would learn which
vacancies somebody reads. That is a real cost, and it is a smaller one than
it first looks:

- The request carries **one public URL and nothing else**. No row, no PDF,
  no profile, no identifier. Application data still never leaves the device.
- The URL travels in the **POST body, never the query string**, so Apache's
  access log - which does record the path and the client IP, and rotates on
  the schedule stated in the Datenschutzerklärung - records that the import
  was used, not what for.
- Nothing is stored, cached or logged by the endpoint itself. The one thing
  it holds is the client IP with a counter, in memory, for the one-hour
  rate-limit window (40 fetches per IP), so the route cannot serve as a free
  open proxy. Expired entries are swept on every request, which is what lets
  the Datenschutzerklärung promise "up to one hour" rather than "until the
  next restart". The IP comes from Passenger's `!~Passenger-Client-Address`
  header, not the socket - behind Passenger the socket peer is Passenger
  itself, which would put every visitor into one bucket - and not from
  `X-Forwarded-For`, which any client can send; Passenger rejects requests
  that carry a `!~` header of their own.
- The job board sees **our** IP, not the applicant's. For someone applying
  out of a current position this discloses strictly less to third parties
  than opening the link themselves would.
- The feature is optional; the paste box sits directly underneath and works
  offline, which the link import cannot.

The CSP needs no widening for this: the browser talks to `'self'`, which
`connect-src` already allows. The route is the only one in the app with
`prerender = false`, which also means it is the only one where
`hooks.server.ts` actually runs and sets the security headers - the reason
that hook was written before there was anything for it to do.

### The SSRF guard is the load-bearing part

An endpoint that fetches a URL handed to it is an open proxy into whatever
the server can reach and the caller cannot: Plesk on localhost, the hoster's
private network, cloud metadata at 169.254.169.254, and the wider internet
under our IP. `src/lib/server/urlGuard.ts` (under `$lib/server`, so SvelteKit
cannot bundle it into client code) is what makes that not work:

- `https:` only, no embedded credentials.
- Every address the host resolves to must be public - **all** of them, since
  a host answering with one public and one private address would otherwise
  walk straight through a first-match check. IPv4, IPv6 and IPv4-mapped
  IPv6 are all judged by the same ranges - including the mapped form in hex
  (`::ffff:7f00:1`), which is the only one that ever arrives from a URL: the
  WHATWG parser serializes `[::ffff:127.0.0.1]` that way, so a check for the
  dotted form alone let a bare mapped literal straight through.
- Redirects are followed **by hand**, re-running the full check on every
  hop, because a public host answering `302 http://127.0.0.1:8443` defeats a
  one-time check completely.
- Caps: 8 s timeout, 3 redirects, 2 MB body read incrementally, HTML-ish
  content types only, and one identical error status for every upstream
  failure so the response cannot be used to probe what exists internally.
- A per-IP hourly throttle keeps it from becoming a free open proxy.

**Checked address = connected address.** Validating DNS and then letting
`fetch()` resolve again was a time-of-check/time-of-use window: a zero-TTL
record answering public on the first lookup and private on the second
(DNS rebinding) walked through. The request therefore goes over `node:https`
rather than `fetch()`, because only that takes a `lookup`: `publicLookup`
applies the same rule at connect time, to the very address the socket uses.
`assertPublicUrl` still runs up front for the scheme, credentials and bare IP
literals, which never reach a lookup at all. `fetch()` could only do this
through an undici dispatcher, and undici is not a dependency of ours - it is
only present transitively under jsdom. Every early exit destroys the
response, so a refused or oversized body never keeps a socket open on a
host the caller chose.

### What actually works

Measured against live sites: the Bundesagentur für Arbeit, StepStone and
LinkedIn all return a readable page; Indeed refuses automated requests
outright. A page that renders its posting entirely client-side is the other
expected miss - the server gets the shell, not the ad - and it looks the
same to the user as a block: not much came back. When a fetch fails for any
reason the UI says so and points at the paste box, which is why that box
stays visible underneath rather than being replaced.
schema.org `JobPosting` JSON-LD - which those boards emit because Google for
Jobs requires it - is read first and marked `high` confidence, since it is
the employer's own structured data rather than a guess off the layout.

### PDF migration history

Application rows used to embed the PDF as a `Blob` directly (`pdfBlob`).
Dexie's schema v2 (`src/lib/db/index.ts`) migrates every existing row to the
OPFS-backed `pdfRef` scheme the first time the database opens after an
upgrade, moving the actual bytes out to OPFS and deleting `pdfBlob` from the
row once the move succeeds. A row whose migration fails partway (e.g. OPFS
write error) keeps its `pdfBlob` rather than losing the attachment - and
since Dexie runs an upgrade exactly once, the retry lives in an
`on('ready')` handler that moves whatever is left on every open. Dexie holds
other queries until it resolves, so the boot-time orphan sweep already sees
the new `pdfRef`. Without it, such a row kept its PDF in a field nothing
reads: invisible in the UI and dropped from every backup.

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
   installation on a single `static/.gitignore`. Because all of it ships to
   every visitor, `scripts/check-static.mjs` (run as `prebuild`) fails the
   build on anything not allowlisted: by name at the root, by extension at
   any depth inside `fonts/`, `app-icons/` and `screenshots/`.
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

- **Anchor point:** the row's own `reminderAt` - an absolute timestamp - when
  it has one. The editor writes it whenever the user picks a date outright
  ("Eigenes Datum") or changes the interval, anchoring the new countdown on
  the moment of that change rather than on the application date; re-picking
  7 days on something sent a month ago would otherwise be due instantly.
  Saving an edit that leaves the interval alone never touches it.
- **Anchor point, legacy rows:** `reminderAt` is optional, so anything
  written before it existed still counts the interval from the application
  date, `getAppliedAt` (see "Dates: what was entered beats what was logged"
  below) - never `updatedAt`. Editing an unrelated field,
  changing the card color, or dragging the card without changing its status
  must never push the follow-up date back, under either anchor.
- **One-shot:** a reminder fires once per due date, deduplicated by
  `bewerby_notified_<id>_<dueAt>` in `localStorage`. There is no repeat
  interval; a second nudge means picking a new date, which yields a new
  `dueAt` and therefore a new key.
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

## Proof-of-applications export

The Agentur für Arbeit wants a list of who was applied to and when
(_Eigenbemühungen_). Both formats on `/board` render the same three columns -
date, company, status - from one function, `toExportRows` in
`src/lib/utils/applicationExport.ts`, so they can never disagree about the
date, the ordering or the status wording:

- **CSV** for a spreadsheet: `;`-separated, CRLF, with a UTF-8 BOM, which is
  what a German Excel opens correctly on a double-click. A comma-separated
  file lands entirely in column A there, and without the BOM every umlaut is
  mojibake. Any cell starting with `=`, `+`, `-` or `@` is prefixed with an
  apostrophe: the file is opened by somebody else on a machine we know
  nothing about, and the content came out of a parsed job ad.
- **PDF** for handing in on paper (`applicationListPdf.ts`): an A4 table that
  repeats its header on every page and numbers the pages, so a missing sheet
  is visible. pdf-lib is imported dynamically, exactly as in
  `coverLetterPdf.ts`, and the page geometry is shared with it rather than
  copied.

The date is `getAppliedAt()` from `reminders.ts` - the same date the card
shows and the follow-up reminder counts from, because "when did I apply" has
to be one date, not two. A rejection's status cell carries its date as well -
"Absage (12.03.2026)" - from `getRejectedAt()`: the outcome column is where a
Nachweis asks for it, and it keeps CSV and PDF at three columns. Both dates
follow the rule in the next section.

The export takes what the board's filter bar currently shows, minus
everything that was never sent: drafts, and drafts archived straight into
"Absage". Which rows those are is `wasSent` (also in `reminders.ts`), the
same rule the statistics funnel counts by - a Nachweis and the "sent" stage
have to agree on what an application is.

## Dates: what was entered beats what was logged

The application date and the rejection date each come from one function in
`reminders.ts`, and every reader goes through it: the card, the date sort,
the edit dialog, the reminder anchor, the export and the statistics.

- **`getAppliedAt`:** the date entered in the edit dialog (`sentAt`), else
  the first move into "Versendet" in the history, else `appliedAt`, else
  `createdAt`. `getSentAt` is the same chain without the last two fallbacks,
  for the statistics, which time a response only from a real send.
- **`getRejectedAt`:** the date entered in the edit dialog (`rejectedAt`),
  else the move into "Absage" - but only while the card is rejected and its
  history ends in that move. An older "rejected" entry further back would
  date the wrong rejection, so a legacy row without one has no date rather
  than a made-up one.

People drag a card days after the letter went out or the rejection arrived,
so the move alone would misdate a Nachweis. The dialog pre-fills both pickers
with what the functions return, and stores an entered date only when the
user actually changed the picker: left alone, a date keeps following the
move instead of freezing a copy of it.

`sentAt` is a field of its own because `appliedAt` cannot say whether the
user entered it - the dialog has written `appliedAt` on every save,
pre-filled with the creation day for a draft. Preferring it over the history
would date every card that was created as a draft and sent later by the day
it was created. It stays, as the fallback for rows without a "sent" entry.

`rejectedAt` is cleared by every status change (board and dialog), so a card
rejected, reopened and rejected again never carries the first rejection's
date. `sentAt` is not: the application date is the _first_ send, so moving
on to an interview or a rejection does not change it. An entered application
date also makes `wasSent` count a draft archived straight into "Absage" -
the user saying it went out outweighs what the board saw.

## Statistics funnel: counted from the history, not the column

`computeApplicationStats` (`src/lib/utils/analytics.ts`) sorts every row into
three nested stages - sent, selection, offer - and the column a card sits
in is not enough to place it, because "Absage" is where both a rejection
and an abandoned draft end up:

- **Sent** (`wasSent` in `reminders.ts`, shared with the export): every
  status past draft, except a rejection whose history shows it came straight
  from draft without ever being sent. A rejection with no
  draft entry at all (logged after the fact directly in that column, or a
  legacy row without history) records a real rejection and counts, and so
  does one with an entered application date.
- **Selection:** interviews, offers, and only those rejections whose history
  contains an interview. Offers count unconditionally - leaving one out
  would push the success rate past 100 %.

Each stage is a subset of the one before, so no rate can exceed 100 %. Both
the board and the edit dialog append every status change to `history`,
which is what makes it trustworthy here - since 2026-08-18. Before that the
edit dialog changed a status without logging it, so an old row's history
can stop short of its current status (created as a draft, set to "Absage"
in the dialog: `[draft]`). A rejection whose history does not end in
"rejected" is therefore counted as sent: that history proves nothing either
way. Response times measure from the send (`getSentAt`) to the first
interview or rejection _after_ it, so a rejection logged before the send is
ignored. Entered dates win here as everywhere: the current rejection counts
by `getRejectedAt` instead of its logged move.

## Collapsible cards

A collapsed card keeps company, priority, date and the dispatch/delete
buttons; title, salary, tags and the status select are not rendered. The
toggle is the dot in front of the company - a `<button>` of its own with
`aria-expanded`, sitting _next to_ the card's open button rather than inside
it, since a button inside a button is invalid HTML. Cards without a colour
marker get a grey dot so every card has one. The filter bar's "Alle
zuklappen"/"Alle einblenden" acts on the cards the current filter shows.

The collapsed ids are a view preference, not application data, so they live
in `localStorage` (`bewerby-collapsed-cards`, listed on `/datenschutz`)
instead of on the Dexie row - which also keeps them out of backups and the
`updatedAt` of the application. Deleting a card drops its id; the
right-to-erasure button clears the key with the rest of `localStorage`.

## Encrypted backups

The `.bwv` file on `/backup` is the first piece of Milestone 5
(end-to-end encrypted sync, [docs/e2e-sync-plan.md](docs/e2e-sync-plan.md)).
It is encrypted entirely in the browser, and the provider of whatever folder
it lands in - iCloud Drive via the Files app, Proton Drive, Nextcloud - gets
ciphertext of a rounded-up size and nothing else. The decisions behind the
format and the key handling are in
[docs/adr/0001-e2e-sync-crypto.md](docs/adr/0001-e2e-sync-crypto.md).

- **Keys.** A random 32-byte root secret, AES-GCM-wrapped twice: once under
  a key derived from the passphrase with Argon2id (64 MiB, t = 3), once under
  a key derived with HKDF from a 160-bit recovery key that is shown exactly
  once. Content is encrypted with a key HKDF derives from the root for that
  one purpose. After setup or unlock the root only exists as a
  non-extractable `CryptoKey`.
- **Format** (`src/lib/vault/format.ts`): `BWV`, a version byte, the header
  length, the header JSON and the ciphertext. Everything before the
  ciphertext is AES-GCM additional data, so a flipped byte anywhere fails.
  The header carries the wrapped keys, so a file opens on a device that has
  never seen this vault. It is parsed before anything is authenticated,
  which is why the KDF parameters are capped there: without a ceiling a
  crafted file could ask for gigabytes of Argon2 memory.
- **Payload:** the same `BackupPayload` the JSON export writes, gzipped with
  the native `CompressionStream` and padded to a Padmé size class. Importing
  goes through `parseBackupPayload` and the same merge/replace code as the
  JSON import (`applyBackup` on the page), so the two cannot drift.
- **Argon2id runs in a Web Worker** (`kdf.worker.ts`). A second of hashing
  on the main thread would freeze the page, including the "working" message
  a screen reader is waiting for. WebCrypto has no Argon2 yet, so hash-wasm
  does it; `vault.test.ts` checks it against Node's native implementation.
- **Remembering the key** is a per-device choice. Without it, the key stays
  unlocked for the current visit only. A device without a vault of its own
  takes over the vault of the first file it imports, so its own exports open
  with the same passphrase and recovery key - the groundwork for syncing
  devices later.
- **Erasure:** `eraseAllData` deletes `bewerby-keys` along with everything
  else. Neither the passphrase nor the recovery key is stored anywhere.
- The import accepts `application/octet-stream` as well as `.bwv`: iOS greys
  out files whose extension it does not know when only the extension is
  listed.

## Syncing devices: a Yjs document behind the table

On a device with a vault, a Yjs document is the source of truth, and the
`applications` table is materialized from it. The board, analytics and
reminders keep reading Dexie through `liveQuery`, unchanged. Decision and
alternatives: [docs/adr/0002-crdt-yjs.md](docs/adr/0002-crdt-yjs.md).

- **Where it plugs in.** The repository (`src/lib/data/applications.ts`)
  asks `activeSync()` (`src/lib/crdt/session.ts`) on every write. With a
  vault, the write goes to `SyncRuntime` (`runtime.ts`), which applies the
  same rules to the document and then writes the affected rows. Without
  one, nothing changes and Yjs is never loaded.
- **Identity.** Schema v3 gives every row a `uid`, because the local `id`
  differs on every device.
- **Merge rules** (`schema.ts`): notes and cover letter merge character by
  character; tags and history keep both devices' additions; other fields
  resolve to one value. Status follows a history entry only if that entry
  is newer than the stored status, so two devices moving the same card keep
  the later move, and old rows whose history stops short of their status
  keep it.
- **Deletions are tombstones** (`deleted` in the document). A table row the
  document does not know is adopted, never deleted. That is how the first
  start brings every existing row in, and how rows written while sync was
  off survive.
- **PDFs** stay in OPFS. Rows refer to them by random blob ids, and the
  `blobs` table maps those to this device's files.
- **Persistence**: updates go into the `crdt` table and are merged into one
  once there are more than 200. Each start replays them and materializes
  the table, which also repairs a crash in between.
- **The profile** syncs through a port the profile store registers once it
  has loaded. Registered earlier, an empty profile could have been taken
  for the device's and synced out over the real one.
- **The encrypted file** of a syncing device has kind `sync`: the document
  state plus the PDFs it refers to. Importing it merges, and two devices
  can exchange files back and forth without duplicates. "Replace" restores
  the file's state instead.

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
  browser: PDF-parsing heuristics, reminder math, the reminder engine's
  scheduling/dedup (fake timers + a substituted `liveQuery`), backup
  serialization, analytics calculations, `isValidApplication`'s field-by-field
  import validation, the theme/i18n/color stores (jsdom, with `localStorage`
  and `matchMedia` stood in via `tests/setup/browser-globals.ts` - Node 26
  shadows jsdom's own `localStorage`, and jsdom has no `matchMedia` at all),
  translation-file parity between `de.json`/`en.json`, the Dexie v1→v2
  migration (via `fake-indexeddb`), and the encrypted-backup core: round
  trips by passphrase and recovery key, a flipped byte anywhere failing, a
  fuzzed header parser, Padmé bounds, and hash-wasm's Argon2id against
  Node's native one.
- **Playwright** (`tests/e2e/`) for everything that only a real browser can
  verify:
  - the offline/service-worker behavior above, focus management in the
    application dialog, mobile navigation, and a full backup export → erase →
    import roundtrip with an actual PDF attachment;
  - `board-filters.spec.ts` drives the search/tag/priority/color filters and
    the sort dropdown through the real controls, not the underlying
    `$derived`, plus collapsing cards singly, all at once and across a reload;
  - `preferences.spec.ts` checks the theme/locale stores against the actual
    no-FOUC behavior in `app.html` - i.e. that the stored value is on
    `<html>` _before_ first paint, not just that the store's state is right;
  - `mobile-layout.spec.ts` asserts nothing overflows a 320px/390px viewport
    on any route, the populated board, or the modal - written after exactly
    that bug in the board's search input (see the file's own comment for the
    box-sizing root cause, fixed by the global `border-box` reset in
    `app.css`);
  - `a11y.spec.ts` runs an [axe-core](https://github.com/dequelabs/axe-core)
    scan against every route, in both themes, at desktop and 390px width,
    against **WCAG 2.2 Level AAA** plus axe's `best-practice` ruleset (not
    just the usual AA baseline) - including the populated board, analytics
    with real data, the application dialog, and the date picker popover, plus
    hand-written checks for things axe can't assert on its own (skip-link
    behavior, live-region announcements, `inert` on the closed mobile drawer,
    `prefers-reduced-motion`). Getting the AAA contrast rules to pass meant
    retuning several color tokens in `app.css`'s `:root`/`:root.dark` blocks
    (`--text-secondary`/`--text-tertiary`, `--color-accent-text`,
    `--color-accent-600`/`700`, `--color-danger`/`-solid`, the sidebar's
    active-item tint) - see that file's comments for the reasoning behind
    each value.

See [ROADMAP.md](ROADMAP.md) for the full history of what was found and
fixed while building out this test coverage.
