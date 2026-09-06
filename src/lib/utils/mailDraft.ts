/**
 * Builds the `mailto:` link that hands a finished application to the user's
 * mail client.
 *
 * Worth stating plainly, because the UI has to say it too: **mailto cannot
 * carry attachments.** RFC 6068 defines no attachment parameter and no mail
 * client implements one. So this fills in recipient, subject and the letter as
 * plain text; the PDF is downloaded separately and attached by hand, or handed
 * over through the Web Share API where the platform supports it.
 */

export interface MailDraftInput {
	to: string;
	subject: string;
	body: string;
}

export interface MailDraftResult {
	url: string;
	/** True when the body had to be shortened to stay openable. */
	truncated: boolean;
}

/**
 * Outlook on Windows silently truncates long `mailto:` URLs - no error, just a
 * cut-off draft - and the practical ceiling sits around 2000 characters. This
 * stays under it and tells the caller when it had to cut, so the UI can offer
 * the full text on the clipboard instead of quietly shipping half a letter.
 */
export const MAILTO_MAX_LENGTH = 1900;

function encodeMailto({ to, subject, body }: MailDraftInput): string {
	const params = new URLSearchParams();
	if (subject) params.set('subject', subject);
	if (body) params.set('body', body);
	// URLSearchParams encodes spaces as "+", which mail clients render
	// literally in a subject line rather than as spaces.
	const query = params.toString().replace(/\+/g, '%20');
	return `mailto:${encodeURIComponent(to)}${query ? `?${query}` : ''}`;
}

export function buildMailtoUrl(input: MailDraftInput): MailDraftResult {
	const full = encodeMailto(input);
	if (full.length <= MAILTO_MAX_LENGTH) {
		return { url: full, truncated: false };
	}

	// Shrink the body until the whole URL fits. Cutting on a character count
	// rather than a byte count is fine here: the loop measures the encoded
	// result each time, so multi-byte characters are accounted for.
	let low = 0;
	let high = input.body.length;
	while (low < high) {
		const middle = Math.ceil((low + high) / 2);
		const candidate = encodeMailto({ ...input, body: `${input.body.slice(0, middle)} […]` });
		if (candidate.length <= MAILTO_MAX_LENGTH) {
			low = middle;
		} else {
			high = middle - 1;
		}
	}

	return {
		url: encodeMailto({ ...input, body: `${input.body.slice(0, low)} […]` }),
		truncated: true
	};
}
