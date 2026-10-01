import * as Y from 'yjs';
import type { Application, StatusHistory } from '#lib/db/index.js';
import type { Profile } from '#lib/utils/profile.js';

/**
 * How an application lives in the synced Yjs document, and the way back.
 * Pure: no Dexie, no OPFS, so the merge rules can be tested by syncing a few
 * in-memory documents (schema.test.ts).
 *
 * Merge semantics per field:
 * - notes and coverLetter are Y.Text: concurrent edits interleave, nothing
 *   is lost.
 * - tags and history are Y.Array: both devices' additions survive; tags are
 *   de-duplicated when read.
 * - every other field is a Y.Map entry: concurrent writes resolve to one of
 *   them.
 * - status is the exception. A Y.Map conflict is decided by client id, not
 *   by time, so it alone could let an older move win. The value is stored
 *   together with the time it was set, and a history entry that is newer
 *   than that value overrides it (readRow).
 */

/** A row as the document holds it: PDFs as shared blob ids, no local keys. */
export type DocRow = Omit<Application, 'id' | 'uid' | 'pdfRef' | 'cvRef'> & {
	uid: string;
	pdfBlob?: string;
	cvBlob?: string;
};

/** The profile as the document holds it: the CV as a blob id. */
export type DocProfile = Omit<Profile, 'cvRef'> & { cvBlob?: string };

type StatusValue = { s: Application['status']; t: number };

const REQUIRED_STRINGS = [
	'title',
	'company',
	'url',
	'salary',
	'contactName',
	'contactEmail',
	'contactPhone'
] as const;
const OPTIONAL_STRINGS = [
	'cardColor',
	'pdfName',
	'location',
	'referenceNumber',
	'cvName',
	'pdfBlob',
	'cvBlob'
] as const;
const NUMBERS = [
	'reminderAt',
	'lastReminderSent',
	'appliedAt',
	'sentAt',
	'rejectedAt',
	'createdAt',
	'updatedAt'
] as const;
const TEXTS = ['notes', 'coverLetter'] as const;
const STATUSES = ['draft', 'sent', 'interview', 'accepted', 'rejected'] as const;
const PRIORITIES = ['low', 'medium', 'high'] as const;
const INTERVALS = ['24h', '48h', '7d', '14d', 'custom', 'none'] as const;
const PROFILE_STRINGS = [
	'senderName',
	'senderStreet',
	'senderCity',
	'senderEmail',
	'senderPhone',
	'cvName',
	'cvBlob'
] as const;

export type RowMap = Y.Map<unknown>;

/**
 * When the stored status was set. For a row brought in from the local table
 * that is its last write; never earlier than its last history entry.
 */
export function statusTime(row: Pick<Application, 'updatedAt' | 'history'>): number {
	const lastMove = (row.history ?? []).reduce((max, entry) => Math.max(max, entry.timestamp), 0);
	return Math.max(row.updatedAt ?? 0, lastMove);
}

/** A complete row as a fresh map, ready to be set into the document. */
export function newRowMap(row: DocRow, statusAt: number): RowMap {
	const map = new Y.Map<unknown>();
	for (const key of [...REQUIRED_STRINGS, ...OPTIONAL_STRINGS, ...NUMBERS]) {
		if (row[key] !== undefined) map.set(key, row[key]);
	}
	map.set('priority', row.priority);
	map.set('reminderInterval', row.reminderInterval);
	map.set('status', { s: row.status, t: statusAt } satisfies StatusValue);
	for (const key of TEXTS) map.set(key, new Y.Text(row[key] ?? ''));
	map.set('tags', Y.Array.from(dedupe(row.tags ?? [])));
	map.set('history', Y.Array.from((row.history ?? []).map((entry) => ({ ...entry }))));
	return map;
}

/**
 * Applies field edits to an existing row. Only fields present in `changes`
 * are touched, and an unchanged value is not written again: every write is a
 * new item the other devices have to merge, and a needless one can win a
 * conflict against a real edit made elsewhere.
 */
export function applyChanges(map: RowMap, changes: Partial<DocRow>): void {
	for (const [key, value] of Object.entries(changes)) {
		if (key === 'uid' || key === 'status' || key === 'history') continue;
		if ((TEXTS as readonly string[]).includes(key)) {
			const text = typeof value === 'string' ? value : '';
			const current = map.get(key);
			if (current instanceof Y.Text) setText(current, text);
			else map.set(key, new Y.Text(text));
		} else if (key === 'tags') {
			const tags = Array.isArray(value) ? (value as string[]) : [];
			const current = map.get('tags');
			if (current instanceof Y.Array) setTags(current as Y.Array<string>, tags);
			else map.set('tags', Y.Array.from(dedupe(tags)));
		} else if (value === undefined) {
			if (map.has(key)) map.delete(key);
		} else if (map.get(key) !== value) {
			map.set(key, value);
		}
	}
}

/** Logs a move and sets the status it leads to, both dated `at`. */
export function moveTo(map: RowMap, status: Application['status'], at: number): void {
	const history = map.get('history');
	if (history instanceof Y.Array) history.push([{ status, timestamp: at }]);
	else map.set('history', Y.Array.from([{ status, timestamp: at }]));
	map.set('status', { s: status, t: at } satisfies StatusValue);
}

/**
 * Turns the text into `next` with one contiguous edit - the stretch between
 * the common prefix and the common suffix - instead of replacing it whole,
 * so an edit made elsewhere in the same text on another device survives.
 */
export function setText(text: Y.Text, next: string): void {
	const prev = text.toString();
	if (prev === next) return;
	let start = 0;
	while (start < prev.length && start < next.length && prev[start] === next[start]) start++;
	let prevEnd = prev.length;
	let nextEnd = next.length;
	while (prevEnd > start && nextEnd > start && prev[prevEnd - 1] === next[nextEnd - 1]) {
		prevEnd--;
		nextEnd--;
	}
	if (prevEnd > start) text.delete(start, prevEnd - start);
	if (nextEnd > start) text.insert(start, next.slice(start, nextEnd));
}

/** Removes what is gone, appends what is new, keeps what stayed in place. */
export function setTags(array: Y.Array<string>, next: string[]): void {
	const wanted = new Set(next);
	const current = array.toArray();
	for (let i = current.length - 1; i >= 0; i--) {
		if (!wanted.has(current[i]) || current.indexOf(current[i]) !== i) array.delete(i, 1);
	}
	const kept = new Set(array.toArray());
	const added = dedupe(next).filter((tag) => !kept.has(tag));
	if (added.length > 0) array.push(added);
}

function dedupe(values: string[]): string[] {
	return [...new Set(values)];
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
	return typeof value === 'string' && (allowed as readonly string[]).includes(value)
		? (value as T)
		: fallback;
}

function isHistoryEntry(value: unknown): value is StatusHistory {
	if (!value || typeof value !== 'object') return false;
	const entry = value as Record<string, unknown>;
	return (
		(STATUSES as readonly string[]).includes(entry.status as string) &&
		typeof entry.timestamp === 'number' &&
		Number.isFinite(entry.timestamp)
	);
}

/**
 * Reads a row back out, type-checking every field: the document arrives from
 * other devices, and nothing that is not a valid Application reaches the
 * table. History comes back in time order - after a merge, two devices'
 * moves sit in the array in client order, not in the order they happened.
 */
export function readRow(uid: string, map: RowMap): DocRow {
	const row: Record<string, unknown> = { uid };
	for (const key of REQUIRED_STRINGS) {
		const value = map.get(key);
		row[key] = typeof value === 'string' ? value : '';
	}
	for (const key of OPTIONAL_STRINGS) {
		const value = map.get(key);
		if (typeof value === 'string') row[key] = value;
	}
	for (const key of NUMBERS) {
		const value = map.get(key);
		if (typeof value === 'number' && Number.isFinite(value)) row[key] = value;
	}
	for (const key of TEXTS) {
		const value = map.get(key);
		row[key] = value instanceof Y.Text ? value.toString() : '';
	}
	// Optional on the row: an application without a letter has none, not an
	// empty one, so adopting a row does not rewrite it.
	if (row.coverLetter === '') delete row.coverLetter;
	const tags = map.get('tags');
	row.tags =
		tags instanceof Y.Array
			? dedupe(tags.toArray().filter((tag): tag is string => typeof tag === 'string'))
			: [];
	const history = map.get('history');
	const entries = (history instanceof Y.Array ? history.toArray() : [])
		.filter(isHistoryEntry)
		.map((entry) => ({ status: entry.status, timestamp: entry.timestamp }))
		.sort((a, b) => a.timestamp - b.timestamp);
	row.history = entries;

	row.priority = oneOf(map.get('priority'), PRIORITIES, 'medium');
	row.reminderInterval = oneOf(map.get('reminderInterval'), INTERVALS, 'none');

	const stored = map.get('status') as Partial<StatusValue> | undefined;
	const latest = entries.at(-1);
	let status = oneOf(stored?.s, STATUSES, latest?.status ?? 'draft');
	if (latest && latest.timestamp > (typeof stored?.t === 'number' ? stored.t : -Infinity)) {
		status = latest.status;
	}
	row.status = status;
	row.createdAt ??= 0;
	row.updatedAt ??= row.createdAt;
	return row as DocRow;
}

export function writeProfile(map: Y.Map<unknown>, profile: DocProfile): void {
	for (const key of PROFILE_STRINGS) {
		const value = profile[key];
		if (value === undefined || value === '') {
			if (map.has(key)) map.delete(key);
		} else if (map.get(key) !== value) {
			map.set(key, value);
		}
	}
}

export function readProfile(map: Y.Map<unknown>): DocProfile {
	const text = (key: string) => {
		const value = map.get(key);
		return typeof value === 'string' ? value : '';
	};
	const optional = (key: string) => text(key) || undefined;
	return {
		senderName: text('senderName'),
		senderStreet: text('senderStreet'),
		senderCity: text('senderCity'),
		senderEmail: text('senderEmail'),
		senderPhone: text('senderPhone'),
		cvName: optional('cvName'),
		cvBlob: optional('cvBlob')
	};
}
