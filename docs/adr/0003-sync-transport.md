# ADR 0003: Moving sync data through folders and cloud storage

- **Status:** accepted, 2026-10-01. The Dropbox, OneDrive and Google Drive
  adapters are implemented but not yet verified against real apps (#49).
- **Context:** Milestone 5, #53. Plan: [docs/e2e-sync-plan.md](../e2e-sync-plan.md)

## Context

The Yjs document from #52 merges any updates it is given. What was missing
is a way for devices to hand updates to each other without being online at
the same time. The constraints:

- No server of ours in the data path. (Revisited in
  [ADR 0006](0006-relay-store.md): what matters is that nothing readable
  leaves the device, and bewerby.de can carry ciphertext like any provider.)
- Nothing readable at the storage location.
- No locking: Dropbox and a folder synced by Nextcloud cannot provide it.

## Decision

**One engine, interchangeable stores.** `RemoteStore` (`src/lib/sync/port.ts`)
has four methods: list, read, write, remove. `SyncEngine` (`engine.ts`) does
everything else, so a new provider is an adapter of about a hundred lines.

**Each device only writes files of its own.** Below `<vault>/<epoch>/` (the
vault id as base64url and the key's epoch; added with #56, see
[ADR 0005](0005-key-change.md)):

```
upd/<deviceId>/<stamp>.bwv   this device's changes since its last push
snap/<deviceId>-<stamp>.bwv  a whole document, written when compacting
blob/<blobId>.bwv            one PDF
```

Two devices never write the same file, so there is nothing to lock and no
write conflict for a provider to resolve. Yjs updates commute and are
idempotent, so the order files arrive in does not matter, and neither does
applying one twice.

**A pass:**

1. _Pull_ every file not yet applied, snapshots first.
2. _Push_ one update file.
3. _Upload_ PDFs the remote lacks, _download_ PDFs this device lacks,
   _remove_ PDFs no row refers to any more. A device writes a document
   change before its PDFs, so a PDF in the listing always comes with a
   change the pull has applied, and is never taken for an orphan.
4. _Compact_ once there are more than 30 update files: write one snapshot,
   then delete every document file this pass has applied. Files that
   appeared after the listing, and files of another vault, are left alone.

**Knowing when to push** needs two signals, because a Yjs diff always
carries the complete delete set and deletions do not move the state vector:

- a persisted `dirty` flag, set by every local change;
- a remote state vector, raised by every applied file, which catches content
  that arrived by file import and was never pushed.

The flag is cleared before the diff is taken, so a change made while the
upload runs keeps the next pass dirty.

**Every file is a `.bwv`** of kind `sync`, carrying the key header. So any
single file lets a new device ask for the passphrase and join, and no
separate key file (`vault.bwk` in the plan) is needed.

**Adapters:**

- **Folder** (File System Access, Chromium desktop). bewerby writes into a
  `bewerby-sync` folder inside a folder the user picks, and the user's own
  sync client (Nextcloud, iCloud for Windows, Proton Drive, Syncthing, …)
  carries the files. `createWritable()` swaps the file in on close, so a
  client never picks up half a file. The handle is persisted, and its
  permission is asked for again with a click.
- **Dropbox**: OAuth 2.0 with PKCE and no client secret, an offline refresh
  token, and the "App folder" access type, so the token reaches
  `/Apps/<app>` and nothing else. The browser calls Dropbox directly.
- **OneDrive** (#54): a single-page-app registration, so PKCE without a
  secret again, and the `Files.ReadWrite.AppFolder` scope. Microsoft limits
  SPA refresh tokens to 24 hours; after that the user signs in again, which
  is usually a redirect without a prompt. Downloads go through
  `@microsoft.graph.downloadUrl`: `/content` answers with a redirect, which
  a preflighted CORS request may not follow. That URL lives on OneDrive's
  file hosts or on SharePoint, which is why those wildcard hosts are in the
  CSP when OneDrive is configured. The exact hosts still have to be
  confirmed against real accounts (#49).
- **Google Drive** (#54): the `drive.appdata` scope, a folder hidden even
  from the user. Google refuses to redeem or refresh a code from a web
  client without its client secret, so those two calls - and revocation -
  go through a broker, `/api/oauth/google` on bewerby.de. It adds the
  secret from the server's environment and returns the token fields. It
  stores nothing and logs nothing, checks the Origin, accepts only this
  app's callback as redirect URI, caps the body and throttles per IP. All
  file traffic still goes from the browser to Google directly. Multipart
  uploads up to Google's 5 MB limit, a resumable session above it.

**OAuth return.** `/cloud/callback` is prerendered and precached. The
service worker answers navigations to it from the cache alone, so the code
in the URL does not reach the server or its access log. The page removes
code and state from the address bar right away. The state guards against
CSRF and is single-use; the verifier waits in `sessionStorage`.

**Configuration.** Client ids are public. They come from repository
variables at build time through Vite `define`. A provider without one is
not offered, and its origins stay out of the CSP's `connect-src`.

**The runner** (`runner.svelte.ts`) syncs on start, 20 seconds after a local
change, every minute, and when the tab becomes visible again. As with the
reminders, nothing happens while no tab is open.

## Consequences

- The storage location learns how many files a device writes and when:
  activity patterns, not content.
- PDFs removed from every application stay at the remote as orphaned
  encrypted files. Deleting the remote copy as a whole is part of #56.
- Refresh tokens sit in this browser's IndexedDB. Script on the origin
  could use them, but they only reach an app folder, which holds only
  ciphertext. Google's pass through our server on every refresh, which is
  stated in the privacy policy.
- Folder sync works only in Chromium-based desktop browsers; elsewhere the
  encrypted file from #50 remains the manual way.

## Alternatives considered

- **One shared file per vault, overwritten each time:** needs conditional
  writes (ETags) and conflict handling at every provider, and loses data
  when a provider resolves a conflict by keeping one copy.
- **A separate key file at the remote:** one more file to keep consistent,
  when every data file already carries the header.
- **Dropbox's SDK:** a dependency for four HTTP calls. The adapter uses the
  same endpoints the official SDK does.
