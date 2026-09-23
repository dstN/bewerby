import type { ParsedJobInfo } from './jobParse.js';

/**
 * Turns a fetched job-ad page into something the existing parser can read.
 *
 * Two passes, in order of how much they can be trusted:
 *
 * 1. **schema.org `JobPosting` in JSON-LD.** Greenhouse, Personio, StepStone,
 *    Indeed and the Bundesagentur all emit it, because Google for Jobs
 *    requires it. When it is there it is the employer's own structured data -
 *    not a guess - so those fields come back separately and the caller marks
 *    them `high`.
 * 2. **The visible text**, for everything JSON-LD does not carry (contact
 *    person, phone, e-mail) and for pages that have no JSON-LD at all. This
 *    feeds the same `parseJobText` pipeline a pasted ad goes through.
 *
 * Deliberately regex-based rather than a DOM parser: the input is a single
 * document we only ever read text out of, never render or re-serialize, and
 * a parser dependency for that is 100 KB to answer a question `replace()`
 * already answers. Malformed markup degrades to slightly messier text, which
 * the parser downstream is built to cope with anyway.
 */

/** Everything whose text content is never part of the ad itself. */
const DROPPED_ELEMENTS =
	/<(script|style|noscript|svg|iframe|template|head)\b[^>]*>[\s\S]*?<\/\1>/gi;

/** Tags that end a visual block and must not glue two lines together. */
const BLOCK_END =
	/<\/(p|div|section|article|header|footer|li|ul|ol|tr|h[1-6]|blockquote|pre|td|th)\s*>/gi;

const NAMED_ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' ',
	shy: '',
	auml: 'ä',
	ouml: 'ö',
	uuml: 'ü',
	Auml: 'Ä',
	Ouml: 'Ö',
	Uuml: 'Ü',
	szlig: 'ß',
	euro: '€',
	bdquo: '„',
	ldquo: '“',
	rdquo: '”',
	lsquo: '‘',
	rsquo: '’',
	ndash: '–',
	mdash: '—',
	hellip: '…',
	bull: '•',
	middot: '·',
	deg: '°',
	copy: '©',
	reg: '®',
	trade: '™'
};

export function decodeEntities(text: string): string {
	return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{1,31});/g, (match, entity: string) => {
		if (entity.startsWith('#')) {
			const code =
				entity[1] === 'x' || entity[1] === 'X'
					? Number.parseInt(entity.slice(2), 16)
					: Number.parseInt(entity.slice(1), 10);
			// Surrogates and out-of-range code points would throw; a literal
			// "&#xD800;" in the output is a better outcome than a failed import.
			if (!Number.isFinite(code) || code < 1 || code > 0x10ffff) return match;
			if (code >= 0xd800 && code <= 0xdfff) return match;
			return String.fromCodePoint(code);
		}
		return NAMED_ENTITIES[entity] ?? match;
	});
}

/** Strips markup down to the text a reader would see, one block per line. */
export function htmlToText(html: string): string {
	return (
		decodeEntities(
			html
				.replace(DROPPED_ELEMENTS, ' ')
				.replace(/<!--[\s\S]*?-->/g, ' ')
				.replace(/<br\s*\/?>/gi, '\n')
				.replace(BLOCK_END, '\n')
				.replace(/<[^>]*>/g, ' ')
		)
			.split('\n')
			// Collapse runs of spaces/tabs inside a line, but keep the line breaks -
			// the parser's structural signals are entirely line-based. Stripping an
			// inline tag leaves a space behind, so "<b>Svelte</b>." would otherwise
			// come out as "Svelte ." and no longer match anything.
			.map((line) =>
				line
					.replace(/[^\S\n]+/g, ' ')
					.replace(/ +([.,;:!?)\]])/g, '$1')
					.trim()
			)
			.join('\n')
			.replace(/\n{3,}/g, '\n\n')
			.trim()
	);
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function asRecord(value: JsonValue | undefined): Record<string, JsonValue> | undefined {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, JsonValue>)
		: undefined;
}

function asText(value: JsonValue | undefined): string {
	if (typeof value === 'string') return value.trim();
	if (typeof value === 'number') return String(value);
	if (Array.isArray(value)) return value.map(asText).filter(Boolean).join(', ');
	const record = asRecord(value);
	// schema.org routinely nests the readable value one level down.
	if (record) return asText(record.name ?? record.value ?? record['@value']);
	return '';
}

/** Walks a parsed JSON-LD blob (object, array or @graph) for the JobPosting. */
function findJobPosting(node: JsonValue, depth = 0): Record<string, JsonValue> | undefined {
	if (depth > 6 || !node || typeof node !== 'object') return undefined;
	if (Array.isArray(node)) {
		for (const item of node) {
			const found = findJobPosting(item, depth + 1);
			if (found) return found;
		}
		return undefined;
	}
	const record = node as Record<string, JsonValue>;
	const type = record['@type'];
	const types = Array.isArray(type) ? type.map(asText) : [asText(type)];
	if (types.includes('JobPosting')) return record;
	for (const key of ['@graph', 'mainEntity', 'itemListElement']) {
		const found = record[key] ? findJobPosting(record[key], depth + 1) : undefined;
		if (found) return found;
	}
	return undefined;
}

function readLocation(posting: Record<string, JsonValue>): string {
	if (asText(posting.jobLocationType).toUpperCase().includes('TELECOMMUTE')) return 'Remote';
	const location = Array.isArray(posting.jobLocation)
		? asRecord(posting.jobLocation[0])
		: asRecord(posting.jobLocation);
	const address = asRecord(location?.address) ?? location;
	if (!address) return '';
	const parts = [asText(address.postalCode), asText(address.addressLocality)].filter(Boolean);
	return parts.join(' ') || asText(address.addressRegion);
}

/**
 * `identifier` is either a bare string or a PropertyValue, and for that shape
 * the readable part is `value` - `name` holds the *label* ("req", "Job ID"),
 * which the generic asText() would otherwise pick up as the reference number.
 */
function readIdentifier(posting: Record<string, JsonValue>): string {
	const identifier = posting.identifier;
	if (typeof identifier === 'string' || typeof identifier === 'number') return asText(identifier);
	const record = asRecord(Array.isArray(identifier) ? identifier[0] : identifier);
	return record ? asText(record.value ?? record['@value'] ?? record.name) : '';
}

function readSalary(posting: Record<string, JsonValue>): string {
	const base = asRecord(posting.baseSalary);
	const value = asRecord(base?.value);
	if (!base || !value) return '';
	const min = asText(value.minValue);
	const max = asText(value.maxValue);
	const exact = asText(value.value);
	const amount = exact || [min, max].filter(Boolean).join(' - ');
	if (!amount) return '';
	const currency = asText(base.currency ?? base.salaryCurrency);
	const unit = asText(value.unitText);
	const UNITS: Record<string, string> = {
		HOUR: 'pro Stunde',
		DAY: 'pro Tag',
		WEEK: 'pro Woche',
		MONTH: 'pro Monat',
		YEAR: 'pro Jahr'
	};
	return [amount, currency, UNITS[unit.toUpperCase()] ?? ''].filter(Boolean).join(' ');
}

export interface ExtractedJobPage {
	/** The ad as plain text, for the heuristic parser. */
	text: string;
	/** Fields the page stated about itself - never guessed. */
	fields: Partial<ParsedJobInfo>;
}

/** Structured fields carry no confidence of their own, so cap what we take. */
const MAX_FIELD_LENGTH = 200;
/** A job ad is a few thousand characters; anything past this is boilerplate. */
const MAX_TEXT_LENGTH = 60_000;

function clean(value: string): string {
	const flat = htmlToText(value).replace(/\s+/g, ' ').trim();
	return flat.length > MAX_FIELD_LENGTH ? '' : flat;
}

export function extractJobPage(html: string, pageUrl: string): ExtractedJobPage {
	const fields: Partial<ParsedJobInfo> = {};
	let description = '';

	for (const match of html.matchAll(
		/<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
	)) {
		let parsed: JsonValue;
		try {
			parsed = JSON.parse(match[1]) as JsonValue;
		} catch {
			// A single malformed block must not cost us the others, or the page.
			continue;
		}
		const posting = findJobPosting(parsed);
		if (!posting) continue;

		const organization = asRecord(posting.hiringOrganization);
		const candidates: Partial<ParsedJobInfo> = {
			title: clean(asText(posting.title)),
			company: clean(asText(organization?.name ?? posting.hiringOrganization)),
			location: clean(readLocation(posting)),
			salary: clean(readSalary(posting)),
			referenceNumber: clean(readIdentifier(posting)),
			url: clean(asText(posting.url)) || pageUrl
		};
		for (const [key, value] of Object.entries(candidates)) {
			if (value) fields[key as keyof ParsedJobInfo] = value;
		}
		description = htmlToText(asText(posting.description));
		break;
	}

	const title = decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '').trim();
	const body = htmlToText(html);

	// The JSON-LD description first: it is the ad itself, without the site's
	// navigation, cookie banner and footer wrapped around it. The full page
	// text still follows, because the contact block often sits outside the
	// posting object.
	const text = [title, description, body].filter(Boolean).join('\n\n').slice(0, MAX_TEXT_LENGTH);

	if (!fields.url) fields.url = pageUrl;
	return { text, fields };
}
