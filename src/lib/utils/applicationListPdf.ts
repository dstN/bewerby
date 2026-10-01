import type { PDFFont } from 'pdf-lib';
import { MARGIN, PAGE_HEIGHT, PAGE_WIDTH, toWinAnsi } from '#lib/utils/coverLetterPdf.js';
import {
	toExportRows,
	type ExportCells,
	type ExportLabels,
	type ExportRow
} from './applicationExport.js';

/**
 * Renders the proof-of-applications list as a printable A4 table, entirely on
 * the device. Same three columns as the CSV, from the same `toExportRows` -
 * this is the version that gets handed in on paper, the CSV is the one that
 * gets opened in a spreadsheet.
 *
 * pdf-lib is imported dynamically, exactly as in coverLetterPdf.ts: ~350 KB
 * that most sessions never need has no business in the start bundle or in the
 * service worker's precache.
 */

export interface ListPdfLabels extends ExportLabels {
	/** Document heading, e.g. "Nachweis der Bewerbungsbemühungen". */
	heading: string;
	/** Line under the heading; `{date}` and `{count}` are substituted. */
	generated: string;
	/** Footer on every page; `{page}` and `{total}` are substituted. */
	pageLabel: string;
}

const TITLE_SIZE = 15;
const BODY_SIZE = 10;
const SMALL_SIZE = 8;
const ROW_HEIGHT = 18;
const HEADER_GAP = 8;

/** Column x offsets from the left margin, and the width each one may use. */
const COLUMNS = [
	{ x: 0, width: 90 },
	{ x: 100, width: 250 },
	{ x: 360, width: 122 }
] as const;

/**
 * Cuts a cell down to the column width, ending in an ellipsis so a truncated
 * company name is visibly truncated rather than quietly wrong. Split out from
 * the rendering because it is the only arithmetic here worth testing without
 * a font engine - `measure` is the sole thing that knows about fonts.
 */
export function truncateToWidth(
	text: string,
	measure: (value: string) => number,
	maxWidth: number
): string {
	if (measure(text) <= maxWidth) return text;
	let cut = text;
	while (cut.length > 0 && measure(`${cut}…`) > maxWidth) {
		cut = cut.slice(0, -1);
	}
	return cut.length > 0 ? `${cut}…` : '';
}

export async function renderApplicationListPdf(
	apps: ExportRow[],
	labels: ListPdfLabels,
	locale: string
): Promise<Uint8Array> {
	const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');

	const doc = await PDFDocument.create();
	const regular = await doc.embedFont(StandardFonts.Helvetica);
	const bold = await doc.embedFont(StandardFonts.HelveticaBold);

	const rows = toExportRows(apps, labels, locale);
	const contentWidth = PAGE_WIDTH - MARGIN * 2;
	const rule = rgb(0.8, 0.8, 0.8);

	let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
	let y = PAGE_HEIGHT - MARGIN;

	function draw(text: string, x: number, size: number, font: PDFFont) {
		const value = toWinAnsi(text);
		if (!value) return;
		page.drawText(value, { x, y: y - size, size, font });
	}

	function drawCells(cells: ExportCells, font: PDFFont, size: number) {
		cells.forEach((cell, index) => {
			const column = COLUMNS[index];
			const fitted = truncateToWidth(
				cell,
				(value) => font.widthOfTextAtSize(toWinAnsi(value), size),
				column.width
			);
			draw(fitted, MARGIN + column.x, size, font);
		});
	}

	function drawTableHeader() {
		drawCells(labels.header, bold, BODY_SIZE);
		y -= BODY_SIZE + HEADER_GAP / 2;
		page.drawLine({
			start: { x: MARGIN, y },
			end: { x: MARGIN + contentWidth, y },
			thickness: 0.8,
			color: rule
		});
		y -= HEADER_GAP;
	}

	// Title block, first page only - a repeated heading on page three would
	// read as a second document rather than a continuation.
	draw(labels.heading, MARGIN, TITLE_SIZE, bold);
	y -= TITLE_SIZE * 1.6;
	draw(
		labels.generated
			.replace('{date}', new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date()))
			.replace('{count}', String(rows.length)),
		MARGIN,
		SMALL_SIZE,
		regular
	);
	y -= SMALL_SIZE * 3;

	drawTableHeader();

	for (const cells of rows) {
		// Reserve the footer's band as well, or the last row of a full page
		// prints straight through the page number.
		if (y - ROW_HEIGHT < MARGIN + SMALL_SIZE * 2) {
			page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
			y = PAGE_HEIGHT - MARGIN;
			drawTableHeader();
		}
		drawCells(cells, regular, BODY_SIZE);
		y -= ROW_HEIGHT;
		page.drawLine({
			start: { x: MARGIN, y: y + ROW_HEIGHT - BODY_SIZE - 5 },
			end: { x: MARGIN + contentWidth, y: y + ROW_HEIGHT - BODY_SIZE - 5 },
			thickness: 0.4,
			color: rule
		});
	}

	// Page numbers go on last, when the total is finally known - a proof that
	// gets handed in on paper should say whether a sheet is missing.
	const pages = doc.getPages();
	pages.forEach((sheet, index) => {
		const text = toWinAnsi(
			labels.pageLabel.replace('{page}', String(index + 1)).replace('{total}', String(pages.length))
		);
		if (!text) return;
		sheet.drawText(text, {
			x: PAGE_WIDTH - MARGIN - regular.widthOfTextAtSize(text, SMALL_SIZE),
			y: MARGIN - SMALL_SIZE * 1.5,
			size: SMALL_SIZE,
			font: regular
		});
	});

	return doc.save();
}
