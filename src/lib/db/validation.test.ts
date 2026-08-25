import { describe, it, expect } from 'vitest';
import { isValidApplication, type Application } from './index.js';

/**
 * isValidApplication() is the only thing standing between an untrusted
 * backup file and the live database. A field it waves through writes a row
 * that the board and analytics later crash on (a missing `tags` array, a
 * `history` entry with no timestamp), long after the import reported
 * success - so every field it claims to check is asserted here explicitly.
 */

function validApplication(overrides: Partial<Application> = {}): Application {
	return {
		title: 'Frontend Developer',
		company: 'Acme GmbH',
		url: 'https://acme.example/jobs/42',
		salary: '65.000 EUR',
		contactName: 'Erika Mustermann',
		contactEmail: 'jobs@acme.example',
		contactPhone: '+49 30 1234567',
		notes: 'Empfehlung über einen Kollegen.',
		priority: 'medium',
		status: 'sent',
		tags: ['remote', 'svelte'],
		reminderInterval: '7d',
		createdAt: 1_700_000_000_000,
		updatedAt: 1_700_000_100_000,
		history: [{ status: 'draft', timestamp: 1_700_000_000_000 }],
		...overrides
	};
}

/** Produces the row with one field replaced by an invalid value. */
function withField(field: string, value: unknown): unknown {
	return { ...validApplication(), [field]: value };
}

describe('isValidApplication - accepting good data', () => {
	it('accepts a complete, well-formed row', () => {
		expect(isValidApplication(validApplication())).toBe(true);
	});

	it('accepts a minimal row with empty strings and empty arrays', () => {
		expect(
			isValidApplication(
				validApplication({
					url: '',
					salary: '',
					contactName: '',
					contactEmail: '',
					contactPhone: '',
					notes: '',
					tags: [],
					history: []
				})
			)
		).toBe(true);
	});

	it('accepts every valid status', () => {
		for (const status of ['draft', 'sent', 'interview', 'accepted', 'rejected'] as const) {
			expect(isValidApplication(validApplication({ status }))).toBe(true);
		}
	});

	it('accepts every valid priority', () => {
		for (const priority of ['low', 'medium', 'high'] as const) {
			expect(isValidApplication(validApplication({ priority }))).toBe(true);
		}
	});

	it('accepts every valid reminder interval', () => {
		for (const reminderInterval of ['24h', '48h', '7d', '14d', 'none'] as const) {
			expect(isValidApplication(validApplication({ reminderInterval }))).toBe(true);
		}
	});

	it('accepts the optional fields when present with the right type', () => {
		expect(
			isValidApplication(
				validApplication({
					id: 7,
					cardColor: '#6366f1',
					lastReminderSent: 1_700_000_200_000,
					appliedAt: 1_699_000_000_000,
					pdfName: 'anschreiben.pdf',
					pdfRef: 'b1946ac9-2492-4a5f-9b4a-5a8f0dd8c5cb.pdf'
				})
			)
		).toBe(true);
	});

	it('accepts the optional fields when explicitly undefined', () => {
		expect(
			isValidApplication(
				validApplication({
					cardColor: undefined,
					lastReminderSent: undefined,
					appliedAt: undefined,
					pdfName: undefined,
					pdfRef: undefined
				})
			)
		).toBe(true);
	});
});

describe('isValidApplication - rejecting bad data', () => {
	it.each([null, undefined, 42, 'a string', true, []])('rejects the non-object %s', (value) => {
		expect(isValidApplication(value)).toBe(false);
	});

	const REQUIRED_STRING_FIELDS = [
		'title',
		'company',
		'url',
		'salary',
		'contactName',
		'contactEmail',
		'contactPhone',
		'notes'
	];

	it.each(REQUIRED_STRING_FIELDS)('rejects a missing %s', (field) => {
		const row = validApplication() as unknown as Record<string, unknown>;
		delete row[field];
		expect(isValidApplication(row)).toBe(false);
	});

	it.each(REQUIRED_STRING_FIELDS)('rejects a non-string %s', (field) => {
		expect(isValidApplication(withField(field, 123))).toBe(false);
	});

	it.each(['createdAt', 'updatedAt'])('rejects a non-numeric %s', (field) => {
		expect(isValidApplication(withField(field, '1700000000000'))).toBe(false);
	});

	it.each(['createdAt', 'updatedAt'])('rejects a missing %s', (field) => {
		const row = validApplication() as unknown as Record<string, unknown>;
		delete row[field];
		expect(isValidApplication(row)).toBe(false);
	});

	it('rejects an unknown status', () => {
		expect(isValidApplication(withField('status', 'on-hold'))).toBe(false);
	});

	it('rejects an unknown priority', () => {
		expect(isValidApplication(withField('priority', 'urgent'))).toBe(false);
	});

	it('rejects an unknown reminder interval', () => {
		expect(isValidApplication(withField('reminderInterval', '30d'))).toBe(false);
	});

	it('rejects tags that are not an array', () => {
		expect(isValidApplication(withField('tags', 'remote,svelte'))).toBe(false);
	});

	it('rejects an array of tags containing a non-string', () => {
		expect(isValidApplication(withField('tags', ['remote', 42]))).toBe(false);
	});

	it('rejects history that is not an array', () => {
		expect(isValidApplication(withField('history', {}))).toBe(false);
	});

	it('rejects a history entry with an unknown status', () => {
		expect(isValidApplication(withField('history', [{ status: 'archived', timestamp: 1 }]))).toBe(
			false
		);
	});

	it('rejects a history entry with no timestamp - the reminder anchor', () => {
		expect(isValidApplication(withField('history', [{ status: 'sent' }]))).toBe(false);
	});

	it('rejects a history entry with a string timestamp', () => {
		expect(
			isValidApplication(withField('history', [{ status: 'sent', timestamp: '2024-01-01' }]))
		).toBe(false);
	});

	it('rejects a null history entry', () => {
		expect(isValidApplication(withField('history', [null]))).toBe(false);
	});

	it('rejects one bad entry among otherwise valid history', () => {
		expect(
			isValidApplication(
				withField('history', [
					{ status: 'draft', timestamp: 1 },
					{ status: 'sent', timestamp: 'later' },
					{ status: 'interview', timestamp: 3 }
				])
			)
		).toBe(false);
	});

	it.each(['lastReminderSent', 'appliedAt'])(
		'rejects a present-but-non-numeric optional %s',
		(field) => {
			expect(isValidApplication(withField(field, '2024-01-01'))).toBe(false);
		}
	);

	it.each(['cardColor', 'pdfName', 'pdfRef'])(
		'rejects a present-but-non-string optional %s',
		(field) => {
			expect(isValidApplication(withField(field, 42))).toBe(false);
		}
	);

	it('rejects a null optional field, which is not the same as absent', () => {
		// JSON has no `undefined`, so a hand-edited export nulling a field out
		// must not be treated as "not set".
		expect(isValidApplication(withField('cardColor', null))).toBe(false);
	});
});

describe('isValidApplication - narrowing', () => {
	it('narrows an unknown value to Application for the caller', () => {
		const value: unknown = validApplication();
		if (isValidApplication(value)) {
			// Compiles only because the guard narrowed `value` - the point of the
			// `value is Application` return type that parseBackupPayload relies on.
			expect(value.company).toBe('Acme GmbH');
			expect(value.history[0].status).toBe('draft');
		} else {
			expect.unreachable('a valid row must narrow');
		}
	});

	it('tolerates extra unknown properties from a newer export format', () => {
		expect(isValidApplication({ ...validApplication(), futureField: 'ignored' })).toBe(true);
	});
});
