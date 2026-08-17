import { browser } from '$app/environment';

// Attached PDFs live in the Origin Private File System instead of inside the
// IndexedDB row: an application row stores only a `pdfRef` (the OPFS file
// name), keeping every Dexie read (board, analytics, reminders) cheap
// regardless of how many/large the attached PDFs are.
const PDF_DIRECTORY = 'application-pdfs';

export function isOpfsSupported(): boolean {
	return (
		browser &&
		typeof navigator !== 'undefined' &&
		'storage' in navigator &&
		'getDirectory' in navigator.storage
	);
}

async function getPdfDirectory(): Promise<FileSystemDirectoryHandle> {
	const root = await navigator.storage.getDirectory();
	return root.getDirectoryHandle(PDF_DIRECTORY, { create: true });
}

/**
 * Writes a PDF blob to OPFS under a fresh, unique name and returns that name
 * as the reference to store on the application row.
 */
export async function writePdfToOpfs(blob: Blob): Promise<string> {
	const ref = `${crypto.randomUUID()}.pdf`;
	const dir = await getPdfDirectory();
	const fileHandle = await dir.getFileHandle(ref, { create: true });
	const writable = await fileHandle.createWritable();
	await writable.write(blob);
	await writable.close();
	return ref;
}

/**
 * Reads a previously written PDF back out of OPFS. Returns null (rather than
 * throwing) if the file is missing, so callers can degrade gracefully instead
 * of crashing on a stale/orphaned reference.
 */
export async function readPdfFromOpfs(ref: string): Promise<Blob | null> {
	try {
		const dir = await getPdfDirectory();
		const fileHandle = await dir.getFileHandle(ref);
		return await fileHandle.getFile();
	} catch (err) {
		console.error('Failed to read PDF from OPFS:', ref, err);
		return null;
	}
}

/** Removes one PDF from OPFS. Not fatal if it's already gone. */
export async function deletePdfFromOpfs(ref: string): Promise<void> {
	try {
		const dir = await getPdfDirectory();
		await dir.removeEntry(ref);
	} catch (err) {
		console.warn('Failed to delete PDF from OPFS (may already be gone):', ref, err);
	}
}

/**
 * Removes any OPFS PDF files that aren't referenced by `validRefs`. Intended
 * to run occasionally (app start, after import) to catch files orphaned by a
 * crash or an interrupted delete rather than accumulating forever.
 */
export async function cleanupOrphanedPdfs(validRefs: Set<string>): Promise<void> {
	if (!isOpfsSupported()) return;
	try {
		const dir = await getPdfDirectory();
		const orphans: string[] = [];
		for await (const name of dir.keys()) {
			if (!validRefs.has(name)) orphans.push(name);
		}
		await Promise.all(orphans.map((name) => dir.removeEntry(name)));
		if (orphans.length > 0) {
			console.info(`[opfs] cleaned up ${orphans.length} orphaned PDF file(s)`);
		}
	} catch (err) {
		console.error('OPFS orphan cleanup failed:', err);
	}
}
