/**
 * Extracts job details from a parsed PDF.
 *
 * The guiding rule is that no signal may depend on a particular job board or a
 * particular profession. The previous implementation searched for the title in
 * a hard-coded list of 33 role nouns ("developer", "entwickler", "ingenieur",
 * ...), which meant a nurse, a baker or a tax clerk never got a title at all.
 * That list is gone. What replaced it, in descending order of strength:
 *
 *   1. Typography - the job title is the largest text on page one. Measured
 *      across five real ads from two unrelated sources: 5/5 correct, including
 *      one where every text heuristic fails. It holds because setting the
 *      vacancy as the headline is a typographic convention, not a domain rule.
 *   2. Labelled key/value blocks (see jobLabels.ts).
 *   3. Gender markers and the stock phrases German ads announce vacancies with.
 *   4. Company from legal form, e-mail domain and the print-to-PDF file name.
 *
 * Above all of it sits one invariant: **a field stays empty rather than carry a
 * value we are not sure about.** Every value therefore also carries a
 * confidence, and the UI only pre-selects the confident ones.
 */

import {
	GENDER_TAG_REGEX,
	VACANCY_PHRASE_REGEX,
	groupBlocks,
	isSectionHeading,
	normalizeLine,
	stripBoilerplate,
	type DocBlock,
	type DocLine,
	type JobDocument
} from './jobText.js';
import { readLabelledFields } from './jobLabels.js';

export interface ParsedJobInfo {
	company: string;
	title: string;
	contactName: string;
	contactEmail: string;
	contactPhone: string;
	url: string;
	salary: string;
	location: string;
	referenceNumber: string;
}

export type ParsedJobField = keyof ParsedJobInfo;

/**
 * `high` means the value came from an unambiguous structural signal (a label, a
 * legal form, a headline that clearly outranks body text). `low` means it is a
 * guess worth showing but not worth pre-selecting.
 */
export type FieldConfidence = 'high' | 'low';

export interface ParsedJobResult {
	info: ParsedJobInfo;
	confidence: Partial<Record<ParsedJobField, FieldConfidence>>;
}

export interface ParseHints {
	/**
	 * Browsers name "print to PDF" captures `<page title> _ <host>.pdf`, which
	 * makes the file name a genuine (if weak) source for the employer and the
	 * posting URL.
	 */
	fileName?: string;
}

function emptyInfo(): ParsedJobInfo {
	return {
		company: '',
		title: '',
		contactName: '',
		contactEmail: '',
		contactPhone: '',
		url: '',
		salary: '',
		location: '',
		referenceNumber: ''
	};
}

/**
 * Legal forms, extended well past the commercial ones. Without the public and
 * non-profit entries the whole public sector, every clinic and every charity
 * would fall through - exactly the "any industry" gap this rewrite is about.
 *
 * Split in two on purpose. The short all-caps forms have to be matched
 * case-sensitively, because case-insensitively they collide with ordinary
 * words: `AB` (Swedish) matched "**ab** sofort" and confidently reported the
 * start date as the employer in three of five real ads.
 */
const COMPANY_SUFFIX_CASE_INSENSITIVE =
	/(?:^|\s)(?:gGmbH|GmbH\s*&\s*Co\.\s*KG|GmbH|mbH|GesmbH|KGaA|e\.\s*G\.|e\.\s*V\.|AöR|KdöR|Stiftung|Universitätsklinikum|Klinikum|Landkreis|Bezirksamt|Stadtverwaltung|Sp\.\s*z\s*o\.o\.|Corporation|Limited|Incorporated|Pty\s+Ltd)(?:\b|\.|$)/i;

const COMPANY_SUFFIX_CASE_SENSITIVE =
	/(?:^|\s)(?:AG|SE|GbR|KG|OHG|UG|gAG|AB|AS|Oy|ApS|B\.V\.|N\.V\.|S\.A\.S\.|S\.A\.|SARL|S\.L\.|S\.p\.A\.|S\.r\.l\.|Inc\.|Corp\.|Ltd\.|LLC|PLC)(?:\b|\.|$)/;

function hasLegalForm(text: string): boolean {
	return COMPANY_SUFFIX_CASE_INSENSITIVE.test(text) || COMPANY_SUFFIX_CASE_SENSITIVE.test(text);
}

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const HR_EMAIL_REGEX =
	/^(?:jobs|karriere|career|careers|bewerbung|bewerbungen|hr|personal|recruiting|recruitment|vacatures|sollicitaties|recrutement|empleo|lavora|info|kontakt|contact|welcome|talent|hiring|people)@/i;

const URL_REGEX =
	/https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_+.~#?&//=]*)/gi;

const APPLICANT_URL_REGEX =
	/github\.io|github\.com|cv\.|portfolio|resume|linkedin\.com\/in|xing\.com\/profile/i;

/**
 * A label right before a number decides the question either way. Note the
 * `[-\s]?` before the "Nr." group: without it `Referenz-Nr.: 10000-1207310008-S`
 * slipped through and the reference number was stored as the contact's phone
 * number in two of five real ads.
 */
const NON_PHONE_CONTEXT_REGEX =
	/(?:Rechnung|Bestell(?:ung)?|Order|Invoice|Referenz|Kennziffer|Aktenzeichen|Vorgang|Kunden|Auftrag|Stellen|Job)[-\s]?(?:nr\.?|no\.?|nummer|id)?\s*[:.#]?\s*$/i;

const PHONE_CONTEXT_REGEX =
	/(?:Tel\.?|Telefon|Phone|Mobile?|Mobil|Fax|Handy|GSM|Cell|Kontakt|Ansprechpartner(?:in)?)\s*\.?:?\s*$/i;

const SALARY_RANGE_REGEX =
	/\d{1,3}(?:\.\d{3})+(?:,\d{2})?\s*(?:€|EUR)\s*(?:[–—-]|bis)\s*\d{1,3}(?:\.\d{3})+(?:,\d{2})?\s*(?:€|EUR)(?:\s*(?:\/|pro\s+)?\s*(?:Jahr|Monat|a|p\.a\.))?/i;

/** "Iggensbach , Deutschland" - a place line, never the employer. */
const LOCATION_LINE_REGEX =
	/^.{2,40},\s*(?:Deutschland|Germany|Österreich|Austria|Schweiz|Switzerland|Nederland|France|España|Italia)$/i;

const DATE_LINE_REGEX = /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/;

function median(values: number[]): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function stripLeadingLabel(text: string): string {
	return text
		.replace(
			/^(?:Stellenausschreibung|Stellenangebot|Stellenanzeige|Betreff|Subject|Position|Job\s+Title|Vacancy)\s*[:–-]\s*/i,
			''
		)
		.replace(/^[–—-]\s*/, '')
		.trim();
}

function looksLikeCompany(text: string): boolean {
	const trimmed = text.trim();
	if (trimmed.length < 2 || trimmed.length > 60) return false;
	if (trimmed.includes('@')) return false;
	if (/^[+\d]/.test(trimmed)) return false;
	if (DATE_LINE_REGEX.test(trimmed)) return false;
	if (LOCATION_LINE_REGEX.test(trimmed)) return false;
	if (GENDER_TAG_REGEX.test(trimmed)) return false;
	if (isSectionHeading(trimmed)) return false;
	// A line with no lowercase at all is usually a spaced-out or all-caps
	// headline fragment, not an employer name.
	if (!/[a-zäöüß]/.test(trimmed)) return false;
	return true;
}

/** Derives an employer name from a mail or web host: `jobs@fenecon.de` -> `Fenecon`. */
function companyFromHost(host: string): string {
	const label = host
		.replace(/^www\./i, '')
		.split('.')[0]
		.replace(/[-_]+/g, ' ')
		.trim();
	if (label.length < 3 || /^(mail|info|kontakt|contact|jobs|karriere|web|portal)$/i.test(label)) {
		return '';
	}
	return label.replace(/\b[a-z]/g, (char) => char.toUpperCase());
}

function hostFromFileName(fileName: string): string {
	// "Frontend-Entwickler (m_w_d) _ www.fenecon.de.pdf"
	const match = fileName.match(/([a-z0-9-]+(?:\.[a-z0-9-]+)+)\.pdf$/i);
	return match ? match[1] : '';
}

interface TitlePick {
	title: string;
	confidence: FieldConfidence;
	blockIndex: number;
}

/**
 * Typography first: the largest block on page one. Only trusted when it
 * actually stands out from body text - a document with uniform sizing (a plain
 * text export, say) gets no title from this path and falls through to the
 * structural signals instead of inventing one.
 */
function pickTitleFromLayout(blocks: DocBlock[]): TitlePick | null {
	const pageOne = blocks.filter((block) => block.page === 1);
	if (pageOne.length === 0) return null;

	const bodySize = median(blocks.map((block) => block.size));
	const maxSize = Math.max(...pageOne.map((block) => block.size));
	if (bodySize > 0 && maxSize < bodySize * 1.15) return null;

	const candidates = pageOne
		.map((block, index) => ({ block, index }))
		.filter(({ block }) => block.size >= maxSize * 0.9)
		.filter(({ block }) => {
			const text = stripLeadingLabel(block.text);
			return text.length >= 3 && text.length <= 120 && !isSectionHeading(text);
		});

	if (candidates.length === 0) return null;

	// A gender marker settles a tie between equally large blocks, and it is the
	// one title signal that holds across every industry.
	const tagged = candidates.find(({ block }) => GENDER_TAG_REGEX.test(block.text));
	const chosen = tagged ?? candidates.reduce((a, b) => (a.block.y >= b.block.y ? a : b));

	const standsOut = bodySize > 0 && chosen.block.size >= bodySize * 1.25;
	return {
		title: stripLeadingLabel(chosen.block.text),
		confidence: standsOut || tagged ? 'high' : 'low',
		blockIndex: chosen.index
	};
}

/** Fallbacks for documents whose typography carries no signal. */
function pickTitleFromText(lines: string[]): TitlePick | null {
	for (let index = 0; index < lines.length; index++) {
		const match = lines[index].match(VACANCY_PHRASE_REGEX);
		if (!match) continue;
		const inline = stripLeadingLabel((match[1] ?? '').trim());
		if (inline.length >= 3 && inline.length <= 100) {
			return { title: inline, confidence: 'high', blockIndex: -1 };
		}
		const next = lines[index + 1]?.trim();
		if (next && next.length >= 3 && next.length <= 100) {
			return { title: stripLeadingLabel(next), confidence: 'high', blockIndex: -1 };
		}
	}

	const tagged = lines.find(
		(line) => GENDER_TAG_REGEX.test(line) && line.length >= 3 && line.length <= 100
	);
	if (tagged) return { title: stripLeadingLabel(tagged), confidence: 'low', blockIndex: -1 };

	return null;
}

/**
 * True when the document reads like the applicant's own cover letter or CV
 * rather than an employer's ad. Kept from the previous implementation because
 * it stops the applicant's own address block being stored as the recruiter's.
 */
function isCoverLetterOrCV(text: string): boolean {
	return (
		/(?:Bewerbung|Bewerbungsschreiben|Lebenslauf|Sehr\s+geehrte|Cover\s+Letter|Curriculum\s+Vitae|Resume|Sollicitatie|Geachte|Candidature|Lettre\s+de\s+motivation|Candidatura|Estimad[oa]|Gentile)/i.test(
			text
		) &&
		!/(?:wir\s+suchen|unsere\s+Anforderungen|deine\s+Aufgaben|ihre\s+Aufgaben|dein\s+Profil|ihr\s+Profil|wir\s+bieten|das\s+bringst\s+du\s+mit|das\s+bringen\s+sie\s+mit|das\s+erwartet\s+sie|jetzt\s+bewerben|what\s+we\s+offer|qualifications|requirements|responsibilities|your\s+profile|we\s+are\s+(?:looking|hiring|seeking)|job\s+description|apply\s+now|wij\s+zoeken|nous\s+recherchons|buscamos|cercasi)/i.test(
			text
		)
	);
}

function pickEmail(
	text: string,
	isSelfDocument: boolean
): { value: string; confidence: FieldConfidence } {
	const matches = [...text.matchAll(EMAIL_REGEX)];
	let fallback = '';
	for (const match of matches) {
		const email = match[0];
		if (HR_EMAIL_REGEX.test(email)) return { value: email, confidence: 'high' };
		const index = match.index ?? 0;
		const nearEdge = index < 350 || index > text.length - 350;
		if (isSelfDocument && nearEdge) continue;
		if (!fallback) fallback = email;
	}
	return fallback ? { value: fallback, confidence: 'low' } : { value: '', confidence: 'low' };
}

function pickPhone(
	text: string,
	isSelfDocument: boolean
): { value: string; confidence: FieldConfidence } {
	for (const match of text.matchAll(/\+?[0-9][0-9\s\-/()]{8,20}/g)) {
		const phone = match[0].trim();
		const cleaned = phone.replace(/[\s\-/()]/g, '');
		if (cleaned.length < 9 || cleaned.length > 16 || !/^\+?\d+$/.test(cleaned)) continue;

		const index = match.index ?? 0;
		const preceding = text.slice(Math.max(0, index - 40), index);
		if (NON_PHONE_CONTEXT_REGEX.test(preceding)) continue;

		// Reference numbers are shaped like phone numbers but never start with a
		// dialling prefix, and their digit groups run far longer than any group
		// in a real number ("10000-1207310008-S").
		const startsLikeDialling = phone.startsWith('+') || cleaned.startsWith('0');
		if (!startsLikeDialling && phone.split(/[^\d]+/).some((group) => group.length > 8)) continue;

		const labelled = PHONE_CONTEXT_REGEX.test(preceding);
		if (!labelled && isSelfDocument && (index < 350 || index > text.length - 350)) continue;

		return { value: phone, confidence: labelled ? 'high' : 'low' };
	}
	return { value: '', confidence: 'low' };
}

function pickContactName(lines: string[]): { value: string; confidence: FieldConfidence } {
	const honorific =
		/^(?:Herrn?|Frau|Mr\.?|Ms\.?|Mrs\.?|Dr\.)\s+([A-ZÄÖÜ][\p{L}-]+(?:\s+[A-ZÄÖÜ][\p{L}-]+){1,2})$/u;

	for (let index = 0; index < lines.length; index++) {
		const match = lines[index].trim().match(honorific);
		if (!match) continue;
		// Only trust a bare name line when it sits inside a contact block -
		// otherwise a salutation in body text would be picked up.
		const context = lines.slice(Math.max(0, index - 3), index + 4).join(' ');
		if (/(?:Telefon|Tel\.|E-Mail|Email|Kontakt|Bewerbung|Ansprechpartner)/i.test(context)) {
			return { value: match[1], confidence: 'high' };
		}
	}
	return { value: '', confidence: 'low' };
}

/** Parses a job ad from a document that still carries its layout. */
export function parseJobDocument(doc: JobDocument, hints: ParseHints = {}): ParsedJobResult {
	const info = emptyInfo();
	const confidence: Partial<Record<ParsedJobField, FieldConfidence>> = {};

	const cleanedLines: DocLine[] = stripBoilerplate(
		doc.lines
			.map((line) => ({ ...line, text: normalizeLine(line.text) }))
			.filter((line) => line.text.length > 0)
	);
	const plainLines = cleanedLines.map((line) => line.text);
	const text = plainLines.join('\n');
	const selfDocument = isCoverLetterOrCV(text);
	const blocks = groupBlocks(cleanedLines);
	const labels = readLabelledFields(plainLines);

	// --- Title -------------------------------------------------------------
	const layoutTitle = pickTitleFromLayout(blocks);
	const titlePick = layoutTitle ?? pickTitleFromText(plainLines);
	if (titlePick) {
		info.title = titlePick.title;
		confidence.title = titlePick.confidence;
	} else if (labels.occupation) {
		// The occupational category is not the ad's own title, so it is only
		// ever an unconfident stand-in.
		info.title = labels.occupation;
		confidence.title = 'low';
	}

	// --- Company -----------------------------------------------------------
	const legalFormLine = plainLines.find((line) => hasLegalForm(line) && looksLikeCompany(line));

	const emailPick = pickEmail(text, selfDocument);
	const emailHost = emailPick.value.split('@')[1] ?? '';
	const fileHost = hints.fileName ? hostFromFileName(hints.fileName) : '';

	if (legalFormLine) {
		info.company = legalFormLine.replace(/^[0-9.\s|–-]+/, '').trim();
		confidence.company = 'high';
	} else {
		// The block immediately below the headline is the employer in every
		// layout examined; it is validated rather than trusted blindly.
		const afterTitle =
			layoutTitle && layoutTitle.blockIndex >= 0
				? blocks
						.filter((block) => block.page === 1)
						.slice(layoutTitle.blockIndex + 1)
						.find((block) => looksLikeCompany(block.text))
				: undefined;

		const fromHost = companyFromHost(emailHost) || companyFromHost(fileHost);
		if (afterTitle) {
			const matchesHost =
				fromHost.length > 0 && afterTitle.text.toLowerCase().includes(fromHost.toLowerCase());
			info.company = afterTitle.text;
			confidence.company = matchesHost ? 'high' : 'low';
		} else if (fromHost) {
			info.company = fromHost;
			confidence.company = 'low';
		}
	}

	// --- Contact -----------------------------------------------------------
	if (labels.contactEmail && /@/.test(labels.contactEmail)) {
		info.contactEmail = labels.contactEmail.match(EMAIL_REGEX)?.[0] ?? labels.contactEmail;
		confidence.contactEmail = 'high';
	} else if (emailPick.value) {
		info.contactEmail = emailPick.value;
		confidence.contactEmail = emailPick.confidence;
	}

	if (labels.contactPhone) {
		info.contactPhone = labels.contactPhone;
		confidence.contactPhone = 'high';
	} else {
		const phonePick = pickPhone(text, selfDocument);
		if (phonePick.value) {
			info.contactPhone = phonePick.value;
			confidence.contactPhone = phonePick.confidence;
		}
	}

	if (labels.contactName) {
		info.contactName = labels.contactName
			.replace(/^(?:Herrn?|Frau|Mr\.?|Ms\.?|Dr\.)\s+/i, '')
			.trim();
		confidence.contactName = 'high';
	} else {
		const namePick = pickContactName(plainLines);
		if (namePick.value) {
			info.contactName = namePick.value;
			confidence.contactName = namePick.confidence;
		}
	}

	// --- Salary, location, reference ---------------------------------------
	if (labels.salary) {
		info.salary = labels.salary;
		confidence.salary = 'high';
	} else {
		const salaryMatch = text.match(SALARY_RANGE_REGEX);
		if (salaryMatch) {
			info.salary = salaryMatch[0].trim();
			confidence.salary = 'low';
		}
	}

	if (labels.location) {
		info.location = labels.location;
		confidence.location = 'high';
	}

	if (labels.referenceNumber) {
		info.referenceNumber = labels.referenceNumber;
		confidence.referenceNumber = 'high';
	}

	// --- URL ---------------------------------------------------------------
	for (const match of text.matchAll(URL_REGEX)) {
		if (APPLICANT_URL_REGEX.test(match[0])) continue;
		info.url = match[0];
		confidence.url = 'low';
		break;
	}
	if (!info.url && fileHost) {
		info.url = `https://${fileHost}`;
		confidence.url = 'low';
	}

	// The invariant: never hand back a value we could not justify.
	for (const key of Object.keys(info) as ParsedJobField[]) {
		if (!info[key]) delete confidence[key];
	}

	return { info, confidence };
}

/**
 * Text-only entry point, kept for callers that have no layout information.
 * It runs the same pipeline over a document of uniform type size, which means
 * the typography signal deliberately yields nothing and the structural signals
 * carry the result on their own.
 */
export function parseJobDetailsFromText(text: string, hints: ParseHints = {}): ParsedJobInfo {
	const lines: DocLine[] = text
		.split(/\r?\n/)
		.map((line, index) => ({ page: 1, y: 10_000 - index * 12, size: 12, bold: false, text: line }));

	return parseJobDocument({ text, lines, pageCount: 1 }, hints).info;
}
