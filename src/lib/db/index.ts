import Dexie, { type Table } from 'dexie';
import { writePdfToOpfs } from '$lib/utils/opfs.js';

export interface StatusHistory {
	status: 'draft' | 'sent' | 'interview' | 'accepted' | 'rejected';
	timestamp: number;
}

export interface Application {
	id?: number;
	title: string;
	company: string;
	url: string;
	salary: string;
	contactName: string;
	contactEmail: string;
	contactPhone: string;
	notes: string;
	priority: 'low' | 'medium' | 'high';
	status: 'draft' | 'sent' | 'interview' | 'accepted' | 'rejected';
	tags: string[];
	cardColor?: string;
	reminderInterval: '24h' | '48h' | '7d' | '14d' | 'custom' | 'none';
	/**
	 * Absolute timestamp the follow-up is due at. Set whenever the user picks
	 * an interval or a date themselves, so changing the setting restarts the
	 * countdown from that moment instead of from the application date. Unset on
	 * rows written before this existed - those still fall back to the
	 * interval-from-`sent` math in $lib/utils/reminders.ts.
	 */
	reminderAt?: number;
	lastReminderSent?: number;
	appliedAt?: number;
	createdAt: number;
	updatedAt: number;
	history: StatusHistory[];
	pdfName?: string;
	/** OPFS file name holding the attached PDF (see $lib/utils/opfs.ts). */
	pdfRef?: string;
	/** Work location as advertised. Optional and unindexed, so no schema bump. */
	location?: string;
	/** The employer's own reference for the posting ("Referenz-Nr.", "Kennziffer"). */
	referenceNumber?: string;
	/** The cover letter for this application, as Markdown. */
	coverLetter?: string;
	/**
	 * OPFS file name of a CV specific to this application. When unset the
	 * global one from the profile store is used instead.
	 */
	cvRef?: string;
	cvName?: string;
}

/** Pre-v2 shape, kept only so the migration below can read old rows. */
interface ApplicationV1 extends Omit<Application, 'pdfRef'> {
	pdfBlob?: Blob;
}

const APPLICATIONS_SCHEMA = '++id, title, company, priority, status, *tags, createdAt, updatedAt';

/** Exported (not just the singleton below) so tests can construct isolated instances. */
export class BewerbyDatabase extends Dexie {
	applications!: Table<Application>;

	/** name defaults to the real database; tests pass a unique one for isolation. */
	constructor(name = 'bewerby-db') {
		super(name);

		this.version(1).stores({ applications: APPLICATIONS_SCHEMA });

		// v2: move attached PDFs out of IndexedDB and into OPFS (pdfBlob -> pdfRef).
		// Keeping the Blob in the row meant every board/analytics/reminder read of
		// db.applications.toArray() deserialized every attached PDF, and a Blob
		// can't survive JSON export (see #6). The index list is unchanged - only
		// the shape of non-indexed fields differs, so `.stores()` is identical to
		// v1 and all the work happens in `.upgrade()`.
		this.version(2)
			.stores({ applications: APPLICATIONS_SCHEMA })
			.upgrade(async (tx) => {
				const table = tx.table('applications') as Table<ApplicationV1>;
				const rows = await table.toArray();

				const newRefById = new Map<number, string>();
				for (const row of rows) {
					if (row.pdfBlob instanceof Blob && row.id !== undefined) {
						try {
							const ref = await Dexie.waitFor(writePdfToOpfs(row.pdfBlob));
							newRefById.set(row.id, ref);
						} catch (err) {
							// Leave pdfBlob in place on this row rather than lose the file;
							// the 'ready' handler below retries it on every open.
							console.error(
								`OPFS migration failed for application ${row.id}, keeping pdfBlob for now:`,
								err
							);
						}
					}
				}

				await table.toCollection().modify((row) => {
					const ref = row.id !== undefined ? newRefById.get(row.id) : undefined;
					if (ref) {
						(row as unknown as Application).pdfRef = ref;
						delete row.pdfBlob;
					}
				});
			});

		// Dexie runs an upgrade exactly once, so a row whose OPFS write failed
		// in it (OPFS unavailable, quota) would keep its PDF in a field nothing
		// else reads: invisible in the UI and dropped from every backup. Every
		// open therefore retries what is left. Dexie holds other queries until
		// this resolves, so the boot-time orphan sweep sees the new pdfRef.
		this.on('ready', async () => {
			// A row mid-migration can carry both fields.
			const table = this.table('applications') as Table<
				ApplicationV1 & Pick<Application, 'pdfRef'>
			>;
			const pending = await table.filter((row) => row.pdfBlob instanceof Blob).toArray();
			for (const row of pending) {
				if (row.id === undefined || !(row.pdfBlob instanceof Blob)) continue;
				try {
					const pdfRef = await writePdfToOpfs(row.pdfBlob);
					await table.update(row.id, { pdfRef, pdfBlob: undefined });
				} catch (err) {
					console.error(`OPFS migration retry failed for application ${row.id}:`, err);
				}
			}
		});
	}
}

export const db = new BewerbyDatabase();

const VALID_STATUSES = ['draft', 'sent', 'interview', 'accepted', 'rejected'] as const;
const VALID_PRIORITIES = ['low', 'medium', 'high'] as const;
const VALID_REMINDER_INTERVALS = ['24h', '48h', '7d', '14d', 'custom', 'none'] as const;

function isValidStatus(value: unknown): value is Application['status'] {
	return typeof value === 'string' && (VALID_STATUSES as readonly string[]).includes(value);
}

function isValidStatusHistoryEntry(value: unknown): value is StatusHistory {
	if (!value || typeof value !== 'object') return false;
	const entry = value as Record<string, unknown>;
	return isValidStatus(entry.status) && typeof entry.timestamp === 'number';
}

/**
 * Full structural validation of an imported backup row - every field, not
 * just title/company - so a malformed import fails cleanly up front instead
 * of writing a row that later crashes the board's or analytics' $derived
 * computations (e.g. a missing `tags` or `history`).
 */
export function isValidApplication(value: unknown): value is Application {
	if (!value || typeof value !== 'object') return false;
	const app = value as Record<string, unknown>;
	return (
		typeof app.title === 'string' &&
		typeof app.company === 'string' &&
		typeof app.url === 'string' &&
		typeof app.salary === 'string' &&
		typeof app.contactName === 'string' &&
		typeof app.contactEmail === 'string' &&
		typeof app.contactPhone === 'string' &&
		typeof app.notes === 'string' &&
		typeof app.priority === 'string' &&
		(VALID_PRIORITIES as readonly string[]).includes(app.priority) &&
		isValidStatus(app.status) &&
		Array.isArray(app.tags) &&
		app.tags.every((tag) => typeof tag === 'string') &&
		(app.cardColor === undefined || typeof app.cardColor === 'string') &&
		typeof app.reminderInterval === 'string' &&
		(VALID_REMINDER_INTERVALS as readonly string[]).includes(app.reminderInterval) &&
		(app.reminderAt === undefined || typeof app.reminderAt === 'number') &&
		(app.lastReminderSent === undefined || typeof app.lastReminderSent === 'number') &&
		(app.appliedAt === undefined || typeof app.appliedAt === 'number') &&
		typeof app.createdAt === 'number' &&
		typeof app.updatedAt === 'number' &&
		Array.isArray(app.history) &&
		app.history.every(isValidStatusHistoryEntry) &&
		(app.pdfName === undefined || typeof app.pdfName === 'string') &&
		(app.pdfRef === undefined || typeof app.pdfRef === 'string') &&
		// Added after the format-2 backups shipped, so they must stay optional -
		// requiring them here would make every existing export fail to import.
		(app.location === undefined || typeof app.location === 'string') &&
		(app.referenceNumber === undefined || typeof app.referenceNumber === 'string') &&
		(app.coverLetter === undefined || typeof app.coverLetter === 'string') &&
		(app.cvRef === undefined || typeof app.cvRef === 'string') &&
		(app.cvName === undefined || typeof app.cvName === 'string')
	);
}
