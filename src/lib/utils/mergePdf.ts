import { PdfProcessingError } from './pdf.js';

/**
 * Concatenates PDFs into one document, on the device.
 *
 * pdf-lib is imported dynamically for the same reason as in coverLetterPdf.ts:
 * it must not land in the start bundle or the offline precache.
 */
export async function mergePdfs(parts: Uint8Array[]): Promise<Uint8Array> {
	if (parts.length === 0) {
		throw new PdfProcessingError('corrupted', 'Nothing to merge');
	}
	if (parts.length === 1) return parts[0];

	const { PDFDocument } = await import('pdf-lib');
	const merged = await PDFDocument.create();

	for (const part of parts) {
		let source;
		try {
			// An attached CV can be anything the user picked, including a
			// password-protected file. ignoreEncryption lets pdf-lib open it far
			// enough to tell us so, instead of throwing something unreadable.
			source = await PDFDocument.load(part, { ignoreEncryption: true });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			throw new PdfProcessingError('corrupted', `A PDF could not be read: ${message}`);
		}

		if (source.isEncrypted) {
			throw new PdfProcessingError('encrypted', 'A PDF is password-protected and cannot be merged');
		}

		const pages = await merged.copyPages(source, source.getPageIndices());
		for (const page of pages) merged.addPage(page);
	}

	return merged.save();
}

/** Page count of a PDF, used to report what an export actually produced. */
export async function countPages(bytes: Uint8Array): Promise<number> {
	const { PDFDocument } = await import('pdf-lib');
	const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
	return doc.getPageCount();
}
