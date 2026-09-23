import type { InlineRun, MarkdownBlock } from './markdown.js';

/**
 * Renders a cover letter to a PDF, entirely on the device.
 *
 * pdf-lib is imported dynamically, the same way pdfjs is in pdf.ts - it is
 * roughly 350 KB that most sessions never need, and a static import would put
 * it in the start bundle and in the service worker's precache.
 */

export interface LetterSender {
	senderName: string;
	senderStreet: string;
	senderCity: string;
	senderEmail: string;
	senderPhone: string;
}

export interface LetterRecipient {
	company: string;
	contactName: string;
}

export interface CoverLetterPdfOptions {
	sender: LetterSender;
	recipient: LetterRecipient;
	/** The letter body, already parsed from Markdown. */
	blocks: MarkdownBlock[];
}

/** One measured piece of a line, carrying the style it must be drawn in. */
export interface WrappedSegment {
	text: string;
	bold: boolean;
	italic: boolean;
}

export type MeasureText = (text: string, bold: boolean, italic: boolean) => number;

interface Token extends WrappedSegment {
	whitespace: boolean;
}

function tokenize(runs: InlineRun[]): Token[] {
	return runs.flatMap((run) =>
		run.text
			.split(/(\s+)/)
			.filter((part) => part.length > 0)
			.map((part) => ({
				text: /^\s+$/.test(part) ? ' ' : part,
				whitespace: /^\s+$/.test(part),
				bold: run.bold,
				italic: run.italic
			}))
	);
}

/**
 * Greedy line breaking over styled runs.
 *
 * Split out from the rendering so the arithmetic can be tested without
 * pdf-lib: `measure` is the only thing that knows about fonts. Whitespace is
 * kept as its own token so a bold word butting straight against the next one
 * ("**b**c") does not gain a space it never had.
 */
export function wrapRuns(
	runs: InlineRun[],
	measure: MeasureText,
	maxWidth: number
): WrappedSegment[][] {
	const tokens = tokenize(runs);
	const lines: WrappedSegment[][] = [];

	let current: WrappedSegment[] = [];
	let width = 0;

	const pushLine = () => {
		// A trailing space would otherwise widen the line for no visible reason.
		while (current.length > 0 && current[current.length - 1].text === ' ') current.pop();
		lines.push(current);
		current = [];
		width = 0;
	};

	for (const token of tokens) {
		const tokenWidth = measure(token.text, token.bold, token.italic);

		if (token.whitespace) {
			if (current.length === 0) continue;
			current.push({ text: ' ', bold: token.bold, italic: token.italic });
			width += tokenWidth;
			continue;
		}

		if (current.length > 0 && width + tokenWidth > maxWidth) {
			pushLine();
		}

		current.push({ text: token.text, bold: token.bold, italic: token.italic });
		width += tokenWidth;
	}

	pushLine();
	return lines.length > 0 ? lines : [[]];
}

/**
 * The standard fonts encode WinAnsi (cp1252), which covers German fully but
 * not, say, an emoji or a Greek letter - and pdf-lib throws rather than
 * skipping one. Anything unencodable is dropped so a stray character cannot
 * fail the whole export.
 */
const CP1252_EXTRAS = new Set([
	'€',
	'‚',
	'ƒ',
	'„',
	'…',
	'†',
	'‡',
	'ˆ',
	'‰',
	'Š',
	'‹',
	'Œ',
	'Ž',
	'‘',
	'’',
	'“',
	'”',
	'•',
	'–',
	'—',
	'˜',
	'™',
	'š',
	'›',
	'œ',
	'ž',
	'Ÿ'
]);

export function toWinAnsi(text: string): string {
	let out = '';
	for (const char of text) {
		const code = char.codePointAt(0) ?? 0;
		if (code === 9) {
			out += '    ';
		} else if (code >= 32 && code <= 255) {
			out += char;
		} else if (CP1252_EXTRAS.has(char)) {
			out += char;
		}
	}
	return out;
}

/** A4 in PDF points, shared with the application-list renderer. */
export const PAGE_WIDTH = 595.28;
export const PAGE_HEIGHT = 841.89;
export const MARGIN = 56.7; // 2 cm
const BODY_SIZE = 11;
const SMALL_SIZE = 9;
const LINE_HEIGHT = 1.45;

/** Renders the letter and returns the PDF bytes. */
export async function renderCoverLetterPdf(options: CoverLetterPdfOptions): Promise<Uint8Array> {
	const { PDFDocument, StandardFonts } = await import('pdf-lib');

	const doc = await PDFDocument.create();
	const regular = await doc.embedFont(StandardFonts.Helvetica);
	const bold = await doc.embedFont(StandardFonts.HelveticaBold);
	const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
	const boldItalic = await doc.embedFont(StandardFonts.HelveticaBoldOblique);

	const fontFor = (isBold: boolean, isItalic: boolean) =>
		isBold && isItalic ? boldItalic : isBold ? bold : isItalic ? italic : regular;

	const measure: MeasureText = (text, isBold, isItalic) =>
		fontFor(isBold, isItalic).widthOfTextAtSize(toWinAnsi(text), BODY_SIZE);

	let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
	let y = PAGE_HEIGHT - MARGIN;
	const contentWidth = PAGE_WIDTH - MARGIN * 2;

	function ensureRoom(needed: number) {
		if (y - needed >= MARGIN) return;
		page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
		y = PAGE_HEIGHT - MARGIN;
	}

	function drawPlain(text: string, size: number, isBold = false) {
		const value = toWinAnsi(text);
		if (!value) {
			y -= size * LINE_HEIGHT;
			return;
		}
		ensureRoom(size * LINE_HEIGHT);
		page.drawText(value, {
			x: MARGIN,
			y: y - size,
			size,
			font: fontFor(isBold, false)
		});
		y -= size * LINE_HEIGHT;
	}

	// Sender block, small, top left.
	const senderLines = [
		options.sender.senderName,
		options.sender.senderStreet,
		options.sender.senderCity,
		options.sender.senderEmail,
		options.sender.senderPhone
	].filter((line) => line.trim());
	for (const line of senderLines) drawPlain(line, SMALL_SIZE);

	if (senderLines.length > 0) y -= SMALL_SIZE * 2;

	// Recipient block.
	const recipientLines = [options.recipient.company, options.recipient.contactName].filter((line) =>
		line.trim()
	);
	for (const line of recipientLines) drawPlain(line, BODY_SIZE);

	if (recipientLines.length > 0) y -= BODY_SIZE * 2;

	// Body. The letter already carries its own dateline, subject and
	// salutation - the template puts them there - so nothing is generated on
	// top of it; duplicating them would be worse than a plainer letterhead.
	for (const block of options.blocks) {
		if (block.type === 'paragraph') {
			for (const line of block.lines) {
				for (const wrapped of wrapRuns(line, measure, contentWidth)) {
					ensureRoom(BODY_SIZE * LINE_HEIGHT);
					let x = MARGIN;
					for (const segment of wrapped) {
						const value = toWinAnsi(segment.text);
						if (!value) continue;
						const font = fontFor(segment.bold, segment.italic);
						page.drawText(value, { x, y: y - BODY_SIZE, size: BODY_SIZE, font });
						x += font.widthOfTextAtSize(value, BODY_SIZE);
					}
					y -= BODY_SIZE * LINE_HEIGHT;
				}
			}
			y -= BODY_SIZE * 0.6;
			continue;
		}

		block.items.forEach((item, index) => {
			const marker = block.ordered ? `${index + 1}.` : '•';
			const markerWidth = regular.widthOfTextAtSize(`${marker} `, BODY_SIZE);
			const wrappedItem = wrapRuns(item, measure, contentWidth - markerWidth);

			wrappedItem.forEach((wrapped, lineIndex) => {
				ensureRoom(BODY_SIZE * LINE_HEIGHT);
				if (lineIndex === 0) {
					page.drawText(marker, { x: MARGIN, y: y - BODY_SIZE, size: BODY_SIZE, font: regular });
				}
				let x = MARGIN + markerWidth;
				for (const segment of wrapped) {
					const value = toWinAnsi(segment.text);
					if (!value) continue;
					const font = fontFor(segment.bold, segment.italic);
					page.drawText(value, { x, y: y - BODY_SIZE, size: BODY_SIZE, font });
					x += font.widthOfTextAtSize(value, BODY_SIZE);
				}
				y -= BODY_SIZE * LINE_HEIGHT;
			});
		});
		y -= BODY_SIZE * 0.6;
	}

	return doc.save();
}
