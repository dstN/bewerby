import { describe, it, expect } from 'vitest';
import {
	applyTemplate,
	buildSalutation,
	buildTemplateContext,
	tidyFilledTemplate
} from './coverLetterTemplate.js';
import { emptyProfile } from './profile.js';

describe('buildSalutation', () => {
	it('uses an honorific the ad actually supplied', () => {
		expect(buildSalutation('Frau Musterfrau')).toBe('Sehr geehrte Frau Musterfrau,');
		expect(buildSalutation('Herr Mustermann')).toBe('Sehr geehrter Herr Mustermann,');
		expect(buildSalutation('Herrn Mustermann')).toBe('Sehr geehrter Herr Mustermann,');
	});

	it('never guesses a gender from a bare first name', () => {
		// Getting this wrong misgenders a real person on the first line of a job
		// application, and a name carries no reliable signal - so the neutral
		// form is used instead of a coin flip.
		expect(buildSalutation('Petra Musterfrau')).toBe('Guten Tag Petra Musterfrau,');
		expect(buildSalutation('Kim Schmidt')).toBe('Guten Tag Kim Schmidt,');
	});

	it('falls back to the collective form without a name', () => {
		expect(buildSalutation('')).toBe('Sehr geehrte Damen und Herren,');
		expect(buildSalutation('   ')).toBe('Sehr geehrte Damen und Herren,');
	});

	it('handles English', () => {
		expect(buildSalutation('', 'en')).toBe('Dear Sir or Madam,');
		expect(buildSalutation('Ms. Doe', 'en')).toBe('Dear Ms. Doe,');
		expect(buildSalutation('Alex Doe', 'en')).toBe('Dear Alex Doe,');
	});
});

describe('applyTemplate', () => {
	const context = buildTemplateContext(
		{
			company: 'antony Groupware GmbH',
			title: 'Senior Frontend-Entwickler/in (m, w, d)',
			contactName: 'Frau Musterfrau',
			location: 'Bocholt',
			referenceNumber: '10001-1001186884-S'
		},
		{ ...emptyProfile(), senderName: 'Max Beispiel', senderCity: '12345 Musterstadt' },
		'de',
		new Date(2026, 8, 6)
	);

	it('fills German placeholders', () => {
		expect(applyTemplate('Bewerbung als {{titel}} bei {{firma}}', context)).toBe(
			'Bewerbung als Senior Frontend-Entwickler/in (m, w, d) bei antony Groupware GmbH'
		);
	});

	it('accepts the English spelling of the same slot', () => {
		expect(applyTemplate('{{company}} / {{firma}}', context)).toBe(
			'antony Groupware GmbH / antony Groupware GmbH'
		);
	});

	it('derives the salutation', () => {
		expect(applyTemplate('{{anrede}}', context)).toBe('Sehr geehrte Frau Musterfrau,');
	});

	it('uses the sender city and a formatted date for the dateline', () => {
		expect(applyTemplate('{{ort}}, den {{datum}}', context)).toBe('Musterstadt, den 06.09.2026');
	});

	it('tolerates whitespace inside the braces', () => {
		expect(applyTemplate('{{  firma  }}', context)).toBe('antony Groupware GmbH');
	});

	it('leaves an unknown placeholder visible rather than blanking it', () => {
		expect(applyTemplate('{{gibtesnicht}}', context)).toBe('{{gibtesnicht}}');
	});

	it('fills an empty slot with nothing', () => {
		const bare = buildTemplateContext(
			{ company: 'X GmbH', title: 'Y', contactName: '', location: '', referenceNumber: '' },
			emptyProfile(),
			'de',
			new Date(2026, 8, 6)
		);
		expect(applyTemplate('Referenz: {{referenz}}', bare)).toBe('Referenz: ');
	});
});

describe('tidyFilledTemplate', () => {
	it('drops a reference line that lost its number', () => {
		expect(tidyFilledTemplate('Betreff: Bewerbung\nReferenz:\n\nSehr geehrte')).toBe(
			'Betreff: Bewerbung\n\nSehr geehrte'
		);
	});

	it('collapses runs of blank lines', () => {
		expect(tidyFilledTemplate('a\n\n\n\nb')).toBe('a\n\nb');
	});

	it('keeps a reference line that has a number', () => {
		expect(tidyFilledTemplate('Referenz: ABC-1')).toBe('Referenz: ABC-1');
	});
});
