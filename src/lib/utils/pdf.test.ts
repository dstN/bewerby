import { describe, it, expect } from 'vitest';
import {
	parseJobDetailsFromText,
	validatePdfFile,
	PdfProcessingError,
	MAX_PDF_SIZE_BYTES
} from './pdf.js';

describe('parseJobDetailsFromText', () => {
	it('does not mistake an invoice/order number for a phone number', () => {
		const text = `Musterfirma GmbH
Rechnung Nr. 2024-0158934
Datum: 15.03.2024

Sehr geehrte Damen und Herren,

vielen Dank für Ihre Bestellung.
`;
		expect(parseJobDetailsFromText(text).contactPhone).toBe('');
	});

	it('excludes an invoice number by nearby context even when it is not close to the document edges', () => {
		const filler = 'Filler line to push content past the 350-character boundary. '.repeat(6);
		const text = `Musterfirma GmbH\n${filler}\nTel: +49 40 55566677\nRechnung Nr. 2024-9988776\n${filler}`;
		const result = parseJobDetailsFromText(text);
		expect(result.contactPhone.replace(/\D/g, '')).not.toContain('20249988776');
		expect(result.contactPhone.replace(/\s/g, '')).toBe('+494055566677');
	});

	it('extracts a real phone number labeled "Tel:" even near the document start', () => {
		const text = `Ansprechpartner: Herr Max Mustermann
Tel: +49 30 12345678
E-Mail: max@example.com

Sehr geehrter Herr Mustermann,
`;
		expect(parseJobDetailsFromText(text).contactPhone.replace(/\s/g, '')).toContain('4930123456');
	});

	it('does not misclassify a formal (Sie-form) German job posting as a cover letter', () => {
		const text = `Musterfirma AG

Stellenausschreibung: Frontend Entwickler (m/w/d)

Ihre Aufgaben:
- Entwicklung von Webanwendungen
- Zusammenarbeit im Team

Ihr Profil:
- Erfahrung mit JavaScript
- Teamfähigkeit

Wir bieten:
- Flexible Arbeitszeiten

Sehr geehrte Bewerberinnen und Bewerber, wir freuen uns auf Ihre Bewerbung.

Kontakt: Recruiting-Team
Tel: +49 89 987654321
E-Mail: jobs@musterfirma.de
`;
		const result = parseJobDetailsFromText(text);
		expect(result.contactPhone.replace(/\s/g, '')).toContain('4989987654321');
		expect(result.contactEmail).toBe('jobs@musterfirma.de');
	});

	it('still extracts a match at index 0 (match.index falsy-zero edge case)', () => {
		const text = 'max@example.com is my email, and my number is +49 176 12345678 for contact.';
		expect(parseJobDetailsFromText(text).contactEmail).toBe('max@example.com');
	});

	it('does not show super-linear slowdown on pathological input (catastrophic backtracking check)', () => {
		const small = 'Dear ' + 'a '.repeat(40) + 'B!';
		const large = 'Dear ' + 'a '.repeat(80) + 'B!';

		const t0 = performance.now();
		parseJobDetailsFromText(small);
		const elapsedSmall = performance.now() - t0;

		const t1 = performance.now();
		parseJobDetailsFromText(large);
		const elapsedLarge = performance.now() - t1;

		// A doubling of pathological input should not blow up runtime;
		// generous multiplier/floor to keep this stable across machines.
		expect(elapsedLarge).toBeLessThan(elapsedSmall * 20 + 100);
	});

	it('returns empty contact fields for text with no extractable contact info', () => {
		// There is no longer a "first line of the document" fallback for the
		// company: it blindly promoted page furniture to an employer name, and
		// because autofill only writes into empty fields, a wrong value beat a
		// missing one. Every field now stays empty unless something justified it.
		const result = parseJobDetailsFromText('Just some unrelated text with no structure.');
		expect(result.contactEmail).toBe('');
		expect(result.contactPhone).toBe('');
		expect(result.title).toBe('');
		expect(result.company).toBe('');
	});
});

describe('validatePdfFile', () => {
	function makeFile(bytes: Uint8Array, name = 'test.pdf'): File {
		return new File([bytes as BlobPart], name, { type: 'application/pdf' });
	}

	it('accepts a file with a valid %PDF- header under the size limit', async () => {
		const bytes = new TextEncoder().encode('%PDF-1.4\n...');
		await expect(validatePdfFile(makeFile(bytes))).resolves.toBeUndefined();
	});

	it('rejects a file without a %PDF- header', async () => {
		const bytes = new TextEncoder().encode('this is not a pdf');
		await expect(validatePdfFile(makeFile(bytes))).rejects.toMatchObject({
			code: 'not-a-pdf'
		});
	});

	it('rejects a file over the size limit even with a valid header', async () => {
		const bytes = new Uint8Array(MAX_PDF_SIZE_BYTES + 1);
		bytes.set(new TextEncoder().encode('%PDF-'));
		await expect(validatePdfFile(makeFile(bytes))).rejects.toMatchObject({
			code: 'too-large'
		});
	});

	it('throws a PdfProcessingError instance, not a generic Error', async () => {
		const bytes = new TextEncoder().encode('nope');
		try {
			await validatePdfFile(makeFile(bytes));
			expect.unreachable('should have thrown');
		} catch (err) {
			expect(err).toBeInstanceOf(PdfProcessingError);
		}
	});
});
