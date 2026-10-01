# ADR 0002: Merging devices with a Yjs document

- **Status:** accepted, 2026-10-01
- **Context:** Milestone 5, #52. Plan: [docs/e2e-sync-plan.md](../e2e-sync-plan.md)

## Context

Two devices that both change the same applications while apart have to end
up with one state containing both sets of changes. Merging backups row by row
cannot do that: it duplicates rows, cannot tell an edit from an addition, and
has no idea a row was deleted elsewhere. #41 asked for merging "without data
loss", including two edits of the same cover letter.

The board, the statistics and the reminder engine all read Dexie through
`liveQuery`, and that has to keep working unchanged.

## Decision

**A Yjs document is the source of truth on every device that has a vault.**
Dexie stays the read model. `src/lib/crdt/runtime.ts` materializes the
document into the `applications` table. The repository from #51 hands every
write to the runtime, which applies the same rules to the document. A device
without a vault keeps writing Dexie directly and never downloads Yjs, which
is loaded through a dynamic import in `session.ts`.

**Document layout** (`src/lib/crdt/schema.ts`):

- `apps` is a `Y.Map` from a stable `uid` to one `Y.Map` per application.
  `notes` and `coverLetter` are `Y.Text`, so concurrent edits interleave
  instead of one replacing the other. `tags` and `history` are `Y.Array`.
  Every other field is a plain map entry.
- Edits touch only changed fields, and a text edit is a single splice
  between the common prefix and suffix. Rewriting a whole value would make
  it collide with an edit made elsewhere.
- **Status is stored together with the time it was set.** A `Y.Map` resolves
  concurrent writes by client id, not by time, so two devices moving the
  same card would otherwise keep an arbitrary one of the moves. Both moves
  survive in `history`. When reading, the status follows a history entry
  that is _newer_ than the stored value. A rule of "the newest history entry
  wins" would be simpler, but it would misread rows from before 2026-08-18,
  whose history stops short of their status.
- `deleted` maps a uid to the time it was removed. Deletions are replicated
  explicitly, so a row deleted on one device is deleted everywhere. It also
  means a table row the document has never seen (written while sync was
  off, or before it existed) is adopted into the document, never mistaken
  for a deletion. A rule like "delete what the document lacks" would have
  destroyed exactly those rows.
- `profile` is the sender block and the global CV. The palette of custom
  colours is not synced: it is a device preference, and cards carry their
  colour themselves.
- PDFs are not in the document. A row refers to them by a **random blob
  id**. The `blobs` table maps each blob id to this device's OPFS file, and a
  snapshot carries the bytes of every referenced blob.

**Persistence.** Every document update is appended to the `crdt` table and
merged into one update once there are more than 200. On every start the
runtime replays them and then materializes the table. That also repairs a
crash between persisting an update and writing the row.

**Transport for now** is the encrypted file from #50, kind `sync`: the
document state plus the PDFs it refers to. Importing one **merges**.
"Replace" restores the file's state instead, closing the running document
and rebuilding the table from the file. Files of kind `backup` stay
readable.

## Consequences

- Two new runtime dependencies: `yjs` and its `lib0`. Both are MIT-licensed
  and loaded only on devices with a vault.
- Every write on a syncing device costs a document transaction, a persisted
  update and a table write. That is irrelevant at the scale of one person's
  applications.
- The document grows with its history; compaction keeps the number of
  stored updates bounded, not the size. Deleted rows leave a uid and a
  timestamp behind for good.
- A field that is not text or a list resolves to one of two concurrent
  values. For a salary or a contact name that is acceptable; for status it
  was not, hence the timestamp.
- Device clocks matter for the status rule only, and only when two devices
  move the same card at nearly the same time.

## Departures from the plan

- **Blob ids are random, not an HMAC of the content.** Random ids reveal no
  content to a storage provider either, and they need no key. A device that
  does not remember its key could not compute an HMAC, so it could not
  attach a PDF. The only thing an HMAC would buy is de-duplicating identical
  PDFs.
- **The status rule** is "newer than the stored value" rather than "newest
  history entry", for the old rows described above.
- **No preview before a merge.** A merge never overwrites, and the
  destructive variant, replace, asks for confirmation first, as the JSON
  import does.

## Alternatives considered

- **Field-level last-writer-wins, without a library:** smaller, but two
  edits of the same text would lose one. Rejected when the plan was decided.
- **Automerge:** an equally capable CRDT, but WebAssembly-based and much
  larger. Yjs's binary updates and state vectors also map directly onto the
  per-device update files of the cloud layout (#53).
- **y-indexeddb for persistence:** it would add a second database, which
  erasure (#56) would also have to find. The `crdt` table in `bewerby-db`
  is erased with everything else.
- **Yjs for every device, vault or not:** one code path, but every user
  would pay for the library and the duplicate storage without syncing
  anything.
