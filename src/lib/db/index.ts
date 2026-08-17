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
	reminderInterval: '10s' | '24h' | '48h' | '7d' | '14d' | 'none';
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

class BewerbyDatabase extends Dexie {
	applications!: Table<Application>;

	constructor() {
		super('bewerby-db');

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
