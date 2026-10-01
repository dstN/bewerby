import { browser } from '$app/env';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker&url';
import type { DocLine, JobDocument } from './jobText.js';

export type { DocLine, DocBlock, JobDocument } from './jobText.js';
export {
	parseJobDetailsFromText,
	parseJobText,
	parseJobDocument,
	type ParsedJobInfo,
	type ParsedJobField,
	type ParsedJobResult,
	type FieldConfidence,
	type ParseHints
} from './jobParse.js';

interface PdfTextItem {
	str?: unknown;
	transform?: number[];
	fontName?: string;
	hasEOL?: boolean;
}

/** A job ad is realistically a handful of pages; this is generous headroom
 *  while still bounding the main-thread text-extraction loop below against a
 *  pathological many-hundred-page file. */
export const MAX_PDF_PAGES = 30;
/** Generous for a text document even with embedded images/logos. */
export const MAX_PDF_SIZE_BYTES = 15 * 1024 * 1024;

export type PdfErrorCode =
	'too-large' | 'too-many-pages' | 'not-a-pdf' | 'encrypted' | 'corrupted' | 'no-text';

export class PdfProcessingError extends Error {
	code: PdfErrorCode;
	constructor(code: PdfErrorCode, message: string) {
		super(message);
		this.name = 'PdfProcessingError';
		this.code = code;
	}
}

/**
 * Content-based validation, not just the .pdf extension the file picker's
 * accept=".pdf" filters on (trivially spoofed by renaming any file) - checks
 * size and the %PDF- magic header before anything is persisted or parsed.
 */
export async function validatePdfFile(file: File): Promise<void> {
	if (file.size > MAX_PDF_SIZE_BYTES) {
		throw new PdfProcessingError(
			'too-large',
			`File is ${file.size} bytes, exceeds the ${MAX_PDF_SIZE_BYTES}-byte limit`
		);
	}
	const headerBytes = await file.slice(0, 5).arrayBuffer();
	const header = new TextDecoder('ascii').decode(headerBytes);
	if (header !== '%PDF-') {
		throw new PdfProcessingError('not-a-pdf', 'File does not start with the %PDF- header');
	}
}

/**
 * Extracts the text of a PDF *together with its geometry*.
 *
 * The previous version collapsed everything into one string and read only
 * `transform[5]` (the baseline Y) to decide where to break lines, throwing the
 * scale away. That scale is the single strongest source-independent signal
 * there is - the job title is the largest text on page one - so the line model
 * now carries font size and weight as well. `text` is still produced so callers
 * that only want the prose keep working.
 */
export async function extractJobDocument(file: File): Promise<JobDocument> {
	if (!browser) {
		throw new Error('PDF parsing can only run in the browser');
	}

	// Dynamic import of the clean browser-ready ESM bundle directly from node_modules
	// @ts-expect-error - subpath import resolves to an untyped .mjs bundle; shape matches pdfjs-dist's declared types
	const pdfjs: typeof import('pdfjs-dist') = await import('pdfjs-dist/build/pdf.min.mjs');

	pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

	const arrayBuffer = await file.arrayBuffer();
	const loadingTask = pdfjs.getDocument({ data: arrayBuffer });

	let pdf;
	try {
		pdf = await loadingTask.promise;
	} catch (err) {
		const name = err && typeof err === 'object' && 'name' in err ? err.name : undefined;
		if (name === 'PasswordException') {
			throw new PdfProcessingError('encrypted', 'PDF is password-protected');
		}
		throw new PdfProcessingError('corrupted', 'PDF could not be parsed');
	}

	if (pdf.numPages > MAX_PDF_PAGES) {
		throw new PdfProcessingError(
			'too-many-pages',
			`PDF has ${pdf.numPages} pages, exceeds the ${MAX_PDF_PAGES}-page limit`
		);
	}

	const lines: DocLine[] = [];

	for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
		const page = await pdf.getPage(pageNum);
		const content = await page.getTextContent();
		const styles = content.styles as Record<string, { fontFamily?: string }> | undefined;

		// Items are walked in the order the PDF lays them out, and a line is
		// closed on an explicit end-of-line flag or a jump in baseline. Grouping
		// purely by Y would look tidier but destroys multi-column metadata
		// strips: a row of labels ("Arbeitsort  Angebotsart  Anstellungsart")
		// would merge into one line and the values underneath would no longer be
		// adjacent to their own label.
		let current: { y: number; size: number; bold: boolean; parts: string[] } | null = null;
		let lastY: number | null = null;

		const flush = () => {
			if (!current) return;
			const text = current.parts.join(' ').replace(/\s+/g, ' ').trim();
			if (text) {
				lines.push({ page: pageNum, y: current.y, size: current.size, bold: current.bold, text });
			}
			current = null;
		};

		for (const item of content.items as unknown as PdfTextItem[]) {
			if (!item || typeof item.str !== 'string') continue;
			const value = item.str.trim();
			if (!value) {
				if (item.hasEOL) flush();
				continue;
			}
			if (!item.transform || item.transform.length < 6) continue;

			const y = Math.round(item.transform[5]);
			// The rendered size is the length of the transformed unit vector, not
			// transform[0] alone - that would be wrong for rotated or skewed text.
			const size = Math.round(Math.hypot(item.transform[2], item.transform[3]) * 10) / 10;
			const fontFamily = item.fontName ? (styles?.[item.fontName]?.fontFamily ?? '') : '';
			const bold = /bold|black|heavy|semibold/i.test(fontFamily);

			if (current && lastY !== null && Math.abs(lastY - y) > 5) flush();

			if (!current) {
				current = { y, size, bold, parts: [value] };
			} else {
				current.parts.push(value);
				current.size = Math.max(current.size, size);
				current.bold = current.bold || bold;
			}

			lastY = y;
			if (item.hasEOL) flush();
		}

		flush();
	}

	const text = lines.map((line) => line.text).join('\n');
	if (!text.trim()) {
		throw new PdfProcessingError(
			'no-text',
			'No extractable text found - the PDF may be image-only/scanned'
		);
	}

	return { text, lines, pageCount: pdf.numPages };
}

/** Text-only convenience wrapper over {@link extractJobDocument}. */
export async function extractTextFromPdf(file: File): Promise<string> {
	return (await extractJobDocument(file)).text;
}
