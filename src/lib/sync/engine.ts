import type { Snapshot, SyncRuntime } from '#lib/crdt/runtime.js';
import { decodeSnapshot, encodeSnapshot } from '#lib/crdt/snapshot.js';
import { fromBase64, type KeyHeader } from '#lib/vault/format.js';
import { openFile, readFileHeader, sealFile, type UnlockedVault } from '#lib/vault/vault.js';
import { base64url } from './oauth.js';
import type { RemoteStore } from './port.js';
import type { Progress, SyncState } from './state.js';

/**
 * One sync pass against a remote store (#53). Every file it writes is a
 * `.bwv` of kind 'sync', encrypted with the vault's key; the store sees
 * nothing but ciphertext and file names that are random ids. Layout, below
 * `<vault>/<epoch>/` (the vault id as base64url, and the key's epoch):
 *
 *   upd/<deviceId>/<stamp>.bwv   a device's changes since its last push
 *   snap/<deviceId>-<stamp>.bwv  a whole document, written when compacting
 *   blob/<blobId>.bwv            one PDF
 *
 * Each device writes only files of its own, so two devices never write the
 * same file and no locking is needed: Yjs updates commute, and applying one
 * twice changes nothing. See docs/adr/0003-sync-transport.md.
 *
 * A key change (#56) starts a new epoch directory. Devices with the new key
 * write only there and remove the old epochs' files; a device still on an
 * old key finds the newer directory, stops, and reports its key header so
 * the user can unlock it with the new passphrase. See ADR 0005.
 */

/** A Yjs update with no structs and no deletions. */
const EMPTY_UPDATE = new Uint8Array([0, 0]);

/** Update files on the remote before a pass rolls them into one snapshot. */
const COMPACT_AFTER = 30;

/** The store directory of a vault: its id as base64url, so it is a safe path segment. */
export function vaultDir(vaultId: string): string {
	return base64url(fromBase64(vaultId));
}

/** `<vault>/<epoch>/<kind>/...bwv` taken apart; null for anything else. */
export function parsePath(
	path: string
): { vault: string; epoch: number; kind: 'upd' | 'snap' | 'blob' } | null {
	const match = /^([\w-]{22})\/(\d{1,10})\/(upd|snap|blob)\/.+\.bwv$/.exec(path);
	if (!match) return null;
	return { vault: match[1], epoch: Number(match[2]), kind: match[3] as 'upd' | 'snap' | 'blob' };
}

/**
 * Right to erasure (#56): removes every file of a vault from the store, all
 * epochs. Files of other vaults stay. Needs no key - the paths say whose
 * files they are.
 */
export async function eraseVaultFiles(store: RemoteStore, vaultId: string): Promise<number> {
	const own = vaultDir(vaultId);
	const paths = (await store.list()).filter((path) => parsePath(path)?.vault === own);
	for (const path of paths) await store.remove(path);
	return paths.length;
}

export interface SyncReport {
	/** Files from other devices merged in this pass. */
	applied: number;
	pushed: boolean;
	blobsUp: number;
	blobsDown: number;
	/** Files belonging to a different vault, left alone. */
	foreign: number;
	/** Files of this vault that could not be read. */
	unreadable: number;
	compacted: boolean;
	/** Files of earlier keys of this vault, removed. */
	retired: number;
	/**
	 * Another device changed the key (#56). The pass stopped before writing
	 * anything; this is the new key header, to unlock with the new passphrase.
	 */
	newerKey?: KeyHeader;
}

function stamp(): string {
	const random = crypto.getRandomValues(new Uint8Array(3));
	return `${Date.now().toString(36)}-${[...random].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export class SyncEngine {
	constructor(
		private readonly runtime: SyncRuntime,
		private readonly store: RemoteStore,
		private readonly vault: UnlockedVault,
		private readonly state: SyncState
	) {}

	private seal(snapshot: Snapshot): Promise<Uint8Array> {
		return sealFile(this.vault, 'sync', encodeSnapshot(snapshot));
	}

	/**
	 * Decrypts one remote file. Null for a file of another vault or one that
	 * does not decode - recorded in the report and not retried. A failed read
	 * (the network) throws instead, so it is retried on the next pass.
	 */
	private async open(path: string, report: SyncReport): Promise<Snapshot | null> {
		const bytes = await this.store.read(path);
		try {
			if (readFileHeader(bytes).vaultId !== this.vault.header.vaultId) {
				report.foreign++;
				return null;
			}
			const { kind, json } = await openFile(bytes, this.vault.root);
			const snapshot = kind === 'sync' ? decodeSnapshot(json) : null;
			if (!snapshot) report.unreadable++;
			return snapshot;
		} catch {
			report.unreadable++;
			return null;
		}
	}

	/**
	 * The header of a newer key of this vault, when another device changed
	 * it. Only a header that is what its directory says counts; anything
	 * else in there is ignored.
	 */
	private async newerKey(files: string[]): Promise<KeyHeader | undefined> {
		const { vaultId, epoch } = this.vault.header;
		const own = vaultDir(vaultId);
		const candidates = files
			.map((path) => ({ path, parsed: parsePath(path) }))
			.filter(
				({ parsed }) => parsed?.vault === own && parsed.epoch > epoch && parsed.kind !== 'blob'
			)
			.sort((a, b) => b.parsed!.epoch - a.parsed!.epoch);
		for (const { path, parsed } of candidates) {
			try {
				const header = readFileHeader(await this.store.read(path));
				if (header.vaultId === vaultId && header.epoch === parsed!.epoch) return header;
			} catch {
				// Not a vault file; try the next one.
			}
		}
		return undefined;
	}

	async run(): Promise<SyncReport> {
		const report: SyncReport = {
			applied: 0,
			pushed: false,
			blobsUp: 0,
			blobsDown: 0,
			foreign: 0,
			unreadable: 0,
			compacted: false,
			retired: 0
		};
		const deviceId = await this.state.deviceId();
		const listed = await this.store.list();
		const own = vaultDir(this.vault.header.vaultId);
		report.foreign = listed.filter((path) => {
			const parsed = parsePath(path);
			return parsed !== null && parsed.vault !== own;
		}).length;

		// 0. A newer key: stop before anything is written under the old one.
		report.newerKey = await this.newerKey(listed);
		if (report.newerKey) return report;

		const base = `${own}/${this.vault.header.epoch}/`;
		const files = listed.filter((path) => path.startsWith(base));
		const present = new Set(files);
		let progress = await this.state.progress();
		// Progress belongs to one key: after a key change everything is new, and
		// this device pushes its whole document once under the new key.
		if (progress.base !== base) {
			progress = { seen: [], skipped: [], dirty: true, base };
			await this.state.setProgress(progress);
		}
		const seen = new Set(progress.seen.filter((path) => present.has(path)));
		const skipped = new Set((progress.skipped ?? []).filter((path) => present.has(path)));
		let remoteSV = progress.remoteSV;
		// Emptied from elsewhere (another device erased it, #56): nothing this
		// device believed to be there is, so it pushes its whole document again.
		if (files.length === 0) remoteSV = undefined;
		const save = (next: Omit<Progress, 'base'>) => this.state.setProgress({ ...next, base });

		// 1. Pull: whole documents first, then other devices' changes.
		const isOwn = (path: string) =>
			path.startsWith(`${base}upd/${deviceId}/`) || path.startsWith(`${base}snap/${deviceId}-`);
		const isUpdate = (path: string) => path.startsWith(`${base}upd/`);
		const pending = files
			.filter(
				(path) =>
					parsePath(path)?.kind !== 'blob' && !seen.has(path) && !skipped.has(path) && !isOwn(path)
			)
			.sort((a, b) => Number(isUpdate(a)) - Number(isUpdate(b)));
		const incoming: Snapshot[] = [];
		for (const path of pending) {
			const snapshot = await this.open(path, report);
			if (snapshot) {
				incoming.push(snapshot);
				seen.add(path);
			} else {
				skipped.add(path);
			}
		}
		if (incoming.length > 0) {
			await this.runtime.applyRemote(incoming);
			remoteSV = this.runtime.advance(
				remoteSV,
				incoming.map((snapshot) => snapshot.update)
			);
			report.applied = incoming.length;
		}

		// 2. Push. The flag is cleared before the diff is taken, so a change
		// made while the file uploads marks the next pass dirty again.
		if ((await this.state.progress()).dirty || !this.runtime.covers(remoteSV)) {
			await save({ seen: [...seen], skipped: [...skipped], remoteSV, dirty: false });
			const reached = this.runtime.stateVector();
			const path = `${base}upd/${deviceId}/${stamp()}.bwv`;
			try {
				await this.store.write(
					path,
					await this.seal({ update: this.runtime.diffSince(remoteSV), blobs: {} })
				);
			} catch (err) {
				await this.state.markDirty();
				throw err;
			}
			seen.add(path);
			present.add(path);
			remoteSV = reached;
			report.pushed = true;
		}

		// 3. PDFs: upload what the remote lacks, fetch what this device lacks.
		const downloads: Snapshot[] = [];
		for (const blobId of this.runtime.referencedBlobIds()) {
			const path = `${base}blob/${blobId}.bwv`;
			if (present.has(path)) {
				if (await this.runtime.hasBlob(blobId)) continue;
				const snapshot = await this.open(path, report);
				if (snapshot) downloads.push(snapshot);
			} else {
				const bytes = await this.runtime.blobBytes(blobId);
				if (!bytes) continue;
				await this.store.write(
					path,
					await this.seal({ update: EMPTY_UPDATE, blobs: { [blobId]: bytes } })
				);
				present.add(path);
				report.blobsUp++;
			}
		}
		if (downloads.length > 0) {
			await this.runtime.applyRemote(downloads);
			report.blobsDown = downloads.length;
		}

		// 4. Compact: one snapshot replaces every document file this pass has
		// seen. Files that appeared since the listing are not touched.
		const documents = [...present].filter((path) => parsePath(path)?.kind !== 'blob');
		const updates = documents.filter(isUpdate);
		if (updates.length > COMPACT_AFTER) {
			const path = `${base}snap/${deviceId}-${stamp()}.bwv`;
			await this.store.write(
				path,
				await this.seal({ update: this.runtime.diffSince(), blobs: {} })
			);
			for (const old of documents) {
				if (!seen.has(old)) continue;
				await this.store.remove(old);
				seen.delete(old);
			}
			seen.add(path);
			report.compacted = true;
		}

		// 5. Earlier keys' files: everything they held is in this epoch now.
		// Whatever a removed device still writes under its old key goes too.
		for (const path of listed) {
			const parsed = parsePath(path);
			if (parsed?.vault !== own || parsed.epoch >= this.vault.header.epoch) continue;
			await this.store.remove(path);
			report.retired++;
		}

		const latest = await this.state.progress();
		await save({ seen: [...seen], skipped: [...skipped], remoteSV, dirty: latest.dirty });
		return report;
	}
}
