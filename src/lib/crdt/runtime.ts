import * as Y from 'yjs';
import { isValidApplication, type Application, type BewerbyDatabase } from '#lib/db/index.js';
import type { ApplicationChanges, NewApplication } from '#lib/data/applications.js';
import { MissingApplicationError } from '#lib/data/errors.js';
import { readPdfFromOpfs, writePdfToOpfs } from '#lib/utils/opfs.js';
import type { Profile } from '#lib/utils/profile.js';
import {
	applyChanges,
	moveTo,
	newRowMap,
	readProfile,
	readRow,
	statusTime,
	writeProfile,
	type DocRow,
	type RowMap
} from './schema.js';

/**
 * The sync layer of a device that has a vault (#52). The Yjs document is
 * the source of truth; the `applications` table in Dexie is materialized
 * from it, so the board, statistics and reminders keep reading Dexie through
 * liveQuery exactly as before. See docs/adr/0002-crdt-yjs.md.
 *
 * Only loaded once a vault exists - it is imported dynamically by
 * session.ts - so a device without sync never downloads Yjs.
 */

/** Transaction origins, so persistence and materialization can tell writes apart. */
export const ORIGIN = { local: 'local', remote: 'remote', load: 'load' } as const;

/** Persisted updates are merged into one once there are more than this. */
const COMPACT_AFTER = 200;

/** How the profile store hands its state over, without a circular import. */
export interface ProfilePort {
	get(): Profile;
	/** Applies a profile that came out of the document. Must not write it back. */
	set(profile: Profile): void;
}

/** A complete document state plus the PDF bytes it refers to. */
export interface Snapshot {
	update: Uint8Array;
	blobs: Record<string, Uint8Array>;
}

export class SnapshotError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = 'SnapshotError';
	}
}

function sameRow(a: Application, b: Application): boolean {
	const left = a as unknown as Record<string, unknown>;
	const right = b as unknown as Record<string, unknown>;
	const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
	keys.delete('id');
	for (const key of keys) {
		if (JSON.stringify(left[key]) !== JSON.stringify(right[key])) return false;
	}
	return true;
}

export class SyncRuntime {
	readonly doc = new Y.Doc();
	private persisting: Promise<unknown> = Promise.resolve();
	private profilePort?: ProfilePort;

	private constructor(private readonly db: BewerbyDatabase) {
		this.doc.on('update', (update: Uint8Array, origin: unknown) => {
			if (origin === ORIGIN.load) return;
			this.persisting = this.persisting
				.then(() => this.db.crdt.add({ update }))
				.catch((err) => console.error('Persisting a sync update failed:', err));
		});
	}

	private get apps(): Y.Map<RowMap> {
		return this.doc.getMap<RowMap>('apps');
	}

	/**
	 * uid -> when it was deleted. Replicated like everything else, so a row
	 * deleted on one device goes on all of them - and a row the document has
	 * simply never seen (written while sync was off) is adopted, not
	 * mistaken for a deleted one.
	 */
	private get deleted(): Y.Map<number> {
		return this.doc.getMap<number>('deleted');
	}

	private get profile(): Y.Map<unknown> {
		return this.doc.getMap<unknown>('profile');
	}

	static async open(db: BewerbyDatabase): Promise<SyncRuntime> {
		const runtime = new SyncRuntime(db);
		const stored = await db.crdt.toArray();
		if (stored.length > 0) {
			Y.applyUpdate(runtime.doc, Y.mergeUpdates(stored.map((entry) => entry.update)), ORIGIN.load);
			if (stored.length > COMPACT_AFTER) await runtime.compact();
		}
		// On the first start this adopts every existing row; afterwards it
		// picks up rows written while sync was off, and repairs a crash between
		// persisting an update and materializing it.
		await runtime.materialize();
		return runtime;
	}

	/** Resolves once every update so far is persisted. */
	async flush(): Promise<void> {
		await this.persisting;
	}

	async close(): Promise<void> {
		await this.flush();
		this.doc.destroy();
	}

	private async compact(): Promise<void> {
		const merged = Y.encodeStateAsUpdate(this.doc);
		await this.db.transaction('rw', this.db.crdt, async () => {
			await this.db.crdt.clear();
			await this.db.crdt.add({ update: merged });
		});
	}

	private async blobIdFor(ref: string): Promise<string> {
		const link = await this.db.blobs.where('ref').equals(ref).first();
		if (link) return link.blobId;
		const blobId = crypto.randomUUID();
		await this.db.blobs.add({ blobId, ref });
		return blobId;
	}

	private async refFor(blobId: string): Promise<string | undefined> {
		return (await this.db.blobs.get(blobId))?.ref;
	}

	/** The blob fields for whichever of pdfRef/cvRef the input carries. */
	private async blobFields(
		input: Pick<Application, 'pdfRef' | 'cvRef'>
	): Promise<Partial<Pick<DocRow, 'pdfBlob' | 'cvBlob'>>> {
		const out: Partial<Pick<DocRow, 'pdfBlob' | 'cvBlob'>> = {};
		if ('pdfRef' in input)
			out.pdfBlob = input.pdfRef ? await this.blobIdFor(input.pdfRef) : undefined;
		if ('cvRef' in input) out.cvBlob = input.cvRef ? await this.blobIdFor(input.cvRef) : undefined;
		return out;
	}

	private async toDocRow(row: Application, uid: string): Promise<DocRow> {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars -- dropped on purpose: local keys
		const { id, uid: _uid, pdfRef, cvRef, ...fields } = row;
		return { ...fields, uid, ...(await this.blobFields({ pdfRef, cvRef })) };
	}

	private async toApplication(row: DocRow): Promise<Application> {
		const { pdfBlob, cvBlob, ...fields } = row;
		const app: Application = { ...fields };
		const pdfRef = pdfBlob ? await this.refFor(pdfBlob) : undefined;
		const cvRef = cvBlob ? await this.refFor(cvBlob) : undefined;
		if (pdfRef) app.pdfRef = pdfRef;
		if (cvRef) app.cvRef = cvRef;
		return app;
	}

	/**
	 * Writes document rows into the table: the given uids, or all of them.
	 * A full pass also deletes rows the document has tombstoned and adopts
	 * rows it does not know. Returns the local id of every upserted uid.
	 */
	async materialize(uids?: Iterable<string>): Promise<Map<string, number>> {
		const keys = uids ? [...uids] : [...this.apps.keys()];
		const prepared: Array<{ uid: string; app: Application | null }> = [];
		for (const uid of keys) {
			const map = this.apps.get(uid);
			prepared.push({ uid, app: map ? await this.toApplication(readRow(uid, map)) : null });
		}

		const ids = new Map<string, number>();
		const unknown: Application[] = [];
		await this.db.transaction('rw', this.db.applications, async () => {
			for (const { uid, app } of prepared) {
				const existing = await this.db.applications.where('uid').equals(uid).first();
				if (!app) {
					if (existing?.id !== undefined) await this.db.applications.delete(existing.id);
					continue;
				}
				if (!isValidApplication(app)) {
					console.warn(`Sync: skipping a row that is not a valid application (${uid})`);
					continue;
				}
				if (existing?.id !== undefined) {
					// Unchanged rows are left alone: every write wakes liveQuery.
					if (!sameRow(existing, app)) await this.db.applications.put({ ...app, id: existing.id });
					ids.set(uid, existing.id);
				} else {
					ids.set(uid, await this.db.applications.add(app));
				}
			}
			if (uids) return;
			for (const row of await this.db.applications.toArray()) {
				if (row.uid && this.apps.has(row.uid)) continue;
				if (row.uid && this.deleted.has(row.uid) && row.id !== undefined) {
					await this.db.applications.delete(row.id);
					continue;
				}
				unknown.push(row);
			}
		});

		if (unknown.length > 0) {
			for (const [uid, id] of await this.adopt(unknown)) ids.set(uid, id);
		}
		if (!uids) await this.pushProfile();
		return ids;
	}

	/** Brings table rows the document does not know into it. */
	private async adopt(rows: Application[]): Promise<Map<string, number>> {
		const entries: Array<{ row: Application; doc: DocRow }> = [];
		for (const row of rows) {
			entries.push({ row, doc: await this.toDocRow(row, row.uid ?? crypto.randomUUID()) });
		}
		this.doc.transact(() => {
			for (const { row, doc } of entries) this.apps.set(doc.uid, newRowMap(doc, statusTime(row)));
		}, ORIGIN.local);
		const ids = new Map<string, number>();
		await this.db.transaction('rw', this.db.applications, async () => {
			for (const { row, doc } of entries) {
				if (row.id === undefined) continue;
				if (row.uid !== doc.uid) await this.db.applications.update(row.id, { uid: doc.uid });
				ids.set(doc.uid, row.id);
			}
		});
		await this.flush();
		return ids;
	}

	async create(data: NewApplication, now: number): Promise<number> {
		const uid = crypto.randomUUID();
		const { pdfRef, cvRef, ...fields } = data;
		const row: DocRow = {
			...fields,
			uid,
			history: [{ status: data.status, timestamp: now }],
			createdAt: now,
			updatedAt: now,
			...(await this.blobFields({ pdfRef, cvRef }))
		};
		this.doc.transact(() => this.apps.set(uid, newRowMap(row, now)), ORIGIN.local);
		const id = (await this.materialize([uid])).get(uid);
		await this.flush();
		if (id === undefined) throw new Error('The new application did not validate.');
		return id;
	}

	/** Same rules as the Dexie path in data/applications.ts, applied to the document. */
	async update(id: number, changes: ApplicationChanges, now: number): Promise<void> {
		const row = await this.db.applications.get(id);
		if (!row) throw new MissingApplicationError(id);
		let uid = row.uid;
		if (!uid || !this.apps.has(uid)) {
			uid = [...(await this.adopt([row])).keys()][0];
		}
		const map = this.apps.get(uid)!;
		const current = readRow(uid, map);
		// eslint-disable-next-line @typescript-eslint/no-unused-vars -- pdfRef/cvRef travel as blob ids
		const { status, pdfRef, cvRef, ...fields } = changes;
		const blobs = await this.blobFields(changes);

		this.doc.transact(() => {
			applyChanges(map, { ...fields, ...blobs, updatedAt: now });
			if (status !== undefined && status !== current.status) {
				moveTo(map, status, now);
				if (!('rejectedAt' in changes) && map.has('rejectedAt')) map.delete('rejectedAt');
			}
		}, ORIGIN.local);
		await this.materialize([uid]);
		await this.flush();
	}

	async remove(id: number): Promise<Application | undefined> {
		const row = await this.db.applications.get(id);
		if (!row) return undefined;
		const uid = row.uid;
		if (uid && this.apps.has(uid)) {
			this.doc.transact(() => {
				this.apps.delete(uid);
				this.deleted.set(uid, Date.now());
			}, ORIGIN.local);
			await this.materialize([uid]);
			await this.flush();
		} else {
			await this.db.applications.delete(id);
		}
		return row;
	}

	/** A backup import: new rows with fresh uids; "replace" tombstones everything first. */
	async importRows(rows: Application[], mode: 'merge' | 'replace', now: number): Promise<void> {
		const entries: Array<{ row: Application; doc: DocRow }> = [];
		for (const row of rows)
			entries.push({ row, doc: await this.toDocRow(row, crypto.randomUUID()) });
		this.doc.transact(() => {
			if (mode === 'replace') {
				for (const uid of [...this.apps.keys()]) {
					this.apps.delete(uid);
					this.deleted.set(uid, now);
				}
			}
			for (const { row, doc } of entries) this.apps.set(doc.uid, newRowMap(doc, statusTime(row)));
		}, ORIGIN.local);
		await this.materialize();
		await this.flush();
	}

	/**
	 * Connects the profile store. An empty document takes the store's profile
	 * (first start); otherwise the document wins, as it does for rows.
	 */
	async attachProfile(port: ProfilePort): Promise<void> {
		this.profilePort = port;
		if (this.profile.size === 0) await this.setProfile(port.get());
		else await this.pushProfile();
	}

	async setProfile(profile: Profile): Promise<void> {
		const { cvRef, ...rest } = profile;
		const cvBlob = cvRef ? await this.blobIdFor(cvRef) : undefined;
		this.doc.transact(() => writeProfile(this.profile, { ...rest, cvBlob }), ORIGIN.local);
		await this.flush();
	}

	private async pushProfile(): Promise<void> {
		if (!this.profilePort || this.profile.size === 0) return;
		const { cvBlob, ...rest } = readProfile(this.profile);
		const cvRef = cvBlob ? await this.refFor(cvBlob) : undefined;
		this.profilePort.set({ ...rest, cvRef });
	}

	/** Every blob the document refers to, rows and profile alike. */
	referencedBlobIds(): Set<string> {
		const ids = new Set<string>();
		for (const map of this.apps.values()) {
			for (const key of ['pdfBlob', 'cvBlob']) {
				const value = map.get(key);
				if (typeof value === 'string') ids.add(value);
			}
		}
		const cv = this.profile.get('cvBlob');
		if (typeof cv === 'string') ids.add(cv);
		return ids;
	}

	async exportSnapshot(): Promise<Snapshot> {
		await this.flush();
		const blobs: Record<string, Uint8Array> = {};
		for (const blobId of this.referencedBlobIds()) {
			const bytes = await this.blobBytes(blobId);
			if (bytes) blobs[blobId] = bytes;
		}
		return { update: Y.encodeStateAsUpdate(this.doc), blobs };
	}

	/** The PDF behind a blob id, if this device has it. */
	async blobBytes(blobId: string): Promise<Uint8Array | null> {
		const ref = await this.refFor(blobId);
		const file = ref ? await readPdfFromOpfs(ref) : null;
		return file ? new Uint8Array(await file.arrayBuffer()) : null;
	}

	async hasBlob(blobId: string): Promise<boolean> {
		const ref = await this.refFor(blobId);
		return Boolean(ref && (await readPdfFromOpfs(ref)));
	}

	/** What this device has, as a Yjs state vector. */
	stateVector(): Uint8Array {
		return Y.encodeStateVector(this.doc);
	}

	/**
	 * Everything this device has that a peer at `stateVector` lacks - plus,
	 * always, the whole delete set: Yjs cannot tell which deletions a peer has
	 * seen, which is also why an "empty" diff is no sign that nothing changed.
	 */
	diffSince(stateVector?: Uint8Array): Uint8Array {
		return Y.encodeStateAsUpdate(this.doc, stateVector);
	}

	/** True when a peer at `stateVector` already has every item this device has. */
	covers(stateVector: Uint8Array | undefined): boolean {
		const peer = stateVector ? Y.decodeStateVector(stateVector) : new Map<number, number>();
		for (const [client, clock] of Y.decodeStateVector(this.stateVector())) {
			if ((peer.get(client) ?? 0) < clock) return false;
		}
		return true;
	}

	/** `stateVector` raised by what the given updates contain, per client. */
	advance(stateVector: Uint8Array | undefined, updates: Uint8Array[]): Uint8Array {
		const merged = stateVector ? Y.decodeStateVector(stateVector) : new Map<number, number>();
		for (const update of updates) {
			for (const [client, clock] of Y.decodeStateVector(Y.encodeStateVectorFromUpdate(update))) {
				merged.set(client, Math.max(merged.get(client) ?? 0, clock));
			}
		}
		return Y.encodeStateVector(merged);
	}

	/**
	 * Called after each change made on this device, with its update: the
	 * cue for the transports to push, and what a live link sends as is.
	 */
	onLocalChange(listener: (update: Uint8Array) => void): () => void {
		const handler = (update: Uint8Array, origin: unknown) => {
			if (origin === ORIGIN.local) listener(update);
		};
		this.doc.on('update', handler);
		return () => this.doc.off('update', handler);
	}

	/** Writes PDFs this device does not have yet, under fresh local names. */
	private async storeBlobs(blobs: Record<string, Uint8Array>): Promise<void> {
		for (const [blobId, bytes] of Object.entries(blobs)) {
			const ref = await this.refFor(blobId);
			if (ref && (await readPdfFromOpfs(ref))) continue;
			const fresh = await writePdfToOpfs(
				new Blob([new Uint8Array(bytes)], { type: 'application/pdf' })
			);
			await this.db.blobs.put({ blobId, ref: fresh });
		}
	}

	private static decode(update: Uint8Array): Y.Doc {
		const doc = new Y.Doc();
		try {
			Y.applyUpdate(doc, update);
		} catch (err) {
			doc.destroy();
			throw new SnapshotError('The snapshot is not a valid Yjs update.', { cause: err });
		}
		return doc;
	}

	/** Merges another device's state into this one. Nothing is overwritten. */
	async merge(snapshot: Snapshot): Promise<void> {
		await this.applyRemote([snapshot]);
	}

	/** Several devices' updates and PDFs at once, materialized once at the end. */
	async applyRemote(snapshots: Snapshot[]): Promise<void> {
		// Every update is validated on a scratch document first: a broken one
		// must not leave this document half-applied.
		for (const snapshot of snapshots) SyncRuntime.decode(snapshot.update).destroy();
		for (const snapshot of snapshots) await this.storeBlobs(snapshot.blobs);
		this.doc.transact(() => {
			for (const snapshot of snapshots) Y.applyUpdate(this.doc, snapshot.update, ORIGIN.remote);
		}, ORIGIN.remote);
		await this.materialize();
		await this.flush();
	}

	/**
	 * Replaces this device's state with the snapshot's - a restore, not a
	 * merge. Returns the runtime to use from now on; this one is closed.
	 */
	async replaceWith(snapshot: Snapshot): Promise<SyncRuntime> {
		const scratch = SyncRuntime.decode(snapshot.update);
		const state = Y.encodeStateAsUpdate(scratch);
		scratch.destroy();
		await this.storeBlobs(snapshot.blobs);
		await this.close();
		await this.db.transaction('rw', this.db.crdt, this.db.applications, async () => {
			await this.db.crdt.clear();
			await this.db.crdt.add({ update: state });
			await this.db.applications.clear();
		});
		const fresh = await SyncRuntime.open(this.db);
		if (this.profilePort) await fresh.attachProfile(this.profilePort);
		return fresh;
	}
}
