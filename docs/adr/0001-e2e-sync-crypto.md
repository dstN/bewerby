# ADR 0001: Cryptography for encrypted backups and sync

- **Status:** accepted, 2026-10-01
- **Context:** Milestone 5, #50 (first implementation), later #53–#56. Plan:
  [docs/e2e-sync-plan.md](../e2e-sync-plan.md)

## Context

bewerby is going to put application data on servers it does not control:
first as a file the user drops into iCloud Drive or any synced folder (#50),
then through Dropbox, OneDrive and Google Drive (#53, #54), and between the
user's own devices (#55). Its promise so far was that this data never leaves
the device. The replacement promise is that it leaves the device only
encrypted, to destinations the user picks, and that nobody along the way -
the storage provider, bewerby.de, a network observer - can read it.

That rules out anything server-side, and it means the format has to stand on
its own: a file found in a cloud folder years later must open with what the
user still has (a passphrase or a recovery key) and nothing else.

## Decision

**Everything happens in the browser, with WebCrypto.** The only exception
is Argon2id, which WebCrypto does not offer yet (WICG `webcrypto-modern-algos`
proposes it; no browser ships it as of this writing).

**Key hierarchy.**

- A random 32-byte **root secret** per vault. It never touches storage
  unwrapped. After setup or unlock it is imported as a non-extractable HKDF
  key, and the raw bytes are zeroed.
- It is wrapped (AES-256-GCM) twice:
  - under a key from the **passphrase** via Argon2id: m = 64 MiB, t = 3,
    p = 1, random 16-byte salt. That is above OWASP's minimum (19 MiB,
    t = 2) and costs about a second on a phone (to be re-measured in #49).
  - under a key from a **recovery key** via HKDF-SHA256: 160 random bits,
    shown once as 32 Crockford base32 characters. It has full entropy, so it
    needs no slow KDF.
- Each wrap is bound to its vault, epoch and slot through the GCM additional
  data, so wraps cannot be swapped between vaults or between the passphrase
  and recovery slots.
- **Content keys** are derived from the root with HKDF, one per purpose
  (`bewerby/v1/file` today; sync updates, PDFs and the live channel get
  their own). No key ever serves two purposes.

**File format** (`.bwv`): `"BWV" | version byte | header length (u32 BE) |
header JSON | AES-256-GCM ciphertext`. The whole prefix is the additional
data, so tampering anywhere fails authentication. The header carries the
wrapped keys, which makes every file self-contained. The plaintext is the
existing `BackupPayload` JSON, gzipped and padded with Padmé to a size class.
That hides how many applications and PDFs a file holds at no more than 12 %
overhead. Every encryption uses a fresh random 96-bit IV.

**Parsing untrusted headers.** The header has to be read before anything is
authenticated, so its parser validates every field and caps the KDF
parameters (256 MiB, t ≤ 10, p ≤ 4). Otherwise a crafted file could exhaust
memory before the tag check ever runs.

**Losing the key.** If the passphrase is forgotten, the recovery key opens
everything. With sync, any other paired device does too. If the passphrase,
the recovery key and every device are all gone, the data is gone. That is
the price of nobody else being able to open it, and the setup says so
before the vault exists.

**On the device.** The key header lives in a separate IndexedDB database,
`bewerby-keys`. If the user chooses to remember the key, the root is stored
there as a non-extractable `CryptoKey`: the browser can use it, but will not
export its bytes. Anything that runs script on the origin can use it anyway.
That is no worse than today, since the same script can read the plaintext
applications in `bewerby-db`.

## Consequences

- One new dependency, `hash-wasm` (MIT, no dependencies, no network I/O).
  The CSP already allows WebAssembly for pdf.js. It runs in a Web Worker so
  the page stays responsive. A test checks it against Node's native Argon2id.
- The format has a version byte and the header records the KDF parameters,
  so a later switch to native WebCrypto Argon2, or to stronger parameters,
  does not orphan old files.
- Each file is encrypted in one piece, entirely in memory. That is fine for
  hundreds of applications with PDFs. Past roughly 200 MB a chunked format
  (the STREAM construction) would be the upgrade.
- Changing the passphrase only re-wraps the root. Copies of older files
  still open with the old passphrase; the UI has to say that once #56 adds
  passphrase changes.
- Removing a device (#56) needs a new epoch: a new root, wrapped for the
  passphrase, the recovery key and each remaining device's ECDH key. The
  epoch field is already in the header for that.

## Alternatives considered

- **PBKDF2-SHA256 with 600,000 iterations:** native and dependency-free, but
  far cheaper to attack with GPUs than a memory-hard KDF. The file is
  exactly what an attacker would get from a cloud account.
- **Passphrase only, no recovery key:** one forgotten passphrase would
  destroy every backup. A recovery key with full entropy costs one screen in
  the setup.
- **The passphrase-derived key used directly for content:** changing the
  passphrase would then mean re-encrypting everything everywhere, and every
  purpose would share one key.
- **libsodium (secretstream, Argon2id):** a solid design, but a whole
  cryptographic library bundled into the app for what WebCrypto plus one
  KDF covers. It also replaces the platform's AEAD with a bundled one.
- **Storing the raw key, or the passphrase, for convenience:** a
  non-extractable `CryptoKey` gives the same convenience without the bytes
  ever being readable.
