/**
 * Layout-aware normalization of extracted PDF text.
 *
 * Everything in here is deliberately source- and industry-agnostic: it repairs
 * artefacts of PDF text extraction (letter-spaced headings, hard-wrapped
 * headlines, tokens torn apart by the line reconstruction, repeated page
 * furniture) rather than recognizing any particular job portal. A job ad from a
 * hospital's own website goes through exactly the same steps as one printed
 * from a job board.
 */

/** One reconstructed line of a PDF, with the geometry the parser needs. */
export interface DocLine {
	/** 1-based page number. */
	page: number;
	/** PDF user-space Y of the baseline; larger is further up the page. */
	y: number;
	/** Rendered font size in points. */
	size: number;
	bold: boolean;
	text: string;
}

/** Adjacent lines of the same size, merged back into one logical unit. */
export interface DocBlock extends DocLine {
	/** How many source lines were merged - a wrapped headline has > 1. */
	lineCount: number;
}

/** A parsed PDF, both as flat text (legacy callers) and as positioned lines. */
export interface JobDocument {
	text: string;
	lines: DocLine[];
	pageCount: number;
}

/**
 * Pulls apart a headline that was set with `letter-spacing`, where every glyph
 * arrives as its own text item and the line reconstruction joins them with
 * spaces ("F R O N T E N D" -> "FRONTEND").
 *
 * Guarded twice over so ordinary prose is never touched: it needs at least four
 * tokens and a clear majority of them must be single characters. A real
 * sentence never looks like that, and neither does a spaced phone number
 * ("+49 30 12 34 56"), whose groups are two digits wide.
 */
export function unspaceLetterSpacing(text: string): string {
	const tokens = text.trim().split(/\s+/);
	if (tokens.length < 4) return text;

	const singles = tokens.filter((token) => token.length === 1).length;
	if (singles / tokens.length < 0.6) return text;

	return tokens.join('');
}

/**
 * Rejoins tokens the Y-coordinate line reconstruction split in the middle.
 * Observed for real in a browser "print to PDF" capture, where an address came
 * out as `info@feneco n.de` - the glyph run happened to be interrupted, and a
 * space was inserted between the two halves of the domain.
 */
export function repairSplitTokens(text: string): string {
	return (
		text
			// e-mail: the part after @ must not contain spaces
			.replace(/(@[A-Za-z0-9.-]*)\s+([A-Za-z0-9-]*\.[A-Za-z]{2,})/g, '$1$2')
			// URL host: same idea, but anchored on the scheme so ordinary prose
			// containing a dotted abbreviation is left alone
			.replace(/(https?:\/\/[A-Za-z0-9./-]*)\s+([A-Za-z0-9-]*\.[A-Za-z]{2,})/g, '$1$2')
	);
}

/** Portal chrome that carries no information about the job itself. */
const NOISE_LINES = [
	'impressum',
	'datenschutz',
	'datenschutzerklärung',
	'agb',
	'newsletter',
	'zur anmeldung',
	'alle stellen anzeigen',
	'in neuem tab öffnen',
	'cookie-einstellungen',
	'cookies',
	'zum inhalt springen',
	'skip to content',
	'privacy policy',
	'terms of service',
	'imprint'
];

function normalizeForComparison(text: string): string {
	return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Drops running headers/footers and portal chrome.
 *
 * The rule is purely structural, so it needs no knowledge of the source: a line
 * that appears verbatim on three or more pages *and sits in the page margin* is
 * page furniture. Both halves matter. Repetition alone was not enough - a job
 * board prints the employer name in every page header and again in the contact
 * block, and dropping every copy cost the company field in three of five real
 * ads. It only engages from three pages up, because in a two-page document a
 * repeated line is as likely to be content.
 */
export function stripBoilerplate(lines: DocLine[]): DocLine[] {
	const pagesByText = new Map<string, Set<number>>();
	for (const line of lines) {
		const key = normalizeForComparison(line.text);
		if (!key) continue;
		let pages = pagesByText.get(key);
		if (!pages) {
			pages = new Set();
			pagesByText.set(key, pages);
		}
		pages.add(line.page);
	}

	// Running headers are defined by sitting in the page margin, not by
	// repetition alone. Dropping every repeated line cost the employer name in
	// three of five real ads, because a job board prints it in the header of
	// every page *and* in the contact block - so only the margin copies go.
	const bounds = new Map<number, { min: number; max: number }>();
	for (const line of lines) {
		const current = bounds.get(line.page);
		if (!current) {
			bounds.set(line.page, { min: line.y, max: line.y });
		} else {
			current.min = Math.min(current.min, line.y);
			current.max = Math.max(current.max, line.y);
		}
	}

	const pageCount = bounds.size;

	function isInMargin(line: DocLine): boolean {
		const page = bounds.get(line.page);
		if (!page) return false;
		const span = page.max - page.min;
		if (span <= 0) return false;
		const offset = (line.y - page.min) / span;
		return offset >= 0.88 || offset <= 0.12;
	}

	return lines.filter((line) => {
		const key = normalizeForComparison(line.text);
		if (!key) return false;
		if (NOISE_LINES.includes(key)) return false;
		const repeated = pageCount >= 3 && (pagesByText.get(key)?.size ?? 0) >= 3;
		if (repeated && isInMargin(line)) return false;
		return true;
	});
}

/**
 * Merges adjacent lines that share a font size into one block, which is how a
 * headline that wrapped ("Full Stack Developer (m/w/d) mit Schwerpunkt" /
 * "TypeScript") becomes whole again. Sizes are compared with a small tolerance
 * because renderers round differently per glyph run.
 */
export function groupBlocks(lines: DocLine[], maxGapFactor = 1.8): DocBlock[] {
	const blocks: DocBlock[] = [];

	for (const line of lines) {
		const previous = blocks[blocks.length - 1];
		const sameSize = previous && Math.abs(previous.size - line.size) <= 0.5;
		const samePage = previous && previous.page === line.page;
		// Lines flow top-down, so a following line sits at a smaller Y. Anything
		// further away than a plausible line height starts a new block.
		const adjacent =
			previous && previous.y - line.y > 0 && previous.y - line.y <= line.size * maxGapFactor;

		if (previous && sameSize && samePage && adjacent) {
			// A headline broken after a hyphen ("FRONTEND-" / "ENTWICKLER")
			// must close up again rather than gain a space.
			const joiner = /[-–]$/.test(previous.text) ? '' : ' ';
			previous.text = `${previous.text}${joiner}${line.text}`.replace(/\s+/g, ' ').trim();
			previous.y = line.y;
			previous.lineCount += 1;
			previous.bold = previous.bold || line.bold;
			continue;
		}

		blocks.push({ ...line, lineCount: 1 });
	}

	return blocks;
}

/**
 * Gender markers are the single most reliable sign that a line is a German job
 * title, and they are entirely independent of the profession - a bakery and a
 * hospital tag their vacancies exactly like a software company does.
 */
export const GENDER_TAG_REGEX =
	/\((?:\s*[mwfdxiw]\s*[/|,]\s*){1,3}[mwfdxiw]\s*\)|\(\s*(?:all\s+genders|gn|divers?)\s*\)|[a-zäöüß]{3,}(?:\*in|:in|_in|\/-in|\(in\))\b/i;

/** Section headings look alike across industries and languages. */
const SECTION_HEADING_STEMS = [
	'aufgabe',
	'profil',
	'anforderung',
	'qualifikation',
	'wir bieten',
	'das bieten wir',
	'benefit',
	'einleitung',
	'über uns',
	'about us',
	'mission',
	'know-how',
	'das bringst du mit',
	'das erwartet dich',
	'was dich erwartet',
	'über die stelle',
	'deine chance',
	'kontakt',
	'contact',
	'responsibilities',
	'requirements',
	'what we offer',
	'your profile',
	'job description',
	'stellenbeschreibung',
	'informationen zur bewerbung',
	'bewerben sie sich',
	'jetzt bewerben'
];

/**
 * A short generic label like "Aufgaben" or "Dein Profil" is set large enough to
 * outrank the employer name in the type hierarchy, so the company heuristic has
 * to be able to skip it.
 */
export function isSectionHeading(text: string): boolean {
	const normalized = normalizeForComparison(text);
	if (!normalized || normalized.length > 40) return false;
	return SECTION_HEADING_STEMS.some((stem) => normalized.includes(stem));
}

/**
 * German job ads announce the vacancy with a small set of stock phrases, and
 * the title follows immediately - either on the same line or the next one.
 * Grammar of the genre, not vocabulary of a trade, so it holds for any job.
 */
export const VACANCY_PHRASE_REGEX =
	/(?:such(?:en|t)\s+wir(?:\s+(?:zum\s+nächstmöglichen\s+zeitpunkt|ab\s+sofort))?|wir\s+suchen|zur\s+verstärkung\s+unseres\s+teams|zur\s+unterstützung\s+unseres\s+teams|we\s+are\s+(?:looking\s+for|hiring|seeking)|verstärke\s+unser\s+team)\s*(?:eine[/\\]?n|einen|eine|ein|a|an)?\s*:?\s*(.*)$/i;

/** Applies the per-line repairs that every downstream step depends on. */
export function normalizeLine(text: string): string {
	return repairSplitTokens(unspaceLetterSpacing(text.trim())).replace(/\s+/g, ' ').trim();
}
