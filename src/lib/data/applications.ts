import { db, type Application, type StatusHistory } from '$lib/db/index.js';

/**
 * The only place that writes application rows (#51). Board, edit dialog,
 * dispatch dialog and backup import all go through here, which is what lets
 * the sync layer see every change, and what keeps the rules below in one
 * place instead of in each caller. ESLint enforces it (eslint.config.js).
 */

export type NewApplication = Omit<Application, 'id' | 'createdAt' | 'updatedAt' | 'history'> & {
	/** Defaults to one entry for the initial status, dated now. */
	history?: StatusHistory[];
};

export type ApplicationChanges = Partial<
	Omit<Application, 'id' | 'createdAt' | 'updatedAt' | 'history'>
>;

export class MissingApplicationError extends Error {
	constructor(readonly id: number) {
		super(`No application row matched id ${id}.`);
		this.name = 'MissingApplicationError';
	}
}

export async function createApplication(data: NewApplication, now = Date.now()): Promise<number> {
	const { history, ...fields } = data;
	return db.applications.add({
		...fields,
		history: history ?? [{ status: data.status, timestamp: now }],
		createdAt: now,
		updatedAt: now
	});
}

/**
 * Field edits. A changed status is appended to the history here, so no
 * caller can forget to log it - the edit dialog did, until 2026-08-18 - and
 * an entered rejection date is dropped with it unless the caller sets one:
 * it belongs to the rejection it was entered for (see getRejectedAt).
 *
 * Read and write happen in one transaction against the stored row, not
 * against whatever copy the caller had on screen.
 */
export async function updateApplication(
	id: number,
	changes: ApplicationChanges,
	now = Date.now()
): Promise<void> {
	await db.transaction('rw', db.applications, async () => {
		const current = await db.applications.get(id);
		if (!current) throw new MissingApplicationError(id);

		const patch: Partial<Application> = { ...changes, updatedAt: now };
		// `?? []`: a row that somehow lost its history is repaired into a
		// valid log instead of keeping undefined.
		const history = current.history ?? [];
		if (changes.status !== undefined && changes.status !== current.status) {
			patch.history = [...history, { status: changes.status, timestamp: now }];
			if (!('rejectedAt' in changes)) patch.rejectedAt = undefined;
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
	await db.transaction('rw', db.applications, async () => {
		if (mode === 'replace') await db.applications.clear();
		await db.applications.bulkAdd(rows);
	});
}
