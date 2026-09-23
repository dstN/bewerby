import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
	parseJobDocument,
	parseJobDetailsFromText,
	parseJobText,
	type ParsedJobInfo
} from './jobParse.js';
import type { DocLine, JobDocument } from './jobText.js';

const FIXTURE_DIR = path.join(process.cwd(), 'src/lib/utils/fixtures/job-postings');

function loadFixture(name: string): JobDocument {
	const raw = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, `${name}.json`), 'utf8')) as {
		lines: DocLine[];
		pageCount: number;
	};
	return {
		text: raw.lines.map((entry) => entry.text).join('\n'),
		lines: raw.lines,
		pageCount: raw.pageCount
	};
}

/**
 * Builds a document whose type sizes carry a real hierarchy, the way any laid
 * out job ad does. Used for the synthetic cases so they exercise the same
 * typography path the real fixtures do.
 */
function buildDoc(entries: [size: number, text: string][]): JobDocument {
	const lines: DocLine[] = entries.map(([size, text], index) => ({
		page: 1,
		y: 780 - index * 24,
		size,
		bold: false,
		text
	}));
	return { text: lines.map((line) => line.text).join('\n'), lines, pageCount: 1 };
}

describe('parseJobDocument - real job ads', () => {
	/**
	 * Five real ads: four printed from one job board, one from a company's own
	 * careers page. Everything here goes through the generic pipeline - there
	 * is deliberately no per-source profile, so a green test cannot be the
	 * result of having tuned the parser to one portal.
	 */
	const cases: [fixture: string, hints: { fileName?: string }, expected: Partial<ParsedJobInfo>][] =
		[
			[
				'frontend-entwickler-m-w-d-www-fenecon-de',
				{ fileName: 'Frontend-Entwickler (m_w_d) _ www.fenecon.de.pdf' },
				{
					title: 'FRONTEND-ENTWICKLER (M/W/D)',
					company: 'Fenecon',
					contactName: 'Petra Musterfrau',
					contactEmail: 'jobs@fenecon.de',
					contactPhone: '+49 9900-1230 456',
					url: 'https://www.fenecon.de'
				}
			],
			[
				'full-stack-developer-m-w-d-mit-schwerpunkt-typescript-jobsuc',
				{},
				{
					title: 'Full Stack Developer (m/w/d) mit Schwerpunkt TypeScript',
					company: 'NGB GmbH',
					contactName: 'Anton Mustermann',
					contactEmail: 'bewerbung@ngb-gmbh.de',
					salary: '30.000,00€ - 60.000,00€ pro Jahr',
					location: 'Müncheberg',
					referenceNumber: '10000-1207310008-S'
				}
			],
			[
				'senior-frontend-developer-m-w-d-jobsuche-der-ba',
				{},
				{
					title: 'Senior Frontend Developer (m/w/d)',
					company: 'FAAREN GmbH',
					location: 'Würzburg',
					referenceNumber: '10001-1001294763-S',
					// The ad names no contact person and gives no address.
					contactName: '',
					contactEmail: '',
					contactPhone: ''
				}
			],
			[
				'senior-frontend-entwickler-in-m-w-d-jobsuche-der-ba',
				{},
				{
					title: 'Senior Frontend-Entwickler/in (m, w, d)',
					company: 'antony Groupware GmbH',
					salary: '54.000 € - 60.000 €',
					location: 'Bocholt',
					referenceNumber: '10001-1001186884-S',
					contactPhone: ''
				}
			],
			[
				'senior-frontend-entwickler-in-web-jobsuche-der-ba',
				{},
				{
					title: 'Senior Frontend Entwickler*in (Web)',
					company: 'Strucnamics Engineering GmbH',
					contactName: 'Marcel Musterberg',
					contactEmail: 'info@strucnamics.de',
					contactPhone: '+49 351 12345678',
					salary: '55.000 € – 70.000 €/Jahr',
					location: 'Dresden',
					referenceNumber: '10001-1003492160-S'
				}
			]
		];

	it.each(cases)('extracts the expected fields from %s', (fixture, hints, expected) => {
		const result = parseJobDocument(loadFixture(fixture), hints);
		expect(result.info).toMatchObject(expected);
	});

	it('never reports a reference number as a phone number', () => {
		// Two of the five ads previously stored "10001-1001186884-S" as the
		// recruiter's phone number.
		for (const [fixture] of cases) {
			const { info } = parseJobDocument(loadFixture(fixture));
			expect(info.contactPhone).not.toMatch(/1000\d-\d{10}/);
			if (info.referenceNumber) {
				expect(info.contactPhone.replace(/\D/g, '')).not.toBe(
					info.referenceNumber.replace(/\D/g, '')
				);
			}
		}
	});

	it('marks every value it fills with a confidence', () => {
		for (const [fixture, hints] of cases) {
			const { info, confidence } = parseJobDocument(loadFixture(fixture), hints);
			for (const [field, value] of Object.entries(info)) {
				if (value) expect(confidence[field as keyof ParsedJobInfo]).toBeDefined();
				else expect(confidence[field as keyof ParsedJobInfo]).toBeUndefined();
			}
		}
	});
});

describe('parseJobDocument - independent of the profession', () => {
	/**
	 * The signal is typography, not vocabulary. The previous implementation
	 * matched a hard-coded list of 33 IT role nouns, so none of these ads would
	 * have produced a title at all.
	 */
	it.each([
		['Pflegefachkraft (m/w/d)', 'Katholisches Klinikum Musterstadt gGmbH'],
		['Bäckereifachverkäufer/in (m/w/d)', 'Backhaus Musterbrot GmbH'],
		['Steuerfachangestellte (m/w/d)', 'Kanzlei Muster & Partner mbH'],
		['Berufskraftfahrer (m/w/d) im Nahverkehr', 'Spedition Musterfracht GmbH'],
		['Erzieher*in für unsere Kita', 'Stadtverwaltung Musterstadt']
	])('finds the title %s', (title, company) => {
		const doc = buildDoc([
			[9, 'Startseite Stellenangebote Kontakt'],
			[22, title],
			[13, company],
			[11, 'Arbeitsort'],
			[11, 'Musterstadt'],
			[11, 'Deine Aufgaben'],
			[11, 'Betreuung und Beratung im Team'],
			[11, 'E-Mail: bewerbung@musterbetrieb.de']
		]);

		const result = parseJobDocument(doc);
		expect(result.info.title).toBe(title);
		expect(result.info.company).toBe(company);
		expect(result.info.location).toBe('Musterstadt');
		expect(result.confidence.title).toBe('high');
	});

	it('falls back to the vacancy phrase when typography carries no signal', () => {
		const info = parseJobDetailsFromText(
			[
				'Musterbetrieb GmbH',
				'Zum nächstmöglichen Zeitpunkt suchen wir eine/n',
				'Pflegefachkraft (m/w/d)',
				'Deine Aufgaben: Betreuung unserer Bewohnerinnen'
			].join('\n')
		);

		expect(info.title).toBe('Pflegefachkraft (m/w/d)');
		expect(info.company).toBe('Musterbetrieb GmbH');
	});
});

describe('parseJobText', () => {
	it('carries the per-field confidence through, which the review panel needs', () => {
		const result = parseJobText(
			[
				'Musterbetrieb GmbH',
				'Wir suchen eine/n',
				'Pflegefachkraft (m/w/d)',
				'Ansprechpartner: Frau Anna Muster',
				'E-Mail: bewerbung@musterbetrieb.de'
			].join('\n')
		);

		expect(result.info.contactEmail).toBe('bewerbung@musterbetrieb.de');
		expect(result.confidence.contactEmail).toBe('high');
		// The invariant the panel relies on: no confidence without a value.
		for (const field of Object.keys(result.confidence)) {
			expect(result.info[field as keyof typeof result.info]).not.toBe('');
		}
	});

	it('returns an empty result for text that carries nothing, rather than throwing', () => {
		const result = parseJobText('   ');
		expect(result.info.company).toBe('');
		expect(result.confidence).toEqual({});
	});
});

describe('parseJobDocument - empty beats wrong', () => {
	it('returns nothing for a document that is not a job ad', () => {
		const info = parseJobDetailsFromText(
			[
				'Musterfirma GmbH',
				'Rechnung Nr. 2024-0158934',
				'Datum: 15.03.2024',
				'',
				'Sehr geehrte Damen und Herren,',
				'vielen Dank für Ihre Bestellung.'
			].join('\n')
		);

		expect(info.title).toBe('');
		expect(info.contactPhone).toBe('');
		expect(info.location).toBe('');
		expect(info.referenceNumber).toBe('');
	});

	it('returns nothing at all for unstructured text', () => {
		const info = parseJobDetailsFromText('Just some unrelated text with no structure.');
		expect(info).toEqual({
			company: '',
			title: '',
			contactName: '',
			contactEmail: '',
			contactPhone: '',
			url: '',
			salary: '',
			location: '',
			referenceNumber: ''
		});
	});

	it('does not invent a title from a document with uniform type size', () => {
		const doc = buildDoc([
			[12, 'Irgendeine Überschrift ohne Auszeichnung'],
			[12, 'Weiterer Fließtext ohne Struktur'],
			[12, 'Und noch eine Zeile']
		]);
		expect(parseJobDocument(doc).info.title).toBe('');
	});

	it('does not take the applicant for the recruiter in a cover letter', () => {
		const info = parseJobDetailsFromText(
			[
				'Max Mustermann',
				'Musterweg 1',
				'12345 Musterstadt',
				'max.mustermann@example.com',
				'',
				'Sehr geehrte Damen und Herren,',
				'hiermit bewerbe ich mich auf Ihre Stellenanzeige.',
				'Mit freundlichen Grüßen',
				'Max Mustermann'
			].join('\n')
		);

		expect(info.contactEmail).toBe('');
	});
});
