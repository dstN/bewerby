import Dexie, { type Table } from 'dexie';

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
	pdfBlob?: Blob;
}

class BewerbyDatabase extends Dexie {
	applications!: Table<Application>;

	constructor() {
		super('bewerby-db');
		// schema version 1 setup
		// multi-entry index on tags (*tags) allows fast querying by tag
		this.version(1).stores({
			applications: '++id, title, company, priority, status, *tags, createdAt, updatedAt'
		});
	}
}

export const db = new BewerbyDatabase();
