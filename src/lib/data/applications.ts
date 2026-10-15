import { STATUS_FIELDS, db, type Application } from '#lib/db/index.js';
import { activeSync } from '#lib/crdt/session.js';
import { MissingApplicationError } from './errors.js';

export { MissingApplicationError };

/**
 * The only place that writes application rows (#51). Board, edit dialog,
 * dispatch dialog and backup import all go through here, which is what lets
 * the sync layer see every change, and what keeps the rules below in one
 * place instead of in each caller. ESLint enforces it (eslint.config.js).
 *
 * On a device with a vault every function hands over to the sync layer
 * (#52), which applies the same rules to the Yjs document and materializes
 * the result into this table. Without one, the table is written directly.
 */

/**
 * No history: a new row gets one entry for its status, dated now. An entered
 * application date goes into sentAt, never into the log - a log entry dated
 * at noon today sat in the future all morning, and every move made before
 * then counted as older than it, so the card jumped back (#59).
 */
export type NewApplication = Omit<
	Application,
	'id' | 'uid' | 'createdAt' | 'updatedAt' | 'history'
>;

export type ApplicationChanges = Partial<
	Omit<Application, 'id' | 'uid' | 'createdAt' | 'updatedAt' | 'history'>
>;

export async function createApplication(data: NewApplication, now = Date.now()): Promise<number> {
	const sync = await activeSync();
	if (sync) return sync.create(data, now);
	return db.applications.add({
		...data,
		uid: crypto.randomUUID(),
		history: [{ status: data.status, timestamp: now }],
		createdAt: now,
		updatedAt: now
	});
}

/**
 * Field edits. A changed status is appended to the history here, so no
 * caller can forget to log it - the edit dialog did, until 2026-08-18 - and
 * an entered rejection date, archive reason or end date is dropped with it
 * unless the caller sets one (STATUS_FIELDS).
 *
 * Read and write happen in one transaction against the stored row, not
 * against whatever copy the caller had on screen.
 */
export async function updateApplication(
	id: number,
	changes: ApplicationChanges,
	now = Date.now()
): Promise<void> {
	const sync = await activeSync();
	if (sync) return sync.update(id, changes, now);
	await db.transaction('rw', db.applications, async () => {
		const current = await db.applications.get(id);
		if (!current) throw new MissingApplicationError(id);

		const patch: Partial<Application> = { ...changes, updatedAt: now };
		// `?? []`: a row that somehow lost its history is repaired into a
		// valid log instead of keeping undefined.
		const history = current.history ?? [];
		if (changes.status !== undefined && changes.status !== current.status) {
			patch.history = [...history, { status: changes.status, timestamp: now }];
			for (const key of STATUS_FIELDS) if (!(key in changes)) patch[key] = undefined;
		} else if (!current.history) {
			patch.history = history;
		}
		// Dexie drops a field set to undefined, which is how a cleared colour,
		// reminder or rejection date leaves the row.
		await db.applications.update(id, patch);
	});
}

/** Deletes the row and hands it back, so the caller can remove its PDFs. */
export async function removeApplication(id: number): Promise<Application | undefined> {
	const sync = await activeSync();
	if (sync) return sync.remove(id);
	return db.transaction('rw', db.applications, async () => {
		const row = await db.applications.get(id);
		await db.applications.delete(id);
		return row;
	});
}

/**
 * Writes imported rows in one transaction, so a failure partway through
 * (a bulkAdd constraint error, say) rolls back completely instead of
 * leaving the table half-cleared and half-imported.
 */
export async function importApplications(
	rows: Application[],
	mode: 'merge' | 'replace'
): Promise<void> {
	const sync = await activeSync();
	if (sync) return sync.importRows(rows, mode, Date.now());
	await db.transaction('rw', db.applications, async () => {
		if (mode === 'replace') await db.applications.clear();
		// Fresh uids, like the fresh ids prepareImportRows hands out: a backup
		// of this very device would otherwise collide on the unique index.
		await db.applications.bulkAdd(rows.map((row) => ({ ...row, uid: crypto.randomUUID() })));
	});
}
