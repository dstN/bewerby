import { fromBase64, toBase64 } from '$lib/vault/format.js';
import type { Snapshot } from './runtime.js';

/**
 * The JSON a 'sync' kind .bwv file carries: a Yjs state and the PDF bytes it
 * refers to, by blob id. Kept apart from runtime.ts so reading a file does
 * not need Yjs loaded first.
 */
interface SnapshotJson {
	v: 1;
	update: string;
	blobs: Record<string, string>;
}

export function encodeSnapshot(snapshot: Snapshot): SnapshotJson {
	const blobs: Record<string, string> = {};
	for (const [blobId, bytes] of Object.entries(snapshot.blobs)) blobs[blobId] = toBase64(bytes);
	return { v: 1, update: toBase64(snapshot.update), blobs };
}

/** Null for anything that is not a snapshot this version can read. */
export function decodeSnapshot(json: string): Snapshot | null {
	try {
		const parsed: unknown = JSON.parse(json);
		if (!parsed || typeof parsed !== 'object') return null;
		const record = parsed as Record<string, unknown>;
		if (record.v !== 1 || typeof record.update !== 'string') return null;
		if (!record.blobs || typeof record.blobs !== 'object' || Array.isArray(record.blobs)) {
			return null;
		}
		const blobs: Record<string, Uint8Array> = {};
		for (const [blobId, value] of Object.entries(record.blobs as Record<string, unknown>)) {
			if (typeof value !== 'string') return null;
			blobs[blobId] = fromBase64(value);
		}
		return { update: fromBase64(record.update), blobs };
	} catch {
		return null;
	}
}
