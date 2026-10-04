# ADR 0005: Changing the key, locking devices out, erasing the remote copy

- **Status:** accepted, 2026-10-02
- **Context:** Milestone 5, #56. Plan:
  [docs/e2e-sync-plan.md](../e2e-sync-plan.md)

## Context

A device that once had the vault's root key could decrypt every future
change. A lost phone, or a laptop given away, stayed in the vault for good.
Changing the passphrase was also missing, and erasing all data left the
encrypted copy at the sync target and its access token valid.

The plan proposed device keys: an ECDH key pair per device, the public
halves in the document, and on removal a new root wrapped for each
remaining device, so they would follow without any input.

## Decision

**One action: a new key.** "Change passphrase and lock devices out" makes a
new random root under the same vault id with the next epoch, wrapped under
a new passphrase and a new recovery key (`createVault(..., previous)`).
Nothing derives from the old root. Each wrap's AAD names its epoch, so an
old wrap carried into the new header opens nothing.

- **Changing the passphrase is the same action.** A rewrap that keeps the
  root would leave the old passphrase able to open the root from any older
  file, and so everything written afterwards too.
- **The current passphrase or recovery key is asked for first.** Otherwise
  a device left unlocked, with the key remembered, could set a key its
  owner does not know.

**Epoch directories at the target.** Every file now lives below
`<vault>/<epoch>/` (ADR 0003's layout inside it).

- The changing device pulls once more under the old key, then switches.
  Progress is kept per directory, so its first pass under the new key
  writes the whole document and all PDFs there.
- Every pass on the current key removes files of older epochs, including
  whatever a locked-out device still writes with the old key and its
  access token.
- A device on an older key finds a newer directory, stops before writing
  anything, and asks for the new passphrase. The header it unlocks comes
  from a file in that directory and is used only if its vault id and epoch
  match the directory. A forged one fails to unlock. After unlocking, the
  device pushes its whole document once, so changes it made before
  noticing are not lost.
- Files under the new key that do not decrypt with it count as
  unreadable and are never applied. That covers a locked-out device
  writing into the new directory with the old key.

**No device keys and no device list.** Every device that should stay
enters the new passphrase once. Devices without a shared target follow by
being paired again (pairing sends the current key) or by importing a newer
encrypted backup, which now adopts a newer epoch of the same vault even if
a key is remembered, and never an older one.

**Erasure.**

- `eraseVaultFiles` removes every file of the vault from the target, all
  epochs, and nothing of other vaults. The paths say whose files they are,
  so no key is needed.
- It is offered as "Disconnect and delete the files there" on the backup
  page, and as an option of "Erase all data".
- With the option on, the remote deletion runs first. If it fails, nothing
  local is deleted, so the user can retry instead of losing the key to
  files that still exist.
- Disconnecting and erasing all data revoke the access token where the
  provider allows it (Dropbox, Google).
- The erasure leaves a marker of three bytes with no content. A device
  still connected finds it, stops and disconnects instead of uploading
  everything again; only a target the user connects on purpose lifts it
  (amended 2026-10-04 - before, such a device refilled the target, which
  undid the erasure).

## Consequences

- One passphrase entry per remaining device after a key change.
- A lost phone is locked out of everything written after the change. What
  it already had cannot be taken back, and the UI says so.
- If a locked-out device still holds a token for a cloud target, it can
  keep writing junk there until access is revoked at the provider (in
  Dropbox: Settings, Connected apps). The junk is removed on every pass and
  never applied.
- Old recovery keys stop working with the change. The new one is shown
  once, like at setup.

## Alternatives considered

- **ECDH device keys (the plan):** no input on the remaining devices, but
  per-device key management, a device registry in the document, rewrap on
  every change, and a key handover protocol for each pairing. That is a
  lot of code for a rare event, and changing the passphrase would still
  need its own rewrap path.
- **Rewrap only, for a passphrase change:** keeps every device working,
  but the old passphrase keeps its power over old files and thus over the
  root.
- **Deleting the old files right away, from the changing device only:** a
  device that pushed under the old key in between would lose that push,
  and a failure midway would leave old PDF files behind under names the
  new key can no longer use. With epoch directories every device cleans
  up, and nothing depends on the order.
