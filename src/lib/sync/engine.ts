import type { Snapshot, SyncRuntime } from '#lib/crdt/runtime.js';
import { decodeSnapshot, encodeSnapshot } from '#lib/crdt/snapshot.js';
import { openFile, readFileHeader, sealFile, type UnlockedVault } from '#lib/vault/vault.js';
import type { RemoteStore } from './port.js';
import type { SyncState } from './state.js';

/**
 * One sync pass against a remote store (#53). Every file it writes is a
 * `.bwv` of kind 'sync', encrypted with the vault's key; the store sees
 * nothing but ciphertext and file names that are random ids. Layout:
 *
 *   upd/<deviceId>/<stamp>.bwv   a device's changes since its last push
 *   snap/<deviceId>-<stamp>.bwv  a whole document, written when compacting
 *   blob/<blobId>.bwv            one PDF
 *
 * Each device writes only files of its own, so two devices never write the
 * same file and no locking is needed: Yjs updates commute, and applying one
 * twice changes nothing. See docs/adr/0003-sync-transport.md.
 */

/** A Yjs update with no structs and no deletions. */
const EMPTY_UPDATE = new Uint8Array([0, 0]);

/** Update files on the remote before a pass rolls them into one snapshot. */
const COMPACT_AFTER = 30;

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

	async run(): Promise<SyncReport> {
		const report: SyncReport = {
			applied: 0,
			pushed: false,
			blobsUp: 0,
			blobsDown: 0,
			foreign: 0,
			unreadable: 0,
			compacted: false
		};
		const deviceId = await this.state.deviceId();
		const files = await this.store.list();
		const present = new Set(files);
		const progress = await this.state.progress();
		const seen = new Set(progress.seen.filter((path) => present.has(path)));
		const skipped = new Set((progress.skipped ?? []).filter((path) => present.has(path)));
		let remoteSV = progress.remoteSV;

		// 1. Pull: whole documents first, then other devices' changes.
		const isOwn = (path: string) =>
			path.startsWith(`upd/${deviceId}/`) || path.startsWith(`snap/${deviceId}-`);
		const pending = files
			.filter(
				(path) =>
					/^(snap|upd)\/.+\.bwv$/.test(path) &&
					!seen.has(path) &&
					!skipped.has(path) &&
					!isOwn(path)
			)
			.sort((a, b) => Number(a.startsWith('upd/')) - Number(b.startsWith('upd/')));
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
			await this.state.setProgress({
				seen: [...seen],
				skipped: [...skipped],
				remoteSV,
				dirty: false
			});
			const reached = this.runtime.stateVector();
			const path = `upd/${deviceId}/${stamp()}.bwv`;
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
			const path = `blob/${blobId}.bwv`;
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
		const documents = [...present].filter((path) => /^(snap|upd)\//.test(path));
		const updates = documents.filter((path) => path.startsWith('upd/'));
		if (updates.length > COMPACT_AFTER) {
			const path = `snap/${deviceId}-${stamp()}.bwv`;
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

		const latest = await this.state.progress();
		await this.state.setProgress({
			seen: [...seen],
			skipped: [...skipped],
			remoteSV,
			dirty: latest.dirty
		});
		return report;
	}
}
