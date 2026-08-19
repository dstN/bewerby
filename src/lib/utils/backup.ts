import { isValidApplication, type Application } from '$lib/db/index.js';

export const BACKUP_FORMAT_VERSION = 2;

export interface BackupPayload {
	version: number;
	exportedAt: number;
	applications: Application[];
	/** OPFS ref -> base64-encoded PDF bytes, so an attached PDF survives the roundtrip. */
	pdfs: Record<string, string>;
}

export async function blobToBase64(blob: Blob): Promise<string> {
	const bytes = new Uint8Array(await blob.arrayBuffer());
	const chunkSize = 0x8000;
	let binary = '';
	for (let i = 0; i < bytes.length; i += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
	}
	return btoa(binary);
}

export function base64ToBlob(base64: string, mimeType = 'application/pdf'): Blob {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return new Blob([bytes], { type: mimeType });
}

/** Gathers every application row plus the actual bytes of every attached PDF. */
export async function buildBackupPayload(
	applications: Application[],
	readPdf: (ref: string) => Promise<Blob | null>
): Promise<BackupPayload> {
	const pdfs: Record<string, string> = {};
	for (const app of applications) {
		if (!app.pdfRef) continue;
		const blob = await readPdf(app.pdfRef);
		if (blob) {
			pdfs[app.pdfRef] = await blobToBase64(blob);
		} else {
			console.warn(`Backup: PDF for ${app.pdfRef} is missing from OPFS, skipping it`);
		}
	}
	return { version: BACKUP_FORMAT_VERSION, exportedAt: Date.now(), applications, pdfs };
}

export type BackupParseResult =
	{ ok: true; data: BackupPayload } | { ok: false; error: 'format' | 'validation' };

/**
 * Parses and fully structurally validates an untrusted backup JSON string -
 * every application field, not just title/company - so a malformed file is
 * rejected up front instead of writing rows that later crash the board's or
 * analytics' $derived computations (e.g. a missing `tags` or `history`).
 */
export function parseBackupPayload(json: string): BackupParseResult {
	let data: unknown;
	try {
		data = JSON.parse(json);
	} catch {
		return { ok: false, error: 'format' };
	}

	if (!data || typeof data !== 'object') return { ok: false, error: 'format' };
	const record = data as Record<string, unknown>;

	if (record.version !== BACKUP_FORMAT_VERSION || !Array.isArray(record.applications)) {
		return { ok: false, error: 'format' };
	}

	const candidateApps = record.applications as unknown[];
	if (!candidateApps.every(isValidApplication)) {
		return { ok: false, error: 'validation' };
	}

	const pdfs =
		record.pdfs && typeof record.pdfs === 'object' ? (record.pdfs as Record<string, string>) : {};

	return {
		ok: true,
		data: {
			version: BACKUP_FORMAT_VERSION,
			exportedAt: typeof record.exportedAt === 'number' ? record.exportedAt : Date.now(),
			applications: candidateApps as Application[],
			pdfs
		}
	};
}

/**
 * Restores every PDF under a *fresh* OPFS ref before touching the database -
 * never reuse the ref from the backup file, since it could collide with an
 * unrelated file this browser already has on disk. Decoding/writing all of
 * them up front, before any db write, means a corrupt PDF entry fails the
 * whole import cleanly instead of leaving some applications pointing at
 * attachments that never got restored.
 *
 * Never trust a foreign export's autoincrement ids against this browser's
 * live sequence either - every imported row gets a fresh id.
 */
export async function prepareImportRows(
	payload: BackupPayload,
	writePdf: (blob: Blob) => Promise<string>
): Promise<Application[]> {
	const refRemap = new Map<string, string>();
	for (const [oldRef, base64] of Object.entries(payload.pdfs)) {
		const newRef = await writePdf(base64ToBlob(base64));
		refRemap.set(oldRef, newRef);
	}

	return payload.applications.map((app) => {
		const row: Application = { ...app };
		delete row.id;
		row.pdfRef = row.pdfRef ? refRemap.get(row.pdfRef) : undefined;
		return row;
	});
}
