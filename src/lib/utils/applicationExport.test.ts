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

	it('falls back to appliedAt, then createdAt, for a row that was never sent', () => {
		const noHistory = buildApplicationCsv(
			[row({ status: 'draft', history: [], appliedAt: AT(2026, 2, 2) })],
			labels,
			'de-DE'
		);
		expect(bodyLines(noHistory)[0]).toBe('02.02.2026;Acme GmbH;In Arbeit');

		const bare = buildApplicationCsv([row({ status: 'draft', history: [] })], labels, 'de-DE');
		expect(bodyLines(bare)[0]).toBe('01.01.2026;Acme GmbH;In Arbeit');
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
