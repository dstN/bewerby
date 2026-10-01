import { isValidApplication, type Application } from '#lib/db/index.js';
import { parseProfile, type Profile } from '#lib/utils/profile.js';

/** Written by every new export. */
export const BACKUP_FORMAT_VERSION = 3;

/**
 * Read, not written. Version 3 only *adds* the profile block and the per-
 * application CV, so a version-2 file is still a complete, valid backup.
 * Rejecting it outright - as a bare equality check on the current version
 * would - would render every backup users already exported unreadable.
 */
export const READABLE_BACKUP_VERSIONS = [2, 3];

export interface BackupPayload {
	version: number;
	exportedAt: number;
	applications: Application[];
	/** OPFS ref -> base64-encoded PDF bytes, so an attached PDF survives the roundtrip. */
	pdfs: Record<string, string>;
	/** Absent in version 2 files. */
	profile?: Profile;
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
	readPdf: (ref: string) => Promise<Blob | null>,
	profile?: Profile
): Promise<BackupPayload> {
	const pdfs: Record<string, string> = {};

	// Every OPFS-backed file the backup has to carry: the job ad and the
	// application-specific CV per row, plus the profile's global CV.
	const refs = new Set<string>();
	for (const app of applications) {
		if (app.pdfRef) refs.add(app.pdfRef);
		if (app.cvRef) refs.add(app.cvRef);
	}
	if (profile?.cvRef) refs.add(profile.cvRef);

	for (const ref of refs) {
		const blob = await readPdf(ref);
		if (blob) {
			pdfs[ref] = await blobToBase64(blob);
		} else {
			console.warn(`Backup: PDF for ${ref} is missing from OPFS, skipping it`);
		}
	}

	return { version: BACKUP_FORMAT_VERSION, exportedAt: Date.now(), applications, pdfs, profile };
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

	if (
		typeof record.version !== 'number' ||
		!READABLE_BACKUP_VERSIONS.includes(record.version) ||
		!Array.isArray(record.applications)
	) {
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
			version: record.version,
			exportedAt: typeof record.exportedAt === 'number' ? record.exportedAt : Date.now(),
			applications: candidateApps as Application[],
			pdfs,
			// parseProfile re-validates field by field, so a tampered profile
			// block degrades to an empty one rather than reaching localStorage.
			profile: record.profile ? parseProfile(JSON.stringify(record.profile)) : undefined
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
): Promise<{ rows: Application[]; profile?: Profile }> {
	const refRemap = new Map<string, string>();
	for (const [oldRef, base64] of Object.entries(payload.pdfs)) {
		const newRef = await writePdf(base64ToBlob(base64));
		refRemap.set(oldRef, newRef);
	}

	const rows = payload.applications.map((app) => {
		const row: Application = { ...app };
		delete row.id;
		row.pdfRef = row.pdfRef ? refRemap.get(row.pdfRef) : undefined;
		row.cvRef = row.cvRef ? refRemap.get(row.cvRef) : undefined;
		return row;
	});

	const profile = payload.profile
		? {
				...payload.profile,
				cvRef: payload.profile.cvRef ? refRemap.get(payload.profile.cvRef) : undefined
			}
		: undefined;

	return { rows, profile };
}
