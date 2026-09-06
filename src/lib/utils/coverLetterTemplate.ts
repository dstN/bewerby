import type { Application } from '$lib/db/index.js';
import type { Profile } from './profile.js';

/**
 * Fills a cover-letter template from the application and the stored profile.
 *
 * This is where the parser pays off twice: the fields it read out of the job
 * ad (company, title, contact, reference) are exactly the ones a letter opens
 * with, so a template turns one upload into a first draft.
 */

export interface TemplateContext {
	company: string;
	title: string;
	contact: string;
	salutation: string;
	location: string;
	date: string;
	reference: string;
	senderName: string;
}

/** German and English spellings of the same slot, so either reads naturally. */
const PLACEHOLDER_ALIASES: Record<string, keyof TemplateContext> = {
	firma: 'company',
	company: 'company',
	titel: 'title',
	stelle: 'title',
	title: 'title',
	ansprechpartner: 'contact',
	kontakt: 'contact',
	contact: 'contact',
	anrede: 'salutation',
	salutation: 'salutation',
	ort: 'location',
	location: 'location',
	datum: 'date',
	date: 'date',
	referenz: 'reference',
	reference: 'reference',
	absender: 'senderName',
	sender: 'senderName'
};

/**
 * Builds the opening line.
 *
 * Deliberately does **not** infer a gender from a first name. Getting that
 * wrong misgenders a real person on the first line of a job application, and
 * a name carries no reliable signal. So: an honorific the ad actually
 * supplied (or the user typed) is used as given; a bare name gets the
 * gender-neutral "Guten Tag", which is ordinary German business style; and
 * with no name at all it falls back to the classic collective form.
 */
export function buildSalutation(contactName: string, locale: 'de' | 'en' = 'de'): string {
	const name = contactName.trim();

	if (locale === 'en') {
		if (!name) return 'Dear Sir or Madam,';
		const withHonorific = name.match(/^(Mr\.?|Ms\.?|Mrs\.?|Dr\.?)\s+(.+)$/i);
		return withHonorific ? `Dear ${withHonorific[1]} ${withHonorific[2]},` : `Dear ${name},`;
	}

	if (!name) return 'Sehr geehrte Damen und Herren,';

	const frau = name.match(/^Frau\s+(.+)$/i);
	if (frau) return `Sehr geehrte Frau ${frau[1]},`;

	const herr = name.match(/^Herrn?\s+(.+)$/i);
	if (herr) return `Sehr geehrter Herr ${herr[1]},`;

	return `Guten Tag ${name},`;
}

export function buildTemplateContext(
	application: Pick<
		Application,
		'company' | 'title' | 'contactName' | 'location' | 'referenceNumber'
	>,
	profile: Pick<Profile, 'senderName' | 'senderCity'>,
	locale: 'de' | 'en' = 'de',
	now: Date = new Date()
): TemplateContext {
	// The sender's own city heads the date line in a German letter, so the
	// profile wins over the employer's location for that slot.
	const senderCity = profile.senderCity.replace(/^\d{4,5}\s+/, '').trim();

	return {
		company: application.company ?? '',
		title: application.title ?? '',
		contact: application.contactName ?? '',
		salutation: buildSalutation(application.contactName ?? '', locale),
		location: senderCity || (application.location ?? ''),
		date: now.toLocaleDateString(locale === 'en' ? 'en-GB' : 'de-DE', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric'
		}),
		reference: application.referenceNumber ?? '',
		senderName: profile.senderName ?? ''
	};
}

/**
 * Replaces `{{platzhalter}}` in a template. An unknown placeholder is left
 * untouched rather than blanked, so a typo is visible instead of silently
 * eating text.
 */
export function applyTemplate(template: string, context: TemplateContext): string {
	return template.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (match, rawName: string) => {
		const key = PLACEHOLDER_ALIASES[rawName.toLowerCase()];
		if (!key) return match;
		return context[key] ?? '';
	});
}

/**
 * Tidies a filled template: a slot that had nothing to put in it leaves an
 * empty line or a dangling label behind, which reads worse than not
 * mentioning the thing at all.
 */
export function tidyFilledTemplate(text: string): string {
	return text
		.split('\n')
		.filter((line, index, all) => {
			const trimmed = line.trim();
			// Drop a reference line that lost its number.
			if (/^(?:Referenz(?:nummer)?|Kennziffer|Reference)\s*:?\s*$/i.test(trimmed)) return false;
			// Collapse runs of more than one blank line.
			return !(trimmed === '' && all[index - 1]?.trim() === '');
		})
		.join('\n')
		.trim();
}
