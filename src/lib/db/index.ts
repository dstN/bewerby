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
	reminderInterval: '24h' | '48h' | '7d' | '14d' | 'none';
	lastReminderSent?: number;
	appliedAt?: number;
	createdAt: number;
	updatedAt: number;
	history: StatusHistory[];
	pdfName?: string;
	/** OPFS file name holding the attached PDF (see $lib/utils/opfs.ts). */
	pdfRef?: string;
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
							// Leave pdfBlob in place on this row rather than lose the file -
							// it will simply be retried the next time the DB is opened.
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
	}
}

export const db = new BewerbyDatabase();

const VALID_STATUSES = ['draft', 'sent', 'interview', 'accepted', 'rejected'] as const;
const VALID_PRIORITIES = ['low', 'medium', 'high'] as const;
const VALID_REMINDER_INTERVALS = ['24h', '48h', '7d', '14d', 'none'] as const;

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
		(app.lastReminderSent === undefined || typeof app.lastReminderSent === 'number') &&
		(app.appliedAt === undefined || typeof app.appliedAt === 'number') &&
		typeof app.createdAt === 'number' &&
		typeof app.updatedAt === 'number' &&
		Array.isArray(app.history) &&
		app.history.every(isValidStatusHistoryEntry) &&
		(app.pdfName === undefined || typeof app.pdfName === 'string') &&
		(app.pdfRef === undefined || typeof app.pdfRef === 'string')
	);
}
