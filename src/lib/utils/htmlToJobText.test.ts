import { describe, it, expect } from 'vitest';
import { decodeEntities, extractJobPage, htmlToText } from './htmlToJobText.js';

describe('decodeEntities', () => {
	it('decodes the named entities a German job ad actually contains', () => {
		expect(decodeEntities('Gesch&auml;ftsf&uuml;hrer &amp; Co. &euro;50.000')).toBe(
			'Geschäftsführer & Co. €50.000'
		);
	});

	it('decodes decimal and hexadecimal references', () => {
		expect(decodeEntities('&#8364;60.000 &#x2013; &#x20AC;70.000')).toBe('€60.000 – €70.000');
	});

	it('leaves an unknown or malformed entity as written rather than dropping it', () => {
		expect(decodeEntities('R&D &notanentity; a&b')).toBe('R&D &notanentity; a&b');
		expect(decodeEntities('&#xD800;')).toBe('&#xD800;');
	});
});

describe('htmlToText', () => {
	it('drops script and style content instead of reading it as ad text', () => {
		const text = htmlToText(
			'<style>.a{color:red}</style><p>Wir suchen</p><script>track("x")</script>'
		);
		expect(text).toBe('Wir suchen');
	});

	it('breaks lines on block ends, so the line-based parser sees real structure', () => {
		expect(htmlToText('<li>Vue</li><li>TypeScript</li>')).toBe('Vue\nTypeScript');
		expect(htmlToText('Zeile eins<br>Zeile zwei')).toBe('Zeile eins\nZeile zwei');
	});

	it('does not glue two blocks into one word', () => {
		expect(htmlToText('<h1>Frontend Developer</h1><p>Acme GmbH</p>')).toBe(
			'Frontend Developer\nAcme GmbH'
		);
	});

	it('collapses runs of whitespace within a line but keeps the line breaks', () => {
		// At most one blank line survives between two blocks: the parser reads a
		// blank line as a block boundary, but three of them as nothing extra.
		expect(htmlToText('<p>viel    Luft</p>\n\n\n<p>hier</p>')).toBe('viel Luft\n\nhier');
	});

	it('does not leave a space in front of punctuation when an inline tag is stripped', () => {
		expect(htmlToText('<p>Wir nutzen <b>Svelte</b>.</p>')).toBe('Wir nutzen Svelte.');
	});
});

const JSON_LD = {
	'@context': 'https://schema.org',
	'@type': 'JobPosting',
	title: 'Senior Frontend Developer (m/w/d)',
	identifier: { '@type': 'PropertyValue', name: 'req', value: 'REQ-2026-118' },
	hiringOrganization: { '@type': 'Organization', name: 'Acme Softwarehaus GmbH' },
	jobLocation: {
		'@type': 'Place',
		address: { '@type': 'PostalAddress', postalCode: '80331', addressLocality: 'München' }
	},
	baseSalary: {
		'@type': 'MonetaryAmount',
		currency: 'EUR',
		value: { '@type': 'QuantitativeValue', minValue: 65000, maxValue: 80000, unitText: 'YEAR' }
	},
	description: '<p>Du baust unser Portal mit <b>Svelte</b>.</p>'
};

function page(jsonLd: unknown, body = '<p>Kontakt: bewerbung@acme.de</p>'): string {
	return [
		'<html><head><title>Senior Frontend Developer | Acme</title>',
		`<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`,
		`</head><body>${body}</body></html>`
	].join('');
}

describe('extractJobPage', () => {
	it('reads the employer’s own structured data rather than guessing at it', () => {
		const { fields } = extractJobPage(page(JSON_LD), 'https://acme.de/jobs/42');
		expect(fields).toMatchObject({
			title: 'Senior Frontend Developer (m/w/d)',
			company: 'Acme Softwarehaus GmbH',
			location: '80331 München',
			salary: '65000 - 80000 EUR pro Jahr',
			referenceNumber: 'REQ-2026-118'
		});
	});

	it('finds a JobPosting nested inside an @graph', () => {
		const wrapped = {
			'@context': 'https://schema.org',
			'@graph': [{ '@type': 'WebSite' }, JSON_LD]
		};
		expect(extractJobPage(page(wrapped), 'https://acme.de/x').fields.company).toBe(
			'Acme Softwarehaus GmbH'
		);
	});

	it('marks a remote posting as such', () => {
		const remote = { ...JSON_LD, jobLocationType: 'TELECOMMUTE' };
		expect(extractJobPage(page(remote), 'https://acme.de/x').fields.location).toBe('Remote');
	});

	it('survives a malformed JSON-LD block instead of losing the whole page', () => {
		const html = [
			'<html><head><title>Stelle</title>',
			'<script type="application/ld+json">{ this is not json </script>',
			`<script type="application/ld+json">${JSON.stringify(JSON_LD)}</script>`,
			'</head><body><p>Text</p></body></html>'
		].join('');
		expect(extractJobPage(html, 'https://acme.de/x').fields.company).toBe('Acme Softwarehaus GmbH');
	});

	it('falls back to the page URL when the posting names none', () => {
		const { fields } = extractJobPage(
			'<html><body>Kein JSON-LD</body></html>',
			'https://acme.de/9'
		);
		expect(fields.url).toBe('https://acme.de/9');
		expect(fields.company).toBeUndefined();
	});

	it('keeps the contact block from the page body, which JSON-LD rarely carries', () => {
		const { text } = extractJobPage(page(JSON_LD), 'https://acme.de/x');
		expect(text).toContain('bewerbung@acme.de');
		expect(text).toContain('Du baust unser Portal mit Svelte.');
	});

	it('refuses an over-long "field", which is a description in the wrong slot', () => {
		const bloated = { ...JSON_LD, hiringOrganization: { name: 'A'.repeat(500) } };
		expect(extractJobPage(page(bloated), 'https://acme.de/x').fields.company).toBeUndefined();
	});
});
