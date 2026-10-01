import type { Application } from '$lib/db/index.js';
import { getAppliedAt, getRejectedAt, wasSent } from '$lib/utils/reminders.js';

/** Only the three columns a Vermittlungsnachweis actually asks for. */
export type ExportRow = Pick<
	Application,
	'company' | 'status' | 'history' | 'appliedAt' | 'createdAt' | 'sentAt' | 'rejectedAt'
>;

export interface ExportLabels {
	/** Column headings, in order: date, company, status. */
	header: [string, string, string];
	status: Record<Application['status'], string>;
}

/** One rendered line: date, company, status - already localized. */
export type ExportCells = [string, string, string];

/**
 * Turns application rows into the exact cells both output formats print, so
 * the CSV and the PDF can never disagree about which rows, which date, which
 * order or which status wording a proof of applications shows.
 */
export function toExportRows(
	apps: ExportRow[],
	labels: ExportLabels,
	locale: string
): ExportCells[] {
	const formatDate = new Intl.DateTimeFormat(locale, {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric'
	});

	return (
		apps
			// A Nachweis lists applications made. Drafts, and drafts archived
			// straight into "Absage", were never sent and do not belong on it.
			.filter(wasSent)
			.map((app) => ({ app, appliedAt: getAppliedAt(app) }))
			// Oldest first: a Nachweis is read as a chronological log, not as a board.
			.sort((a, b) => a.appliedAt - b.appliedAt)
			.map(({ app, appliedAt }) => {
				const status = labels.status[app.status] ?? app.status;
				// The outcome column is where a Nachweis wants the rejection's date.
				const rejectedAt = getRejectedAt(app);
				return [
					formatDate.format(appliedAt),
					app.company,
					rejectedAt === undefined ? status : `${status} (${formatDate.format(rejectedAt)})`
				];
			})
	);
}

/**
 * The UTF-8 byte order mark, without which Excel reads the file as the local
 * ANSI codepage and every umlaut arrives as mojibake. Built from its code
 * point rather than written as an escape: Prettier rewrites the escape in a
 * template literal into the raw character, which ESLint's
 * no-irregular-whitespace then rejects - the two tools fight over it forever.
 */
const BOM = String.fromCharCode(0xfeff);

/**
 * Characters that make Excel/LibreOffice treat a cell as a formula rather
 * than text. A company literally named "=HYPERLINK(...)" is far-fetched, but
 * this file is opened by somebody else on a machine we know nothing about,
 * and the row content came from a parsed job ad - so it is untrusted input
 * crossing into an interpreter either way.
 */
const FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r'];

function escapeCell(value: string): string {
	// Prefixed only when actually dangerous, so the apostrophe Excel would
	// display never shows up on the overwhelming majority of rows.
	const safe = FORMULA_TRIGGERS.some((c) => value.startsWith(c)) ? `'${value}` : value;
	return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * Builds the proof-of-applications list the Agentur für Arbeit asks for:
 * when it was sent, to whom, and where it stands now - nothing else.
 *
 * Semicolon-separated with a UTF-8 BOM and CRLF line endings, which is what
 * a German Excel opens correctly on a double-click; a comma-separated file
 * lands entirely in column A there, and without the BOM every umlaut is
 * mojibake.
 */
export function buildApplicationCsv(
	apps: ExportRow[],
	labels: ExportLabels,
	locale: string
): string {
	const rows = toExportRows(apps, labels, locale).map((cells) => cells.map(escapeCell).join(';'));
	return `${BOM}${[labels.header.map(escapeCell).join(';'), ...rows].join('\r\n')}\r\n`;
}

/** e.g. bewerbungen-2026-09-23.pdf */
export function exportFileName(extension: 'csv' | 'pdf' = 'csv', now = new Date()): string {
	return `bewerbungen-${now.toISOString().slice(0, 10)}.${extension}`;
}
