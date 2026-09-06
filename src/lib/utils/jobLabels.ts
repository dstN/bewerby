/**
 * Reads labelled key/value blocks out of a job ad.
 *
 * This is the second source-agnostic signal after typography. Job boards and
 * applicant tracking systems overwhelmingly render their metadata as a field
 * label followed by a value - either `Label: Wert` on one line, or the label on
 * its own line with the value underneath. Measuring this against two completely
 * unrelated layouts (a job-board print-out and a company's own careers page)
 * found location, e-mail and phone in both, which is precisely why this
 * replaces the source-specific profile that was originally planned here.
 */

export interface LabelledFields {
	location?: string;
	salary?: string;
	referenceNumber?: string;
	contactName?: string;
	contactPhone?: string;
	contactEmail?: string;
	employmentType?: string;
	/**
	 * The occupational *category* (e.g. "Frontend-Entwickler/in"), which is not
	 * the same thing as the ad's own title ("Senior Frontend Developer (m/w/d)").
	 * Only ever a fallback - it must never overwrite a headline.
	 */
	occupation?: string;
	startDate?: string;
}

type Field = keyof LabelledFields;

/**
 * Label synonyms, DE and EN.
 *
 * Hygiene matters more than coverage here: every entry has to be specific
 * enough that a stray match is unlikely, because a wrong value is worse than a
 * missing one. Deliberately absent are bare `Ort` (matches "Ortsteil", "Vor
 * Ort"), bare `ab` (an ordinary preposition) and bare `Mail` - they produced
 * false positives without adding a field the other synonyms miss.
 */
const LABELS: ReadonlyArray<readonly [string, Field]> = [
	['arbeitsort', 'location'],
	['einsatzort', 'location'],
	['standort', 'location'],
	['dienstort', 'location'],
	['arbeitsplatz', 'location'],
	['location', 'location'],
	['workplace', 'location'],
	['work location', 'location'],

	['gehalt', 'salary'],
	['jahresgehalt', 'salary'],
	['einstiegsgehalt', 'salary'],
	['vergütung', 'salary'],
	['verguetung', 'salary'],
	['entgelt', 'salary'],
	['salary', 'salary'],
	['compensation', 'salary'],

	['referenz', 'referenceNumber'],
	['referenz-nr', 'referenceNumber'],
	['referenznummer', 'referenceNumber'],
	['kennziffer', 'referenceNumber'],
	['stellen-id', 'referenceNumber'],
	['stellenangebots-id', 'referenceNumber'],
	['job-id', 'referenceNumber'],
	['ref.-nr', 'referenceNumber'],
	['ref-nr', 'referenceNumber'],
	['reference', 'referenceNumber'],
	['requisition id', 'referenceNumber'],

	['ansprechpartner', 'contactName'],
	['ansprechpartnerin', 'contactName'],
	['ihr ansprechpartner', 'contactName'],
	['ihre ansprechpartnerin', 'contactName'],
	['dein ansprechpartner', 'contactName'],
	['deine ansprechpartnerin', 'contactName'],
	['kontaktperson', 'contactName'],
	['contact person', 'contactName'],
	['recruiter', 'contactName'],

	['telefon', 'contactPhone'],
	['telefonnummer', 'contactPhone'],
	['tel', 'contactPhone'],
	['phone', 'contactPhone'],
	['festnetz', 'contactPhone'],

	['e-mail', 'contactEmail'],
	['email', 'contactEmail'],
	['e-mail-adresse', 'contactEmail'],

	['anstellungsart', 'employmentType'],
	['beschäftigungsart', 'employmentType'],
	['vertragsart', 'employmentType'],
	['arbeitszeit', 'employmentType'],
	['employment type', 'employmentType'],

	['berufsbezeichnung', 'occupation'],
	['stellenbezeichnung', 'occupation'],
	['position', 'occupation'],
	['job title', 'occupation'],
	['jobtitel', 'occupation'],

	['beginn', 'startDate'],
	['eintrittstermin', 'startDate'],
	['startdatum', 'startDate'],
	['start date', 'startDate']
];

/** Longest label first, so `referenz-nr` wins over `referenz`. */
const SORTED_LABELS = [...LABELS].sort((a, b) => b[0].length - a[0].length);

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Some layouts prefix labels with a bullet or icon glyph that survives text
 * extraction as leading punctuation or a stray space.
 */
function stripLeadingGlyphs(text: string): string {
	return text.replace(/^[^\p{L}]+/u, '').trim();
}

function normalizeLabelSide(text: string): string {
	return stripLeadingGlyphs(text).toLowerCase();
}

function isPlausibleValue(value: string): boolean {
	const trimmed = value.trim();
	return trimmed.length > 0 && trimmed.length <= 160;
}

/**
 * Scans reconstructed lines for labelled fields. Only the first hit per field
 * is kept - later repetitions in a page footer are usually the same value.
 */
export function readLabelledFields(lines: string[]): LabelledFields {
	const found: LabelledFields = {};

	for (let index = 0; index < lines.length; index++) {
		const raw = lines[index].trim();
		if (!raw) continue;
		const normalized = normalizeLabelSide(raw);

		for (const [label, field] of SORTED_LABELS) {
			if (found[field] !== undefined) continue;

			// Form A: "Label: Wert" on a single line. Matched against the raw
			// line (minus any leading icon glyph) rather than the lowercased
			// copy, so the captured value keeps its original casing and no
			// index arithmetic between the two strings is needed.
			// `[.:]+` rather than a single character: "Referenz-Nr.: 1234" ends
			// its label with a full stop *and* a colon, and consuming only one
			// of them left the other stranded at the front of the value.
			const inline = new RegExp(`^${escapeRegExp(label)}\\s*[.:]+\\s*(.+)$`, 'i');
			const match = stripLeadingGlyphs(raw).match(inline);
			if (match && isPlausibleValue(match[1])) {
				found[field] = match[1].trim();
				break;
			}

			// Form B: the label sits alone on its line, the value follows.
			// Requires an exact match so a sentence merely starting with the
			// word cannot trigger it.
			if (normalized.replace(/[:.]$/, '') === label) {
				const next = lines[index + 1]?.trim();
				if (next && isPlausibleValue(next) && normalizeLabelSide(next) !== label) {
					found[field] = next;
					break;
				}
			}
		}
	}

	return found;
}
