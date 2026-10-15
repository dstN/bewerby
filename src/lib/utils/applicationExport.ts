import type { Application } from '#lib/db/index.js';
import { getAppliedAt, getArchivedAt, getRejectedAt, wasSent } from '#lib/utils/reminders.js';

/** Only the three columns a Vermittlungsnachweis actually asks for. */
export type ExportRow = Pick<
	Application,
	| 'company'
	| 'status'
	| 'history'
	| 'appliedAt'
	| 'createdAt'
	| 'sentAt'
	| 'rejectedAt'
	| 'archiveReason'
	| 'archivedAt'
>;

export interface ExportLabels {
	/** Column headings, in order: date, company, status. */
	header: [string, string, string];
	status: Record<Application['status'], string>;
	/** An archived card's outcome by its reason; one never sent is not listed. */
	archived: { noResponse: string; withdrawn: string };
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
			// A Nachweis lists applications made. Drafts, and cards archived
			// without ever going out, were never sent and do not belong on it.
			.filter(wasSent)
			.map((app) => ({ app, appliedAt: getAppliedAt(app) }))
			// Oldest first: a Nachweis is read as a chronological log, not as a board.
			.sort((a, b) => a.appliedAt - b.appliedAt)
			.map(({ app, appliedAt }) => {
				return [formatDate.format(appliedAt), app.company, outcome(app, labels, formatDate)];
			})
	);
}

/**
 * The status column: where a Nachweis wants the rejection's date, and what
 * became of an archived application - no answer (there is no date to give)
 * or withdrawn on the day it was ended.
 */
function outcome(app: ExportRow, labels: ExportLabels, formatDate: Intl.DateTimeFormat): string {
	const dated = (label: string, at: number | undefined) =>
		at === undefined ? label : `${label} (${formatDate.format(at)})`;
	if (app.status !== 'archived') {
		return dated(labels.status[app.status] ?? app.status, getRejectedAt(app));
	}
	return app.archiveReason === 'withdrawn'
		? dated(labels.archived.withdrawn, getArchivedAt(app))
		: labels.archived.noResponse;
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

/** A date range as the filter bar holds it: YYYY-MM-DD, either end may be empty. */
export interface Period {
	from: string;
	to: string;
}

/** Midnight at the start of a YYYY-MM-DD day, local time; `days` later for the end. */
function dayStart(day: string, days = 0): number {
	const [year, month, date] = day.split('-').map(Number);
	return new Date(year, month - 1, date + days).getTime();
}

/**
 * Whether an application falls into the period by the date it was sent
 * (as on the Nachweis), both days included, in local time.
 */
export function inPeriod(
	app: Pick<Application, 'history' | 'sentAt' | 'appliedAt' | 'createdAt'>,
	period: Period
): boolean {
	const at = getAppliedAt(app);
	if (period.from && at < dayStart(period.from)) return false;
	if (period.to && at >= dayStart(period.to, 1)) return false;
	return true;
}

/** The choices the export dialog offers; 'custom' takes its own from and to. */
export const PERIOD_CHOICES = ['all', 'last30Days', 'last3Months', 'custom'] as const;
export type PeriodChoice = (typeof PERIOD_CHOICES)[number];

/** YYYY-MM-DD of a local date, as the date pickers hold it. */
function toDay(date: Date): string {
	const pad = (value: number) => String(value).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The period behind a preset, counted back from today; open towards today. */
export function presetPeriod(choice: Exclude<PeriodChoice, 'custom'>, today = new Date()): Period {
	const [year, month, date] = [today.getFullYear(), today.getMonth(), today.getDate()];
	switch (choice) {
		case 'last30Days':
			return { from: toDay(new Date(year, month, date - 30)), to: '' };
		case 'last3Months':
			return { from: toDay(new Date(year, month - 3, date)), to: '' };
		default:
			return { from: '', to: '' };
	}
}

/**
 * e.g. bewerbungen-2026-09-23.pdf, or with a period
 * bewerbungen-2026-11-01-bis-2027-01-31.pdf.
 */
export function exportFileName(
	extension: 'csv' | 'pdf' = 'csv',
	now = new Date(),
	period: Period = { from: '', to: '' }
): string {
	const span =
		period.from && period.to
			? `${period.from}-bis-${period.to}`
			: period.from
				? `ab-${period.from}`
				: period.to
					? `bis-${period.to}`
					: now.toISOString().slice(0, 10);
	return `bewerbungen-${span}.${extension}`;
}
