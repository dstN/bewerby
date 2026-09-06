/**
 * The applicant's own details: the CV they send with (almost) every
 * application, and the sender block a generated cover letter needs.
 *
 * The shape and its validation live here, apart from the reactive store in
 * $lib/stores/profile.svelte.ts, so plain modules (the backup serializer, and
 * its tests in the DOM-free node environment) can use them without pulling a
 * runes file into scope.
 */
export interface Profile {
	/** OPFS file name of the stored CV (see $lib/utils/opfs.ts). */
	cvRef?: string;
	/** Original file name, shown in the UI. */
	cvName?: string;
	senderName: string;
	senderStreet: string;
	senderCity: string;
	senderEmail: string;
	senderPhone: string;
}

export const PROFILE_STORAGE_KEY = 'bewerby-profile';

export function emptyProfile(): Profile {
	return {
		senderName: '',
		senderStreet: '',
		senderCity: '',
		senderEmail: '',
		senderPhone: ''
	};
}

/**
 * Field-by-field validation of an untrusted profile - it arrives either from
 * localStorage or out of an imported backup file, and neither is ours to
 * trust. Anything unexpected degrades to the empty profile rather than
 * reaching the UI or a generated PDF.
 */
export function parseProfile(raw: string | null): Profile {
	if (!raw) return emptyProfile();
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object') return emptyProfile();
		const record = parsed as Record<string, unknown>;
		const text = (value: unknown): string => (typeof value === 'string' ? value : '');
		const optional = (value: unknown): string | undefined =>
			typeof value === 'string' && value ? value : undefined;

		return {
			cvRef: optional(record.cvRef),
			cvName: optional(record.cvName),
			senderName: text(record.senderName),
			senderStreet: text(record.senderStreet),
			senderCity: text(record.senderCity),
			senderEmail: text(record.senderEmail),
			senderPhone: text(record.senderPhone)
		};
	} catch {
		return emptyProfile();
	}
}
