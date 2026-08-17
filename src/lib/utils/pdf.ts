import { browser } from '$app/environment';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker&url';

interface PdfTextItem {
	str?: unknown;
	transform?: number[];
	hasEOL?: boolean;
}

export interface ParsedJobInfo {
	company: string;
	title: string;
	contactName: string;
	contactEmail: string;
	contactPhone: string;
	url: string;
}

/**
 * Dynamically imports PDF.js client-side and extracts text from a PDF file.
 */
export async function extractTextFromPdf(file: File): Promise<string> {
	if (!browser) {
		throw new Error('PDF parsing can only run in the browser');
	}

	// Dynamic import of the clean browser-ready ESM bundle directly from node_modules
	// @ts-expect-error - subpath import resolves to an untyped .mjs bundle; shape matches pdfjs-dist's declared types
	const pdfjs: typeof import('pdfjs-dist') = await import('pdfjs-dist/build/pdf.min.mjs');

	// Set worker script using Vite's native asset URL
	pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

	const arrayBuffer = await file.arrayBuffer();
	const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
	const pdf = await loadingTask.promise;

	let text = '';
	for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
		const page = await pdf.getPage(pageNum);
		const content = await page.getTextContent();
		let pageText = '';
		let lastY: number | null = null;

		for (const item of content.items as unknown as PdfTextItem[]) {
			if (!item || typeof item.str !== 'string') continue;
			const currentY =
				item.transform && item.transform.length >= 6 ? Math.round(item.transform[5]) : null;

			// Insert newline if vertical position changes significantly or item has EOL flag
			if ((lastY !== null && currentY !== null && Math.abs(lastY - currentY) > 5) || item.hasEOL) {
				pageText += '\n';
			} else if (pageText.length > 0 && !pageText.endsWith('\n') && !pageText.endsWith(' ')) {
				pageText += ' ';
			}
			pageText += item.str.trim();
			if (currentY !== null) lastY = currentY;
		}
		text += pageText + '\n\n';
	}

	return text;
}

/**
 * Extracts key information from raw text using regexes and heuristics.
 */
export function parseJobDetailsFromText(text: string): ParsedJobInfo {
	const info: ParsedJobInfo = {
		company: '',
		title: '',
		contactName: '',
		contactEmail: '',
		contactPhone: '',
		url: ''
	};

	const lines = text
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter(Boolean);

	// Multi-language document classification (DE, EN, NL, FR, ES, IT)
	const isCoverLetterOrCV =
		/(?:Bewerbung|Bewerbungsschreiben|Lebenslauf|Sehr\s+geehrte|Cover\s+Letter|Curriculum\s+Vitae|Resume|Application|Dear\s+[A-Z]|Sollicitatie|Sollicitatiebrief|Curriculum|Geachte|Candidature|Lettre\s+de\s+motivation|Cher|Chère|Candidatura|Estimado|Estimada|Gentile)/i.test(
			text
		) &&
		!/(?:wir\s+suchen|unsere\s+Anforderungen|deine\s+Aufgaben|what\s+we\s+offer|qualifications|requirements|responsibilities|we\s+are\s+(?:looking|hiring|seeking)|job\s+description|wij\s+zoeken|wat\s+wij\s+bieden|jouw\s+profiel|functe-eisen|nous\s+recherchons|votre\s+profil|buscamos|cercasi|requisiti)/i.test(
			text
		);

	let candidateName = '';
	if (lines.length > 0) {
		const firstLineMatch = lines[0].match(
			/^([A-ZÄÖÜ][a-zßäöü]+[^\S\r\n]+(?:[A-ZÄÖÜ][a-zßäöü]+[^\S\r\n]+)?[A-ZÄÖÜ][a-zßäöü]+)$/
		);
		if (firstLineMatch) candidateName = firstLineMatch[1];
	}

	// 1. Extract Contact Name (info.contactName) across DE, EN, NL, FR, ES, IT
	const attentionPrefixes =
		/(?:z\.\s*H(?:d\.)?|Attn:|Attention:|t\.a\.v\.?|à\s+l['’]attention\s+de|a\s+la\s+atenci[oó]n\s+de|alla\s+cortese\s+attenzione\s+di|c\/o)[^\S\r\n]+/i;
	const honorifics =
		/(?:Herrn|Herr|Frau|Mr\.|Ms\.|Mrs\.|Dr\.|Dheer|Mevr\.|de\s+heer|mevrouw|M\.|Mme\.|Mme|Sr\.|Sra\.|Sig\.|Sig\.ra)[^\S\r\n]+/i;

	for (const line of lines) {
		if (attentionPrefixes.test(line)) {
			const cleaned = line.replace(attentionPrefixes, '').replace(honorifics, '').trim();
			if (
				cleaned &&
				!/(?:Damen|Herren|Whom|Team|Afdeling|Department|Service|HR|Personal)/i.test(cleaned)
			) {
				info.contactName = cleaned;
				break;
			}
		}
	}

	if (!info.contactName) {
		// Look for salutation across languages starting at beginning of line: Sehr geehrte(r) / Dear / Geachte / Beste / Cher / Chère / Estimado / Estimada / Gentile / Egregio
		const salutationRegex =
			/^(?:Sehr\s+geehrte(?:r)?|Dear|Geachte|Beste|Cher|Chère|Estimado|Estimada|Gentile|Egregio)[^\S\r\n]+(?:Herrn|Herr|Frau|Damen\s+und\s+Herren|Mr\.|Ms\.|Mrs\.|Dr\.|Hiring\s+Manager|Sir|Madam|Heer|Mevrouw|de\s+heer|M\.|Mme\.|Mme|Sr\.|Sra\.|Sig\.|Sig\.ra)?[^\S\r\n]*([A-ZÄÖÜ][a-zßäöü]+(?:[\s-]+(?:[a-zßäöü]+\s+)*[A-ZÄÖÜ][a-zßäöü]+)?)/i;
		for (const line of lines.slice(0, 40)) {
			const salutationMatch = line.match(salutationRegex);
			if (
				salutationMatch &&
				!/(?:Damen|Herren|Whom|Hiring|Sir|Madam|Monsieur|Madame|Señores|Team|Heer|Mevrouw|Barrierefreiheit)/i.test(
					salutationMatch[0]
				)
			) {
				const name = salutationMatch[1].replace(/[,.]$/, '').trim();
				if (
					name &&
					![
						'Damen',
						'Herren',
						'Manager',
						'Sir',
						'Madam',
						'Team',
						'Heer',
						'Mevrouw',
						'Monsieur',
						'Madame',
						'Barrierefreiheit'
					].includes(name)
				) {
					info.contactName = name;
					break;
				}
			}
		}
	}

	if (!info.contactName) {
		const contactHeaderRegex =
			/(?:Ansprechpartner|Kontakt|Ihr\s+Kontakt|Contact|Contact\s+Person|Recruiter|Contactpersoon|Contacto|Contatto):[^\S\r\n]*(?:Herr|Frau|Mr\.|Ms\.|Mrs\.|Dr\.|M\.|Mme\.|Mme)?[^\S\r\n]*([A-ZÄÖÜ][a-zßäöü]+[^\S\r\n]+(?:(?:[a-zßäöü]+\s+)*[A-ZÄÖÜ][a-zßäöü]+))/i;
		for (const line of lines) {
			const match = line.match(contactHeaderRegex);
			if (match) {
				info.contactName = match[1].trim();
				break;
			}
		}
	}

	// 2. Extract Company Name (info.company)
	// International Legal Entity Suffixes covering DE, NL, BE, FR, ES, IT, UK, US, SE, PL, Worldwide
	const companySuffixRegex =
		/(?:^|\s)(?:GmbH\s*&\s*Co\.\s*KG|GmbH|AG|SE|GbR|KG|OHG|UG|KGaA|e\.\s*V\.|GesmbH|B\.V\.|N\.V\.|V\.O\.F\.|Comm\.V|BVBA|CVBA|VZW|S\.A\.S\.|S\.A\.|SARL|EURL|SCI|SNC|SASU|S\.L\.|S\.p\.A\.|S\.r\.l\.|AB|Oy|AS|ApS|Sp\.\s*z\s*o\.o\.|Inc\.|Corp\.|Corporation|Ltd\.|Limited|LLC|PLC|Pty\s+Ltd)(?:\b|\.|$)/i;
	for (const line of lines) {
		if (companySuffixRegex.test(line)) {
			// Ensure it's not a sentence or body paragraph (should be <= 65 chars)
			if (
				line.length >= 3 &&
				line.length <= 65 &&
				!line.includes('@') &&
				!/^(?:Bewerbung|Betreff|Subject|Onderwerp|Objet|Asunto|Oggetto|Sehr\s+geehrte|Dear|Geachte|Cher|Chère|Estimado|Gentile|Ich|Wir|Als|Da|Bei|I|We|As|Since|When|Please|To|Wij|Ik|Nous|Je)/i.test(
					line
				)
			) {
				info.company = line.replace(/^[0-9.\s\-–|]+/, '').trim();
				break;
			}
		}
	}

	// Fallback for company: check recipient address block directly above street address / postal code / attention header across all countries
	if (!info.company) {
		const addressTriggerRegex =
			/(?:^z\.\s*H|^Attn:|^Attention:|^t\.a\.v\.?|^à\s+l['’]attention|^a\s+la\s+atenci[oó]n|^alla\s+cortese)/i;
		const streetRegex =
			/[A-Za-zÄÖÜäöüß]+(?:str(?:asse|aße|\.)?|road|rd|street|st|ave|avenue|blvd|lane|ln|drive|dr|way|square|sq|parkway|pkwy|weg|laan|straat|gracht|steeg|plein|rue|boulevard|via|piazza|calle|avenida)\s+\d+/i;
		const postalRegex =
			/(?:^\d{4,5}\s+[A-ZÄÖÜa-z]|^\d{4}\s+[A-Z]{2}\s+|^[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})/i;

		for (let i = 0; i < Math.min(lines.length, 30); i++) {
			const line = lines[i];
			if (addressTriggerRegex.test(line) || streetRegex.test(line) || postalRegex.test(line)) {
				for (let j = Math.max(0, i - 4); j < i; j++) {
					const candidateLine = lines[j];
					if (
						candidateLine &&
						!candidateLine.includes('@') &&
						!/^\+?\d+/.test(candidateLine) &&
						candidateLine !== candidateName &&
						candidateLine !== info.contactName &&
						!candidateLine.includes(info.contactName || '---') &&
						!/^(?:Bewerbung|Betreff|Subject|Onderwerp|Objet|Asunto|Oggetto|Datum|Date|Absender|Sender|Empfänger|Recipient|Sehr\s+geehrte|Dear|Geachte|Cher|Chère|To\s+Whom|\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|(?:January|February|March|April|May|June|July|August|September|October|November|December|Januar|Februar|März|Mai|Juni|Juli|Oktober|Dezember|Januari|Februari|Maart|Mei|Augustus|Janvier|Février|Mars|Avril|Juin|Juillet|Août|Septembre|Octobre|Novembre|Décembre)\s+\d{1,2})/i.test(
							candidateLine
						) &&
						candidateLine.length >= 2 &&
						candidateLine.length <= 55
					) {
						info.company = candidateLine.replace(/^[0-9.\s\-–|]+/, '').trim();
						break;
					}
				}
				if (info.company) break;
			}
		}
	}

	// Fallback 2 for company: take the first line of the document if it doesn't match candidate name or salutation
	if (!info.company && lines.length > 0) {
		const firstLine = lines[0];
		if (
			firstLine !== candidateName &&
			firstLine.length <= 50 &&
			!/^(?:Bewerbung|Betreff|Subject|Onderwerp|Objet|Asunto|Oggetto|Sehr\s+geehrte|Dear|Geachte|Cher|Chère|We\s+are|Wij\s+zoeken|Nous\s+recherchons)/i.test(
				firstLine
			)
		) {
			info.company = firstLine;
		}
	}

	// 3. Extract Job Title (info.title) across DE, EN, NL, FR, ES, IT
	const subjectPrefixes =
		/(?:^|Betreff:\s*|Subject:\s*|Re:\s*|Onderwerp:\s*|Objet:\s*|Asunto:\s*|Oggetto:\s*)/i;
	const applicationKeywords =
		/(?:Bewerbung|Application|Sollicitatie|Candidature|Candidatura)\s+(?:als|um|für|auf|zum|for|to|van|voor|pour|para|per|–|-)\s+(?:(?:die\s+Stelle|the\s+position|the\s+role|de\s+functie|le\s+poste|el\s+puesto|la\s+posizione)\s+(?:als|des|der|of|as|van|de|como|di)\s+)?([^\n]+)/i;

	for (const line of lines) {
		const match = line.match(new RegExp(subjectPrefixes.source + applicationKeywords.source, 'i'));
		if (match) {
			let rawTitle = match[1].trim();
			const stopIndex = rawTitle.search(
				/(?:\s*-\s*(?:Ref|Kennz|ID|Nr|Referenz|Kennziffer)|Sehr\s+geehrte|Dear|Geachte|Cher|Chère|Estimado|An\s+die|\d{2}\.\d{2}\.\d{4})/i
			);
			if (stopIndex !== -1) rawTitle = rawTitle.slice(0, stopIndex).trim();
			rawTitle = rawTitle
				.replace(/^[–-]\s*/, '')
				.replace(/[.\n\r]+$/, '')
				.trim();
			if (rawTitle.length >= 3 && rawTitle.length <= 80) {
				info.title = rawTitle;
				break;
			}
		}
	}

	// Secondary title check: (Position:/Stelle:/Jobtitel:/Vacature:/Functie:/Poste:) or international gender tags (m/w/d), (f/m/d), (m/v/x), (h/f/x)
	if (!info.title) {
		const structuralHeaderRegex =
			/(?:Position|Stelle|Jobtitel|Stellenbezeichnung|Stellenangebot|Job\s+Title|Role|Vacancy|Vacature|Functie|Poste|Puesto|Posizione):\s*([^\n]+)/i;
		for (const line of lines) {
			const headerMatch = line.match(structuralHeaderRegex);
			if (headerMatch) {
				info.title = headerMatch[1].trim();
				break;
			}
			if (
				/\(\s*[mwxfdh]\s*\/\s*[mwxfdh]\s*(?:\/\s*[mwxfdh]\s*)?\)/i.test(line) &&
				line.length <= 70
			) {
				info.title = line
					.replace(subjectPrefixes, '')
					.replace(/^[–-]\s*/, '')
					.trim();
				break;
			}
		}
	}

	if (!info.title) {
		const universalRoleKeywords = [
			'developer',
			'entwickler',
			'ontwikkelaar',
			'développeur',
			'desarrollador',
			'engineer',
			'ingenieur',
			'ingénieur',
			'designer',
			'ontwerper',
			'manager',
			'consultant',
			'adviseur',
			'architekt',
			'architect',
			'architecte',
			'specialist',
			'specialiste',
			'analyst',
			'analiste',
			'administrator',
			'beheerder',
			'leiter',
			'lead',
			'director',
			'directeur',
			'coordinator',
			'coördinator',
			'scientist',
			'officer',
			'technician',
			'technicus'
		];
		for (const line of lines.slice(0, 15)) {
			if (
				universalRoleKeywords.some((kw) => line.toLowerCase().includes(kw)) &&
				line.length >= 4 &&
				line.length <= 65 &&
				!/^(?:Sehr\s+geehrte|Dear|Geachte|Cher|Chère|Ich|Wir|Als|Da|Bei|I|We|As|Since|When|Please|To|Wij|Ik|Nous|Je)/i.test(
					line
				)
			) {
				info.title = line
					.replace(subjectPrefixes, '')
					.replace(/^[–-]\s*/, '')
					.trim();
				break;
			}
		}
	}

	// 4. Email & Phone (Universal across all countries)
	const emailMatches = [...text.matchAll(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g)];
	for (const match of emailMatches) {
		const email = match[0];
		const matchIndex = match.index || 0;
		const isApplicantEmail =
			isCoverLetterOrCV &&
			(matchIndex < 350 ||
				matchIndex > text.length - 350 ||
				(candidateName && email.toLowerCase().includes(candidateName.split(' ')[0].toLowerCase())));
		const isHrEmail =
			/^(?:jobs|karriere|bewerbung|hr|personal|recruiting|recruitment|vacatures|sollicitaties|recrutement|empleo|lavora|info|contact|welcome|careers|talent|hiring|people)@/i.test(
				email
			);
		if (isHrEmail || !isApplicantEmail) {
			info.contactEmail = email;
			break;
		}
	}

	const phoneMatches = [...text.matchAll(/\+?[0-9][0-9\s\-/()]{8,20}/g)];
	for (const match of phoneMatches) {
		const phone = match[0];
		const cleaned = phone.replace(/[\s\-/()]/g, '');
		const matchIndex = match.index || 0;
		if (cleaned.length >= 9 && cleaned.length <= 16 && /^\+?\d+$/.test(cleaned)) {
			if (isCoverLetterOrCV && (matchIndex < 350 || matchIndex > text.length - 350)) continue;
			info.contactPhone = phone.trim();
			break;
		}
	}

	// 5. URL
	const urlMatches = [
		...text.matchAll(
			/https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_+.~#?&//=]*)/gi
		)
	];
	for (const match of urlMatches) {
		const url = match[0];
		const isApplicantUrl =
			/github\.io|github\.com|cv\.|portfolio|resume|linkedin\.com\/in|xing\.com\/profile/i.test(
				url
			);
		if (!isApplicantUrl) {
			info.url = url;
			break;
		}
	}

	return info;
}
