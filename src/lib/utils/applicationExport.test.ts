import { describe, it, expect } from 'vitest';
import { buildApplicationCsv, exportFileName, type ExportRow } from './applicationExport.js';
import { truncateToWidth } from './applicationListPdf.js';

const labels = {
	header: ['Bewerbungsdatum', 'Firma', 'Status'] as [string, string, string],
	status: {
		draft: 'In Arbeit',
		sent: 'Versendet',
		interview: 'Vorstellung',
		accepted: 'Zusage',
		rejected: 'Absage'
	}
};

const AT = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();

function row(overrides: Partial<ExportRow> = {}): ExportRow {
	return {
		company: 'Acme GmbH',
		status: 'sent',
		history: [{ status: 'sent', timestamp: AT(2026, 3, 5) }],
		createdAt: AT(2026, 1, 1),
		...overrides
	};
}

/** Body lines without the BOM header row, split on the CRLF terminator. */
function bodyLines(csv: string): string[] {
	return csv
		.replace(/^\uFEFF/, '')
		.trimEnd()
		.split('\r\n')
		.slice(1);
}

describe('buildApplicationCsv', () => {
	it('writes date, company and translated status for each row', () => {
		const csv = buildApplicationCsv([row()], labels, 'de-DE');
		expect(bodyLines(csv)).toEqual(['05.03.2026;Acme GmbH;Versendet']);
	});

	it('leads with a BOM and a header row so a German Excel opens it correctly', () => {
		const csv = buildApplicationCsv([row()], labels, 'de-DE');
		expect(csv.startsWith('\uFEFFBewerbungsdatum;Firma;Status\r\n')).toBe(true);
	});

	it('dates a row by its "sent" history entry, not by createdAt', () => {
		const csv = buildApplicationCsv(
			[
				row({ appliedAt: AT(2026, 2, 2), history: [{ status: 'sent', timestamp: AT(2026, 3, 5) }] })
			],
			labels,
			'de-DE'
		);
		expect(bodyLines(csv)[0]).toContain('05.03.2026');
	});

	it('dates a row by the application date entered, over the move into "sent"', () => {
		const csv = buildApplicationCsv([row({ sentAt: AT(2026, 3, 1) })], labels, 'de-DE');
		expect(bodyLines(csv)[0]).toBe('01.03.2026;Acme GmbH;Versendet');
	});

	it('lists a draft archived into "Absage" once an application date was entered for it', () => {
		const history: ExportRow['history'] = [
			{ status: 'draft', timestamp: AT(2026, 3, 1) },
			{ status: 'rejected', timestamp: AT(2026, 3, 20) }
		];
		const csv = buildApplicationCsv(
			[
				row({ status: 'rejected', history }),
				row({ status: 'rejected', history, sentAt: AT(2026, 3, 2) })
			],
			labels,
			'de-DE'
		);
		expect(bodyLines(csv)).toEqual(['02.03.2026;Acme GmbH;Absage (20.03.2026)']);
	});

	it('falls back to appliedAt, then createdAt, for a row with no "sent" entry', () => {
		// A rejection logged after the fact: sent in reality, never "sent" on the board.
		const noHistory = buildApplicationCsv(
			[row({ status: 'rejected', history: [], appliedAt: AT(2026, 2, 2) })],
			labels,
			'de-DE'
		);
		expect(bodyLines(noHistory)[0]).toBe('02.02.2026;Acme GmbH;Absage');

		const bare = buildApplicationCsv([row({ status: 'rejected', history: [] })], labels, 'de-DE');
		expect(bodyLines(bare)[0]).toBe('01.01.2026;Acme GmbH;Absage');
	});

	it('dates a rejection by the move into "Absage", unless one was entered', () => {
		const history: ExportRow['history'] = [
			{ status: 'sent', timestamp: AT(2026, 3, 5) },
			{ status: 'rejected', timestamp: AT(2026, 3, 20) }
		];
		const moved = buildApplicationCsv([row({ status: 'rejected', history })], labels, 'de-DE');
		expect(bodyLines(moved)[0]).toBe('05.03.2026;Acme GmbH;Absage (20.03.2026)');

		const entered = buildApplicationCsv(
			[row({ status: 'rejected', history, rejectedAt: AT(2026, 3, 12) })],
			labels,
			'de-DE'
		);
		expect(bodyLines(entered)[0]).toBe('05.03.2026;Acme GmbH;Absage (12.03.2026)');
	});

	it('lists only applications that were actually sent, never drafts', () => {
		const csv = buildApplicationCsv(
			[
				row({ company: 'Draft AG', status: 'draft', history: [{ status: 'draft', timestamp: 1 }] }),
				row({
					company: 'Withdrawn AG',
					status: 'rejected',
					history: [
						{ status: 'draft', timestamp: 1 },
						{ status: 'rejected', timestamp: 2 }
					]
				}),
				row({
					company: 'Turned Down AG',
					status: 'rejected',
					history: [
						{ status: 'sent', timestamp: AT(2026, 3, 5) },
						{ status: 'rejected', timestamp: AT(2026, 3, 9) }
					]
				}),
				row({ company: 'Sent AG' })
			],
			labels,
			'de-DE'
		);
		expect(bodyLines(csv).map((line) => line.split(';')[1])).toEqual(['Turned Down AG', 'Sent AG']);
	});

	it('sorts oldest first, whatever order the board hands them over in', () => {
		const csv = buildApplicationCsv(
			[
				row({ company: 'Later', history: [{ status: 'sent', timestamp: AT(2026, 5, 1) }] }),
				row({ company: 'Earlier', history: [{ status: 'sent', timestamp: AT(2026, 1, 9) }] })
			],
			labels,
			'de-DE'
		);
		expect(bodyLines(csv)).toEqual(['09.01.2026;Earlier;Versendet', '01.05.2026;Later;Versendet']);
	});

	it('quotes a company containing the separator or a quote instead of splitting the row', () => {
		const csv = buildApplicationCsv(
			[row({ company: 'Meier; Sohn "MS"' }), row({ company: 'Zeilen\numbruch GmbH' })],
			labels,
			'de-DE'
		);
		expect(bodyLines(csv)[0]).toBe('05.03.2026;"Meier; Sohn ""MS""";Versendet');
		expect(csv).toContain('"Zeilen\numbruch GmbH"');
	});

	it('defuses a company name Excel would otherwise run as a formula', () => {
		for (const company of ['=HYPERLINK("http://x")', '+1', '-1', '@SUM(A1)']) {
			const csv = buildApplicationCsv([row({ company })], labels, 'de-DE');
			expect(bodyLines(csv)[0]).toContain(`'${company.charAt(0)}`);
		}
	});

	it('produces a header-only file for an empty board rather than throwing', () => {
		expect(bodyLines(buildApplicationCsv([], labels, 'de-DE'))).toEqual([]);
	});
});

describe('exportFileName', () => {
	it('dates the file so repeated exports do not overwrite each other silently', () => {
		const at = new Date('2026-09-23T10:00:00Z');
		expect(exportFileName('csv', at)).toBe('bewerbungen-2026-09-23.csv');
		expect(exportFileName('pdf', at)).toBe('bewerbungen-2026-09-23.pdf');
	});
});

describe('truncateToWidth', () => {
	// One unit per character, so the arithmetic is readable without a font.
	const measure = (value: string) => value.length;

	it('leaves a cell that already fits untouched', () => {
		expect(truncateToWidth('Acme GmbH', measure, 20)).toBe('Acme GmbH');
	});

	it('marks an over-long cell as cut instead of silently shortening it', () => {
		expect(truncateToWidth('Sehr lange Firmierung GmbH & Co. KG', measure, 10)).toBe('Sehr lang…');
	});

	it('returns nothing rather than a bare ellipsis when no character fits', () => {
		expect(truncateToWidth('Acme', measure, 1)).toBe('');
	});
});
