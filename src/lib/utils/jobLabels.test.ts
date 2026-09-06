import { describe, it, expect } from 'vitest';
import { readLabelledFields } from './jobLabels.js';

describe('readLabelledFields', () => {
	it('reads "Label: Wert" from a single line and keeps the value casing', () => {
		const fields = readLabelledFields([
			'Gehalt: 30.000,00€ - 60.000,00€ pro Jahr',
			'E-Mail: Bewerbung@NGB-GmbH.de'
		]);

		expect(fields.salary).toBe('30.000,00€ - 60.000,00€ pro Jahr');
		expect(fields.contactEmail).toBe('Bewerbung@NGB-GmbH.de');
	});

	it('reads a label that sits alone on its line with the value underneath', () => {
		const fields = readLabelledFields(['Arbeitsort', 'Müncheberg', 'Angebotsart', 'Arbeit']);
		expect(fields.location).toBe('Müncheberg');
	});

	it('consumes a label that ends with both a full stop and a colon', () => {
		// "Referenz-Nr.: 10001-..." previously left the colon on the value.
		const fields = readLabelledFields(['Referenz-Nr.: 10001-1001294763-S']);
		expect(fields.referenceNumber).toBe('10001-1001294763-S');
	});

	it('prefers the longest matching label', () => {
		const fields = readLabelledFields(['Referenz-Nr.: ABC-123']);
		expect(fields.referenceNumber).toBe('ABC-123');
	});

	it('tolerates a leading icon glyph before the label', () => {
		const fields = readLabelledFields([' Arbeitsort', 'Dresden']);
		expect(fields.location).toBe('Dresden');
	});

	it('recognizes the possessive and feminine forms of "Ansprechpartner"', () => {
		expect(readLabelledFields(['Deine Ansprechpartnerin: Petra Musterfrau']).contactName).toBe(
			'Petra Musterfrau'
		);
		expect(readLabelledFields(['Ihr Ansprechpartner: Anton Mustermann']).contactName).toBe(
			'Anton Mustermann'
		);
	});

	it('does not fire on a sentence that merely starts with a label word', () => {
		// Form B needs the label alone on its line, so prose cannot trigger it.
		const fields = readLabelledFields([
			'Position im Team und Verantwortung wachsen mit dir',
			'Irgendein Folgesatz'
		]);
		expect(fields.occupation).toBeUndefined();
	});

	it('keeps only the first hit per field', () => {
		const fields = readLabelledFields(['Arbeitsort: Dresden', 'Arbeitsort: Leipzig']);
		expect(fields.location).toBe('Dresden');
	});

	it('returns nothing for text without labels', () => {
		expect(
			readLabelledFields(['Wir sind ein wachsendes Unternehmen.', 'Bewirb dich jetzt.'])
		).toEqual({});
	});
});
